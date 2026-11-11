# =============================================================================
# FILE: terraform/modules/platform/irsa.tf
# OVERVIEW: IAM roles for Kubernetes service accounts (IRSA). Each in-cluster
# controller gets its OWN narrow AWS permissions - no keys, no node-wide rights:
#   - AWS Load Balancer Controller -> create/manage ALBs
#   - ExternalDNS                  -> edit records in our Route53 zone only
#   - External Secrets Operator    -> read paytrack/<env>/* secrets only
# =============================================================================

# Role for the AWS Load Balancer Controller (policy is built into the module).
module "lb_controller_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.52"

  role_name                              = "${local.name}-lb-controller"
  attach_load_balancer_controller_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-load-balancer-controller"]
    }
  }
}

# Role for ExternalDNS, limited to our hosted zone.
module "external_dns_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.52"

  role_name                     = "${local.name}-external-dns"
  attach_external_dns_policy    = true
  external_dns_hosted_zone_arns = [data.aws_route53_zone.root.arn]

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:external-dns"]
    }
  }
}

# Need the account id to build the secret ARN pattern below.
data "aws_caller_identity" "current" {}

# Role for External Secrets Operator, limited to secrets under paytrack/<env>/.
module "eso_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.52"

  role_name                              = "${local.name}-external-secrets"
  attach_external_secrets_policy         = true
  external_secrets_secrets_manager_arns  = ["arn:aws:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:paytrack/${var.env}/*"]

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["external-secrets:external-secrets"]
    }
  }
}
