# Caddy Configuration

Caddy reverse proxy configuration files.

## Architecture

Traffic flows through nginx SNI router to the appropriate Caddy instance:

```
nginx (443) → SNI routing → caddy-shell (8443) or caddy-main (8444)
```

## Files

| File | Location | Purpose |
|------|----------|---------|
| `Caddyfile` | This folder | WebAlive site routing (imported by main Caddyfile) |
| `Caddyfile.main` | `/etc/caddy/Caddyfile` | Main Caddy config (ports 8081/8444) |
| `Caddyfile.shell` | `/etc/caddy/Caddyfile.shell` | Shell-only Caddy config (port 8443) |
| `Caddyfile.bak` | Backup | Previous version backup |

## File Relationships

```
/etc/caddy/Caddyfile (Caddyfile.main)
├── import /etc/caddy/Caddyfile.prod
├── import /etc/caddy/Caddyfile.staging
└── import /root/alive/ops/caddy/Caddyfile  ← This folder's main file

/etc/caddy/Caddyfile.shell (Caddyfile.shell)
└── go.goalive.nl
```

## Installation

```bash
# Main Caddy config (run from project root)
sudo cp ops/caddy/Caddyfile.main /etc/caddy/Caddyfile
sudo cp ops/caddy/Caddyfile.shell /etc/caddy/Caddyfile.shell
sudo chown caddy:caddy /etc/caddy/Caddyfile.shell

# Validate
caddy validate --config /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile.shell

# Reload
sudo systemctl reload caddy
sudo systemctl reload caddy-shell
```

## Adding Sites

New sites are added to `Caddyfile` (this folder) by the site-controller package.
After adding, reload main Caddy:

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

## Ports

| Service | HTTP | HTTPS | Purpose |
|---------|------|-------|---------|
| nginx | 80 | 443 | External traffic, SNI routing |
| caddy (main) | 8081 | 8444 | All domains except shell |
| caddy-shell | - | 8443 | Shell domains only |

## Related Docs

- [CADDY_SHELL_ISOLATION.md](../../docs/operations/CADDY_SHELL_ISOLATION.md) - Full architecture
- [ops/nginx/](../nginx/) - nginx SNI router config
- [ops/systemd/](../systemd/) - Systemd service files
