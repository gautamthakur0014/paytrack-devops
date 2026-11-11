# =============================================================================
# FILE: terraform/modules/platform/addons.tf
# OVERVIEW: Installs the 3 cluster add-ons with Helm (the app itself is
# deployed later by GitHub Actions, not by Terraform):
#   1. AWS Load Balancer Controller -> turns an Ingress into an AWS ALB
#   2. ExternalDNS                  -> creates the Route53 record for the Ingress host
#   3. External Secrets Operator    -> syncs AWS Secrets Manager -> K8s Secrets
# Chart versions are pinned. If Helm says "version not found", list valid ones
# with: helm search repo <chart> --versions
# =============================================================================

# 1) ALB controller. Needs cluster name, VPC id and region to create load balancers.
resource "helm_release" "lb_controller" {
  name       = "aws-load-balancer-controller"
  namespace  = "kube-system"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = "1.13.0"

  values = [yamlencode({
    clusterName = module.eks.cluster_name
    region      = var.region
    vpcId       = module.vpc.vpc_id
    serviceAccount = {
      create      = true
      name        = "aws-load-balancer-controller"
      annotations = { "eks.amazonaws.com/role-arn" = module.lb_controller_irsa.iam_role_arn }
    }
  })]

  depends_on = [module.eks]
}

# 2) ExternalDNS. policy=sync means records are DELETED when the Ingress is deleted
# (important for clean teardown). txtOwnerId marks records as "owned by this
# cluster" so dev and prod never overwrite each other in the shared zone.
resource "helm_release" "external_dns" {
  name       = "external-dns"
  namespace  = "kube-system"
  repository = "https://kubernetes-sigs.github.io/external-dns/"
  chart      = "external-dns"
  version    = "1.15.2"

  values = [yamlencode({
    provider      = { name = "aws" }
    sources       = ["ingress"]
    policy        = "sync"
    registry      = "txt"
    txtOwnerId    = local.name
    domainFilters = [var.app_domain]
    env           = [{ name = "AWS_DEFAULT_REGION", value = var.region }]
    serviceAccount = {
      create      = true
      name        = "external-dns"
      annotations = { "eks.amazonaws.com/role-arn" = module.external_dns_irsa.iam_role_arn }
    }
  })]

  depends_on = [module.eks]
}

# 3) External Secrets Operator (also installs the ExternalSecret/SecretStore CRDs).
resource "helm_release" "external_secrets" {
  name             = "external-secrets"
  namespace        = "external-secrets"
  create_namespace = true
  repository       = "https://charts.external-secrets.io"
  chart            = "external-secrets"
  version          = "0.14.4"

  values = [yamlencode({
    installCRDs = true
    serviceAccount = {
      create      = true
      name        = "external-secrets"
      annotations = { "eks.amazonaws.com/role-arn" = module.eso_irsa.iam_role_arn }
    }
  })]

  depends_on = [module.eks]
}
