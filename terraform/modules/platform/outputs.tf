# =============================================================================
# FILE: terraform/modules/platform/outputs.tf
# OVERVIEW: Values the env root needs (to configure the Helm provider) and
# values YOU need (NAT IP for the Atlas allow-list, kubeconfig command).
# =============================================================================

# Used by the helm provider in envs/<env>/main.tf.
output "cluster_name" {
  value = module.eks.cluster_name
}
output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}
output "cluster_ca" {
  value = module.eks.cluster_certificate_authority_data
}

# IMPORTANT: add this IP to MongoDB Atlas "Network Access" (and Upstash if it
# restricts IPs). All outbound traffic from pods leaves through this address.
output "nat_public_ips" {
  value = module.vpc.nat_public_ips
}

# Name of the secret to fill with scripts/put-secrets.sh.
output "secret_name" {
  value = aws_secretsmanager_secret.server.name
}

# Handy copy-paste command to get kubectl access (needs your ARN in extra_admin_arns).
output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.region}"
}

# The cert is created and validated here; ALB auto-discovers it by host name.
output "certificate_arn" {
  value = aws_acm_certificate_validation.app.certificate_arn
}
