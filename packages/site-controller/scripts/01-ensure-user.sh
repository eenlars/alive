#!/bin/bash
set -e

# Source common functions
source "$(dirname "$0")/lib/common.sh"

# Validate required environment variables
require_var SITE_USER SITE_HOME

log_info "Ensuring system user exists: $SITE_USER"

# Check if user already exists
if user_exists "$SITE_USER"; then
    log_success "User already exists: $SITE_USER"
    exit 0
fi

# Create system user
log_info "Creating system user: $SITE_USER"
useradd --system \
    --home-dir "$SITE_HOME" \
    --shell /usr/sbin/nologin \
    "$SITE_USER"

# Verify user was created
if ! user_exists "$SITE_USER"; then
    die "Failed to create user: $SITE_USER"
fi

log_success "System user created: $SITE_USER"
exit 0
