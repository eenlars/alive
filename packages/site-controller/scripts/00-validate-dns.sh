#!/bin/bash
set -e

# Source common functions
source "$(dirname "$0")/lib/common.sh"

# Validate required environment variables
require_var SITE_DOMAIN SERVER_IP WILDCARD_DOMAIN

log_info "Validating DNS for domain: $SITE_DOMAIN"

# Check if this is a wildcard domain (skip validation for subdomains of wildcard)
if [[ "$SITE_DOMAIN" == "$WILDCARD_DOMAIN" ]] || [[ "$SITE_DOMAIN" == *".$WILDCARD_DOMAIN" ]]; then
    log_success "Wildcard domain detected, skipping DNS validation"
    exit 0
fi

# Query A record
log_info "Querying A record for $SITE_DOMAIN..."
RESOLVED_IP=$(dig +short "$SITE_DOMAIN" A | tail -n1)

# Check if DNS is configured
if [[ -z "$RESOLVED_IP" ]]; then
    log_error "No A record found for $SITE_DOMAIN"
    log_error "You must create an A record for $SITE_DOMAIN with these exact settings:"
    log_error "  Type: A"
    log_error "  Name/Host: @ (or $SITE_DOMAIN)"
    log_error "  Value/Points to: $SERVER_IP"
    log_error "  TTL: 300 (or Auto)"
    log_error "⚠️  ALSO: Remove any AAAA records (IPv6) for $SITE_DOMAIN"
    log_error "📖 See DNS setup guide: https://sonno.tech/docs/dns-setup"
    exit 12
fi

log_info "Resolved IP: $RESOLVED_IP"

# Check if using Cloudflare proxy (complete IP range detection)
if [[ "$RESOLVED_IP" =~ ^(104\.1[6-9]\.|104\.2[0-4]\.|172\.6[4-7]\.|172\.7[0-1]\.|173\.245\.|188\.114\.|190\.93\.|197\.234\.|198\.41\.) ]]; then
    log_error "DNS Error: $SITE_DOMAIN points to $RESOLVED_IP (Cloudflare proxy IP)"
    log_error "🚨 CLOUDFLARE PROXY DETECTED: You must disable the orange cloud (proxy) in Cloudflare DNS settings!"
    log_error "💡 Make the cloud icon GRAY (not orange) next to your A record, then try again."
    log_error "📖 See DNS setup guide: https://sonno.tech/docs/dns-setup"
    exit 12
fi

# Check if IP matches server IP
if [[ "$RESOLVED_IP" != "$SERVER_IP" ]]; then
    log_error "DNS Error: $SITE_DOMAIN currently points to $RESOLVED_IP, but it must point to $SERVER_IP"
    log_error "You need to update your A record for $SITE_DOMAIN with these exact settings:"
    log_error "  Type: A"
    log_error "  Name/Host: @ (or $SITE_DOMAIN)"
    log_error "  Value/Points to: $SERVER_IP"
    log_error "  TTL: 300 (or Auto)"
    log_error "⚠️  ALSO: Remove any AAAA records (IPv6) for $SITE_DOMAIN"
    log_error "📖 See DNS setup guide: https://sonno.tech/docs/dns-setup"
    exit 12
fi

# Check AAAA record (IPv6) - warning only
RESOLVED_IPV6=$(dig +short "$SITE_DOMAIN" AAAA | tail -n1)
if [[ -n "$RESOLVED_IPV6" ]]; then
    log_warn "IPv6 (AAAA) record detected: $RESOLVED_IPV6"
    log_warn "IPv6 is not fully supported yet - site may not be accessible via IPv6"
fi

log_success "DNS validation passed: $SITE_DOMAIN -> $RESOLVED_IP"
exit 0
