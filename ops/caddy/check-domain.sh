#!/bin/bash
# Simple domain checker for Caddy on-demand TLS
# Returns 200 for *.alive.best domains, 403 otherwise

DOMAIN="$1"

if [[ "$DOMAIN" =~ \.alive\.best$ ]]; then
    exit 0  # Allow
else
    exit 1  # Deny
fi
