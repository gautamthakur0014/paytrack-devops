# =============================================================================
# FILE: terraform/envs/dev/outputs.tf
# OVERVIEW: Re-exports the module outputs so they show up after `terraform apply`.
# =============================================================================

# Add this IP to the MongoDB Atlas allow-list.
output "nat_public_ips" {
  value = module.platform.nat_public_ips
}

# Fill this secret with scripts/put-secrets.sh dev.
output "secret_name" {
  value = module.platform.secret_name
}

# Command to configure kubectl for this cluster.
output "kubeconfig_command" {
  value = module.platform.kubeconfig_command
}
