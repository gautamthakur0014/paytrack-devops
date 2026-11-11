# =============================================================================
# FILE: terraform/modules/platform/network.tf
# OVERVIEW: The network: 1 VPC, 2 AZs, public subnets (ALB) + private subnets
# (nodes/pods), ONE shared NAT gateway (cheaper; fine for a demo).
# =============================================================================

# Common name prefix, e.g. "paytrack-dev".
locals {
  name = "paytrack-${var.env}"
}

# Pick two availability zones of the chosen region.
data "aws_availability_zones" "available" {
  state = "available"
}

# VPC built with the community module. Subnet tags tell the AWS Load Balancer
# Controller where it may place internet-facing (public) ALBs.
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.21"

  name = local.name
  cidr = var.vpc_cidr
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)

  private_subnets = [cidrsubnet(var.vpc_cidr, 4, 0), cidrsubnet(var.vpc_cidr, 4, 1)]
  public_subnets  = [cidrsubnet(var.vpc_cidr, 8, 200), cidrsubnet(var.vpc_cidr, 8, 201)]

  enable_nat_gateway   = true
  single_nat_gateway   = true # one NAT for both AZs = lowest cost
  enable_dns_hostnames = true

  public_subnet_tags  = { "kubernetes.io/role/elb" = 1 }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = 1 }
}
