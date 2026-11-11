# =============================================================================
# FILE: terraform/modules/platform/eks.tf
# OVERVIEW: The EKS cluster + one managed node group + who is allowed in.
# Access is via EKS "access entries" (modern replacement for aws-auth ConfigMap):
#   - GitHub deploy role  -> cluster admin (so CI can kubectl apply)
#   - extra_admin_arns    -> cluster admin (you, for kubectl)
# =============================================================================

# The GitHub deploy role is created in the bootstrap stack; we only look it up.
data "aws_iam_role" "deploy" {
  name = "paytrack-gha-deploy-${var.env}"
}

locals {
  # Policy that grants full admin inside the cluster.
  admin_policy = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  # One access entry for the CI role + one per extra admin.
  access_entries = merge(
    {
      gha_deploy = {
        principal_arn       = data.aws_iam_role.deploy.arn
        policy_associations = { admin = { policy_arn = local.admin_policy, access_scope = { type = "cluster" } } }
      }
    },
    {
      for i, arn in var.extra_admin_arns : "admin-${i}" => {
        principal_arn       = arn
        policy_associations = { admin = { policy_arn = local.admin_policy, access_scope = { type = "cluster" } } }
      }
    }
  )
}

# Cluster built with the community module.
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.37"

  cluster_name    = local.name
  cluster_version = var.cluster_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Public API endpoint so GitHub-hosted runners and your laptop can reach it.
  cluster_endpoint_public_access = true

  # Whoever runs terraform apply (the CI role) becomes admin automatically.
  enable_cluster_creator_admin_permissions = true
  access_entries                           = local.access_entries

  # Core add-ons (networking + DNS inside the cluster).
  cluster_addons = {
    coredns    = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni    = { most_recent = true, before_compute = true }
  }

  # Worker nodes. AL2023 is required on recent Kubernetes versions.
  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = [var.node_instance_type]
      min_size       = var.node_min
      max_size       = var.node_max
      desired_size   = var.node_desired
    }
  }
}
