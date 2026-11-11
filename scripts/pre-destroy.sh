#!/usr/bin/env bash
# =============================================================================
# FILE: scripts/pre-destroy.sh
# OVERVIEW: MUST run before `terraform destroy`. The ALB, its security groups
# and the Route53 records are created by Kubernetes controllers, NOT by
# Terraform. If the cluster is deleted first, they are orphaned and the VPC
# can't be deleted (and the ALB keeps billing). This script deletes the app's
# Ingress first and waits until the ALB is really gone.
#
# USAGE:  ./scripts/pre-destroy.sh <dev|prod>
# =============================================================================
set -uo pipefail

ENV_NAME="${1:?usage: $0 <dev|prod>}"
REGION="${AWS_REGION:-ap-south-1}"
CLUSTER="paytrack-${ENV_NAME}"

# If the cluster is already gone there is nothing to clean.
aws eks update-kubeconfig --name "$CLUSTER" --region "$REGION" >/dev/null 2>&1 \
  || { echo "Cluster $CLUSTER not found - skipping."; exit 0; }

# Deleting the Ingress makes the controller delete the ALB and ExternalDNS delete the DNS record.
kubectl -n paytrack delete ingress --all --ignore-not-found --wait=true --timeout=300s || true

# Wait (max ~10 min) until no load balancer tagged for this cluster remains.
for i in $(seq 1 40); do
  LEFT=$(aws resourcegroupstaggingapi get-resources --region "$REGION" \
    --resource-type-filters elasticloadbalancing:loadbalancer \
    --tag-filters "Key=elbv2.k8s.aws/cluster,Values=${CLUSTER}" \
    --query 'length(ResourceTagMappingList)' --output text)
  [ "$LEFT" = "0" ] && { echo "ALB removed."; exit 0; }
  echo "Waiting for ALB deletion ($i/40)..."; sleep 15
done
echo "WARNING: ALB still present - check EC2 > Load Balancers before destroying."
exit 1
