# =============================================================================
# FILE: terraform/bootstrap/variables.tf
# OVERVIEW: Inputs for the bootstrap stack.
# =============================================================================

# AWS region for everything in this project.
variable "region" {
  type    = string
  default = "ap-south-1"
}

# Root domain you bought at LCN.
variable "domain_name" {
  type    = string
  default = "getgautam.co.uk"
}

# GitHub repo allowed to deploy, in "owner/name" form. NO default on purpose.
variable "github_repo" {
  type        = string
  description = "e.g. gautam/paytrack"
}
