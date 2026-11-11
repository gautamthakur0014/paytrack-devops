# =============================================================================
# FILE: terraform/modules/platform/variables.tf
# OVERVIEW: Inputs of the reusable "platform" module. dev and prod call this
# same module with different values - that is the whole env difference.
# =============================================================================

# Environment name: "dev" or "prod". Used in every resource name.
variable "env" {
  type = string
}

# AWS region.
variable "region" {
  type = string
}

# Public host name of the app in this env, e.g. dev.getgautam.co.uk.
variable "app_domain" {
  type = string
}

# Domain that owns the Route53 zone, e.g. getgautam.co.uk.
variable "root_domain" {
  type = string
}

# Kubernetes version. Check EKS "standard support" dates; extended support costs 6x.
variable "cluster_version" {
  type    = string
  default = "1.35"
}

# Worker node size / count.
variable "node_instance_type" {
  type    = string
  default = "t3.medium"
}
variable "node_desired" {
  type    = number
  default = 2
}
variable "node_min" {
  type    = number
  default = 1
}
variable "node_max" {
  type    = number
  default = 3
}

# VPC range. Different per env so they could be peered later.
variable "vpc_cidr" {
  type = string
}

# Extra IAM principals (e.g. YOUR IAM user ARN) that get cluster-admin so you
# can run kubectl from your laptop.
variable "extra_admin_arns" {
  type    = list(string)
  default = []
}
