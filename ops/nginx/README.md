# Nginx SNI Router

Nginx configuration for TLS SNI-based routing between Caddy instances.

## Purpose

Routes external TLS traffic (port 443) to the appropriate Caddy instance based on SNI (Server Name Indication):

- **Shell domains** → caddy-shell:8443 (isolated, rarely reloaded)
- **All other domains** → caddy-main:8444 (normal reloads during deploys)

This solves the SO_REUSEPORT conflict that caused intermittent 525 SSL errors.

## Architecture

```
                    nginx (80/443)
                         │
              ┌──────────┴──────────┐
              │                     │
        shell domains          other domains
              │                     │
              ▼                     ▼
     caddy-shell:8443      caddy-main:8444
```

## Installation

```bash
# Install stream module (required for SNI routing)
apt-get install -y libnginx-mod-stream

# Copy config
sudo cp ops/nginx/nginx.conf /etc/nginx/nginx.conf

# Validate
nginx -t

# Enable and start
sudo systemctl enable nginx
sudo systemctl start nginx
```

## Shell Domains

Currently routed to caddy-shell:
- `go.goalive.nl`

To add more, edit the `map` block in nginx.conf and reload:
```bash
nginx -t && systemctl reload nginx
```

## Monitoring

```bash
# View SNI routing decisions
tail -f /var/log/nginx/stream_access.log

# Check status
curl http://127.0.0.1:8888/nginx-status
```

## Related Docs

- [CADDY_SHELL_ISOLATION.md](../docs/operations/CADDY_SHELL_ISOLATION.md) - Full architecture documentation
- [ops/caddy/](../caddy/) - Caddy configuration files
- [ops/systemd/](../systemd/) - Systemd service files
