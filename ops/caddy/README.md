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
| `Caddyfile` | This folder | Snippets + import of generated routing (imported by main Caddyfile) |
| `generated/Caddyfile.sites` | This folder | Filtered copy of generated routing (synced from `/var/lib/alive/generated/Caddyfile.sites`) |
| `Caddyfile.main` | `/etc/caddy/Caddyfile` | Main Caddy config (ports 8081/8444) |
| `Caddyfile.shell` | `/etc/caddy/Caddyfile.shell` | Shell-only Caddy config (port 8443) |
| `Caddyfile.bak` | Backup | Previous version backup |

## File Relationships

```
/etc/caddy/Caddyfile (Caddyfile.main)
├── import /etc/caddy/Caddyfile.prod
├── import /etc/caddy/Caddyfile.staging
└── import /root/webalive/alive/ops/caddy/Caddyfile
    └── import /root/webalive/alive/ops/caddy/generated/Caddyfile.sites
        └── synced from /var/lib/alive/generated/Caddyfile.sites

/etc/caddy/Caddyfile.shell (Caddyfile.shell)
└── go.goalive.nl
```

## Installation

```bash
# Main Caddy config (run from project root)
sudo cp ops/caddy/etc/Caddyfile.example /etc/caddy/Caddyfile
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

New sites are added via the routing generator and sync script:

```bash
# Generate routing from DB
bun run --cwd packages/site-controller routing:generate

# Sync filtered file used by main import
bun /root/webalive/alive/scripts/sync-generated-caddy.ts

# Reload
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

## Ports

| Service | HTTP | HTTPS | Purpose |
|---------|------|-------|---------|
| nginx | 80 | 443 | External traffic, SNI routing |
| caddy (main) | 8081 | 8444 | All domains except shell |
| caddy-shell | - | 8443 | Shell domains only |

## CRITICAL: `tls force_automate` on explicit domains

**Bug**: Caddy v2.10.x has a bug ([#6996](https://github.com/caddyserver/caddy/issues/6996)) where the `on_demand_tls { ask ... }` global block + a wildcard `*.sonno.tech` with `tls { on_demand }` prevents cert management for explicit domains that match the wildcard (e.g., `dev.sonno.tech`, `staging.sonno.tech`).

**Symptom**: TLS handshake fails for all explicit domains, `cert_cache_fill: 0.0001` in logs, "no certificate available" errors.

**Fix**: Every explicit domain block that matches the wildcard MUST have `tls force_automate`:

```caddy
# WRONG — will silently fail to get a cert
dev.sonno.tech {
    reverse_proxy localhost:8997
}

# CORRECT
dev.sonno.tech {
    tls force_automate
    reverse_proxy localhost:8997
}
```

**Where to add it**:
- `/etc/caddy/Caddyfile.staging` — sonno.tech, app, staging, dev
- `/etc/caddy/sites/*.caddy` — midday, sentry, monitor, mail, supabase-*
- Generated `Caddyfile.sites` — template is in `packages/site-controller/src/infra/generate-routing.ts`

The wildcard block (`*.sonno.tech`) does NOT need it — it uses `tls { on_demand }` instead.

## Related Docs

- [CADDY_SHELL_ISOLATION.md](../../docs/operations/CADDY_SHELL_ISOLATION.md) - Full architecture
- [ops/nginx/](../nginx/) - nginx SNI router config
- [ops/systemd/](../systemd/) - Systemd service files
