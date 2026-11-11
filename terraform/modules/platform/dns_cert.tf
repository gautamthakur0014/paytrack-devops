# =============================================================================
# FILE: terraform/modules/platform/dns_cert.tf
# OVERVIEW: HTTPS certificate for this env's host name, issued by AWS ACM and
# validated automatically through DNS records in the Route53 zone.
# The ALB later finds this cert on its own by matching the host name.
# =============================================================================

# The zone created in the bootstrap stack (looked up by name).
data "aws_route53_zone" "root" {
  name         = var.root_domain
  private_zone = false
}

# Request the certificate for e.g. dev.getgautam.co.uk.
resource "aws_acm_certificate" "app" {
  domain_name       = var.app_domain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

# Create the DNS records ACM asks for, to prove we own the domain.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for o in aws_acm_certificate.app.domain_validation_options : o.domain_name => {
      name   = o.resource_record_name
      type   = o.resource_record_type
      record = o.resource_record_value
    }
  }
  zone_id         = data.aws_route53_zone.root.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Wait until ACM reports the certificate as ISSUED (needs LCN nameservers to be
# pointed to Route53 already, otherwise this step hangs).
resource "aws_acm_certificate_validation" "app" {
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
