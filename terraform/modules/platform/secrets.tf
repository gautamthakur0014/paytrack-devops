# =============================================================================
# FILE: terraform/modules/platform/secrets.tf
# OVERVIEW: Creates the EMPTY secret container in AWS Secrets Manager.
# The real values (Mongo URI, JWT keys, ...) are uploaded with
# scripts/put-secrets.sh, so they never appear in Git or Terraform state.
# =============================================================================

# One JSON secret per env: paytrack/<env>/server. The ExternalSecret in
# k8s/ reads it. recovery_window 0 = deleted immediately on teardown
# (otherwise AWS blocks re-creating the same name for 7-30 days).
resource "aws_secretsmanager_secret" "server" {
  name                    = "paytrack/${var.env}/server"
  description             = "PayTrack API environment variables (${var.env})"
  recovery_window_in_days = 0
}
