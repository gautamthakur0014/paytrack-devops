# =============================================================================
# FILE: terraform/bootstrap/outputs.tf
# OVERVIEW: Values you copy into LCN (nameservers) and GitHub (variables).
# =============================================================================

# STEP: paste these 4 values into LCN as the domain's nameservers.
output "name_servers" {
  value = aws_route53_zone.root.name_servers
}

# STEP: save as GitHub repo variable TF_STATE_BUCKET.
output "tfstate_bucket" {
  value = aws_s3_bucket.tfstate.bucket
}

# STEP: save as GitHub repo variable AWS_ACCOUNT_ID.
output "account_id" {
  value = data.aws_caller_identity.current.account_id
}

# Registry URL (informational).
output "ecr_registry" {
  value = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
}

# Role ARNs the workflows assume (informational; workflows build ARNs from AWS_ACCOUNT_ID).
output "gha_role_arns" {
  value = { for k, r in aws_iam_role.gha : k => r.arn }
}
