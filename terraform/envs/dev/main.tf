# =============================================================================
# FILE: terraform/envs/dev/main.tf
# OVERVIEW: Entry point of the "dev" stack. It only wires things together:
#   - remote state in S3 (key: dev/terraform.tfstate)
#   - AWS + Helm providers
#   - ONE call to modules/platform with dev-specific values
# Run by GitHub Actions (terraform.yml) with environment "infra-dev".
# The S3 bucket name is passed at init time:
#   terraform init -backend-config="bucket=<TF_STATE_BUCKET>"
# =============================================================================

terraform {
  required_version = ">= 1.10"

  # Remote state. "use_lockfile" = S3 native locking (no DynamoDB table needed).
  backend "s3" {
    key          = "dev/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws  = { source = "hashicorp/aws", version = "~> 5.80" }
    helm = { source = "hashicorp/helm", version = "~> 2.17" }
  }
}

# Region is a variable so there is exactly one place to change it.
variable "region" {
  type    = string
  default = "ap-south-1"
}

# Optional: your own IAM user/role ARN(s) to get kubectl admin access.
variable "extra_admin_arns" {
  type    = list(string)
  default = []
}

# AWS provider; tags make every resource traceable to this env.
provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "paytrack", Environment = "dev", ManagedBy = "terraform" }
  }
}

# Helm provider logs in to the new cluster with a short-lived token from the AWS CLI.
provider "helm" {
  kubernetes {
    host                   = module.platform.cluster_endpoint
    cluster_ca_certificate = base64decode(module.platform.cluster_ca)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.platform.cluster_name, "--region", var.region]
    }
  }
}

# The whole platform for this environment. Only these values differ from the other env.
module "platform" {
  source = "../../modules/platform"

  env              = "dev"
  region           = var.region
  app_domain       = "dev.getgautam.co.uk"
  root_domain      = "getgautam.co.uk"
  vpc_cidr         = "10.10.0.0/16"
  node_desired     = 2
  extra_admin_arns = var.extra_admin_arns
}
