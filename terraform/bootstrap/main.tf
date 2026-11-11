# =============================================================================
# FILE: terraform/bootstrap/main.tf
# OVERVIEW: ONE-TIME foundation shared by dev and prod. Run once by hand.
# Creates:
#   1. S3 bucket            -> stores Terraform state for dev/prod stacks
#   2. ECR repositories     -> Docker images (built once, promoted dev -> prod)
#   3. Route53 hosted zone  -> getgautam.co.uk (you point LCN nameservers here)
#   4. GitHub OIDC + IAM    -> lets GitHub Actions log in to AWS with NO keys
# State of THIS stack stays local (chicken-and-egg: the bucket doesn't exist yet).
# =============================================================================

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.80" }
  }
}

# AWS provider; default_tags puts these tags on every resource (helps cost tracking
# and makes leftovers easy to find after teardown).
provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "paytrack", ManagedBy = "terraform", Stack = "bootstrap" }
  }
}

# Used to build globally-unique names and ARNs.
data "aws_caller_identity" "current" {}

# ─── 1. Terraform state bucket ────────────────────────────────────────────────

# Bucket that holds terraform.tfstate for each environment.
# force_destroy lets `terraform destroy` delete it even when it has files (demo project).
resource "aws_s3_bucket" "tfstate" {
  bucket        = "paytrack-tfstate-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

# Keep old versions of state so a bad apply can be recovered.
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration { status = "Enabled" }
}

# Encrypt state at rest (it can contain sensitive values).
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

# State must never be public.
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── 2. ECR repositories ──────────────────────────────────────────────────────

locals {
  ecr_repos = ["paytrack-server", "paytrack-client"]
}

# One private registry per image. Scan on push gives free basic CVE scanning.
# force_delete lets teardown remove repos that still contain images.
resource "aws_ecr_repository" "app" {
  for_each             = toset(local.ecr_repos)
  name                 = each.key
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  image_scanning_configuration { scan_on_push = true }
}

# Keep only the last 10 images per repo so storage cost stays near zero.
resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ─── 3. DNS zone ──────────────────────────────────────────────────────────────

# Hosted zone for getgautam.co.uk. After apply, copy the 4 name servers from the
# output into LCN's DNS settings. Kept here (not in dev/prod) so the nameservers
# stay the same even if you destroy and recreate clusters.
resource "aws_route53_zone" "root" {
  name          = var.domain_name
  force_destroy = true
}

# ─── 4. GitHub Actions -> AWS login (OIDC, no stored access keys) ─────────────

# Tells AWS to trust tokens issued by GitHub Actions. Only ONE of these can exist
# per AWS account; if you already have it, import it or remove this resource.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

locals {
  gh = "repo:${var.github_repo}"

  # Which GitHub job may assume which role. The "sub" claim of the token pins the
  # role to this repo AND to a branch / GitHub Environment.
  roles = {
    build       = ["${local.gh}:ref:refs/heads/main"]
    deploy-dev  = ["${local.gh}:environment:dev"]
    deploy-prod = ["${local.gh}:environment:prod"]
    terraform   = ["${local.gh}:environment:infra-dev", "${local.gh}:environment:infra-prod"]
  }
}

# Trust policy per role: "GitHub OIDC may assume me, but only for these subjects".
data "aws_iam_policy_document" "trust" {
  for_each = local.roles
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = each.value
    }
  }
}

# The four roles used by the workflows (build, deploy-dev, deploy-prod, terraform).
resource "aws_iam_role" "gha" {
  for_each           = local.roles
  name               = "paytrack-gha-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.trust[each.key].json
}

# build role: may ONLY push images to the two PayTrack ECR repos.
resource "aws_iam_role_policy" "build" {
  role = aws_iam_role.gha["build"].id
  name = "ecr-push"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
          "ecr:GetDownloadUrlForLayer", "ecr:DescribeImages"
        ]
        Resource = [for r in aws_ecr_repository.app : r.arn]
      }
    ]
  })
}

# deploy roles: may ONLY describe their own EKS cluster (needed for kubeconfig).
# What they can do INSIDE the cluster is granted by an EKS access entry (platform module).
resource "aws_iam_role_policy" "deploy" {
  for_each = toset(["dev", "prod"])
  role     = aws_iam_role.gha["deploy-${each.key}"].id
  name     = "eks-describe"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "eks:DescribeCluster"
      Resource = "arn:aws:eks:${var.region}:${data.aws_caller_identity.current.account_id}:cluster/paytrack-${each.key}"
    }]
  })
}

# terraform role: broad rights because it creates VPC/EKS/IAM.
# PORTFOLIO SHORTCUT: in a real company you would scope this down.
resource "aws_iam_role_policy_attachment" "terraform_admin" {
  role       = aws_iam_role.gha["terraform"].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
