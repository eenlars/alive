# Caddy Shell Isolation: Preserving SSE Connections During Deploys

**Created**: 2025-12-07
**Updated**: 2026-02-04 (consolidated to single shell domain go.goalive.nl)
**Services**: `nginx`, `caddy`, `caddy-shell`, `go.goalive.nl`

## Problem

When Caddy reloads (during deploys or config changes), it terminates all existing connections including long-lived SSE streams. This kills active Claude Code sessions in the Go shell.

Caddy does not support preserving WebSocket/SSE connections during config reload - this is a [known limitation](https://github.com/caddyserver/caddy/issues/5471).

## Original Solution (Broken)

The initial approach was to run two Caddy instances on the same ports using `SO_REUSEPORT`. This caused intermittent SSL handshake failures (Cloudflare 525 errors) because Linux kernel load-balances connections randomly between the two processes - when a request for domain A hits the Caddy instance that doesn't have domain A configured, TLS handshake fails.

## Current Solution: nginx SNI Router

A lightweight nginx layer in front of both Caddy instances routes traffic based on TLS SNI (Server Name Indication):

```
                          ┌─────────────────────────────────────────┐
                          │          nginx (port 80/443)            │
                          │         SNI-based routing               │
                          └─────────────────────────────────────────┘
                                    │                   │
                          shell domains          all other domains
                                    │                   │
                                    ▼                   ▼
                    ┌─────────────────────┐   ┌─────────────────────┐
                    │  caddy-shell:8443   │   │   caddy-main:8444   │
                    │  (rarely reloaded)  │   │   (normal reloads)  │
                    └─────────────────────┘   └─────────────────────┘
                              │                         │
                              ▼                         ▼
                    ┌─────────────────────┐   ┌─────────────────────┐
                    │  shell-server:3888  │   │  All other backends │
                    │   (Go SSE shell)    │   │  (Bridge, sites,..) │
                    └─────────────────────┘   └─────────────────────┘
```

### How It Works

1. **nginx** listens on external ports 80/443
2. **TLS passthrough**: nginx reads SNI from TLS ClientHello (unencrypted) without terminating TLS
3. **SNI routing**: Shell domains → caddy-shell:8443, everything else → caddy-main:8444
4. **Both Caddy instances** handle their own TLS certificates

### Port Allocation

| Service | HTTP Port | HTTPS Port | Purpose |
|---------|-----------|------------|---------|
| nginx | 80 | 443 | External traffic, SNI routing |
| caddy (main) | 8081 | 8444 | All domains except shell |
| caddy-shell | - | 8443 | Shell domains only (auto_https disabled) |

## Configuration Files

### `/etc/nginx/nginx.conf`

```nginx
# Nginx SNI Router - Routes TLS traffic based on SNI to appropriate Caddy instance
# This solves the SO_REUSEPORT conflict between caddy.service and caddy-shell.service
#
# Architecture:
#   nginx (port 443) -> SNI routing -> caddy-shell (8443) for shell domains
#                                   -> caddy-main (8444) for everything else

user www-data;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 4096;
}

# Stream module for TCP/TLS SNI routing (Layer 4)
stream {
    # Log format for debugging SNI routing
    log_format stream_routing '$remote_addr [$time_local] '
                              'SNI: $ssl_preread_server_name -> $backend '
                              '$protocol $status $bytes_sent $bytes_received '
                              '$session_time';

    access_log /var/log/nginx/stream_access.log stream_routing;

    # Map SNI hostname to backend
    # Shell domains -> caddy-shell (isolated for long-lived SSE connections)
    # Everything else -> caddy-main
    map $ssl_preread_server_name $backend {
        # Go Shell domain - route to caddy-shell for SSE isolation
        go.goalive.nl               caddy_shell;

        # Default: all other domains go to main Caddy
        default                     caddy_main;
    }

    # Upstream: Main Caddy instance (handles all websites, APIs, etc.)
    upstream caddy_main {
        server 127.0.0.1:8444;
    }

    # Upstream: Shell Caddy instance (isolated, rarely reloaded)
    upstream caddy_shell {
        server 127.0.0.1:8443;
    }

    # HTTPS listener - SNI-based routing with TLS passthrough
    server {
        listen 443;
        listen [::]:443;

        # Enable SNI inspection (reads TLS ClientHello without terminating)
        ssl_preread on;

        # Route to appropriate backend based on SNI
        proxy_pass $backend;

        # Timeouts for long-lived connections (SSE, WebSocket)
        proxy_connect_timeout 10s;
        proxy_timeout 24h;  # Allow very long SSE connections
    }

    # HTTP listener - proxy to main Caddy (handles HTTP->HTTPS redirects)
    server {
        listen 80;
        listen [::]:80;

        # All HTTP goes to main Caddy (it handles redirects)
        proxy_pass caddy_main_http;
        proxy_connect_timeout 10s;
        proxy_timeout 300s;
    }

    # HTTP upstream (port 8081 for main Caddy)
    upstream caddy_main_http {
        server 127.0.0.1:8081;
    }
}

# HTTP block - minimal, only for status endpoint
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Status endpoint for monitoring
    server {
        listen 127.0.0.1:8888;

        location /nginx-status {
            stub_status on;
            allow 127.0.0.1;
            deny all;
        }

        location / {
            return 200 "nginx SNI router is running\n";
            add_header Content-Type text/plain;
        }
    }
}
```

### `/etc/caddy/Caddyfile`

```caddyfile
# Main Caddy Configuration
# ARCHITECTURE: nginx (port 443/80) -> SNI routing -> this instance (port 8444/8081)

{
    # Bind to internal ports (nginx handles external 80/443)
    http_port 8081
    https_port 8444

    # Admin API on default port 2019
    admin localhost:2019
}

# Production configuration (manual changes only)
import /etc/caddy/Caddyfile.prod

# Staging & dev configuration (auto-reload safe)
import /etc/caddy/Caddyfile.staging

# WebAlive sites (auto-reload safe)
import /root/webalive/claude-bridge/ops/caddy/Caddyfile

# ... other config
```

### `/etc/caddy/Caddyfile.shell`

```caddyfile
# Caddy instance for Go Shell - NEVER auto-reloaded
# This instance is isolated from main Caddy to preserve long-lived SSE connections
# Only reload manually when shell config actually changes
#
# ARCHITECTURE: nginx (port 443) -> SNI routing -> this instance (port 8443)

{
    # Use different admin port to avoid conflict with main Caddy
    admin localhost:2020

    # Use different storage to avoid conflicts
    storage file_system {
        root /var/lib/caddy-shell
    }

    # Disable automatic HTTPS redirects (nginx handles external ports)
    # This prevents Caddy from trying to bind to port 80
    auto_https disable_redirects

    # HTTP port is unused but needed to prevent binding to 80
    http_port 8089
}

# Go Shell server - handles Claude Code SSE connections
go.goalive.nl:8443 {
    reverse_proxy localhost:3888 {
        # Extra safety: delay stream close on the rare manual reload
        stream_close_delay 5m
    }
}
```

## Setup From Scratch

If recreating on a new server:

```bash
# 1. Install nginx stream module
apt-get update && apt-get install -y libnginx-mod-stream

# 2. Create nginx config (copy content from above)
nano /etc/nginx/nginx.conf

# 3. Validate nginx config
nginx -t

# 4. Create Caddy storage directories
mkdir -p /var/lib/caddy-shell
chown caddy:caddy /var/lib/caddy-shell

# 5. Create/update Caddyfile.shell (copy content from above)
nano /etc/caddy/Caddyfile.shell
chown caddy:caddy /etc/caddy/Caddyfile.shell
chmod 644 /etc/caddy/Caddyfile.shell

# 6. Update main Caddyfile with internal ports (copy content from above)
nano /etc/caddy/Caddyfile

# 7. Create caddy-shell systemd service
cat > /etc/systemd/system/caddy-shell.service << 'EOF'
[Unit]
Description=Caddy Shell (Isolated instance for Go Shell)
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile.shell
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile.shell --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

# 8. Validate configs
caddy validate --config /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile.shell

# 9. Start services (order matters!)
systemctl daemon-reload
systemctl stop caddy caddy-shell 2>/dev/null || true
systemctl start nginx
systemctl start caddy
systemctl start caddy-shell
systemctl enable nginx caddy caddy-shell

# 10. Verify
ss -tlnp | grep -E ':80|:443|:8443|:8444|:8081'
curl -sI https://app.alive.best | head -3
curl -sI https://go.goalive.nl | head -3
```

## Management Commands

```bash
# Check all services
systemctl status nginx caddy caddy-shell

# View SNI routing logs
tail -f /var/log/nginx/stream_access.log

# View nginx status
curl http://127.0.0.1:8888/nginx-status

# Reload main Caddy (safe, doesn't affect shell)
systemctl reload caddy

# Reload caddy-shell (ONLY when shell config changes)
systemctl reload caddy-shell

# Reload nginx (ONLY when SNI map changes)
systemctl reload nginx

# Test domains
for d in app.alive.best go.goalive.nl; do
    echo -n "$d: "; curl -s -o /dev/null -w "%{http_code}\n" https://$d/
done
```

## Adding New Shell Domains

When adding a new domain to caddy-shell:

1. Add to nginx SNI map in `/etc/nginx/nginx.conf`:
   ```nginx
   map $ssl_preread_server_name $backend {
       go.goalive.nl               caddy_shell;
       newdomain.example.com       caddy_shell;  # NEW
       default                     caddy_main;
   }
   ```

2. Add to `/etc/caddy/Caddyfile.shell`:
   ```caddyfile
   newdomain.example.com:8443 {
       reverse_proxy localhost:3888 {
           stream_close_delay 5m
       }
   }
   ```

3. Reload both:
   ```bash
   nginx -t && systemctl reload nginx
   caddy validate --config /etc/caddy/Caddyfile.shell && systemctl reload caddy-shell
   ```

## Troubleshooting

### 525 SSL Handshake Failed

**Symptom**: Intermittent 525 errors from Cloudflare

**Possible causes**:
1. nginx not running → `systemctl start nginx`
2. Caddy instance down → `systemctl status caddy caddy-shell`
3. Wrong port binding → `ss -tlnp | grep -E ':443|:8443|:8444'`

### Shell domains not responding

1. Check nginx routing:
   ```bash
   grep go.goalive.nl /var/log/nginx/stream_access.log | tail -5
   ```

2. Check caddy-shell:
   ```bash
   systemctl status caddy-shell
   journalctl -u caddy-shell -n 20
   ```

3. Check shell-server-go backend:
   ```bash
   curl -I http://localhost:3888
   ```

### Port conflicts

Check what's using the ports:
```bash
ss -tlnp | grep -E ':80|:443|:8080|:8081|:8443|:8444'
```

Expected output:
```
nginx:  80, 443
caddy:  8081, 8444
caddy-shell: 8443
```

### Certificate issues

Caddy instances manage their own certificates:

```bash
# Main Caddy certs
ls -la /var/lib/caddy/.local/share/caddy/certificates/

# Shell Caddy certs
ls -la /var/lib/caddy-shell/certificates/

# Check certificate validity
openssl x509 -in /var/lib/caddy-shell/certificates/acme-v02.api.letsencrypt.org-directory/go.goalive.nl/go.goalive.nl.crt -text -noout | head -15
```

## Why nginx Instead of Alternatives?

| Solution | Pros | Cons |
|----------|------|------|
| **nginx stream** (chosen) | Simple, proven, TLS passthrough | Extra process |
| Caddy Layer4 plugin | Single binary | Requires custom Caddy build, less stable |
| HAProxy | Purpose-built | Heavier for just 2 backends |
| iptables SNI routing | No extra process | Complex, hard to maintain |

nginx stream module is the cleanest solution: battle-tested, simple config, true TLS passthrough (no cert management at nginx level).

## Related Docs

- [Shell Server Recovery](./SHELL_SERVER_RECOVERY.md) - The Go shell server itself
- [Caddy Issue #5471](https://github.com/caddyserver/caddy/issues/5471) - WebSocket/SSE connection preservation
