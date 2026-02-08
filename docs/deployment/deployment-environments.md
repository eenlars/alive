# Alive Deployment Environments

## Production

⚠️ **Production deployment is restricted.** Contact devops for production deploys.

**Domain:** `terminal.goalive.nl`
**Port:** `9000`
**Process:** `alive-production`
**Mode:** Standalone Next.js server

## Staging

**Domain:** `staging.terminal.goalive.nl`
**Port:** `8998`
**Process:** `alive-staging`
**Mode:** Standalone Next.js server

**Deploy:**
```bash
make staging
```

**Monitor:**
```bash
make logs-staging                            # logs
systemctl status alive-staging       # status
systemctl restart alive-staging      # restart
```

## Dev

**Domain:** `dev.terminal.goalive.nl`
**Port:** `8997`
**Process:** `alive-dev`
**Mode:** Dev server with hot reload

**Deploy:**
```bash
make dev
```

**Monitor:**
```bash
make logs-dev                           # logs
systemctl status alive-dev      # status
systemctl restart alive-dev     # restart
```

## Network

```
Internet → Caddy (80/443)
  ↓
terminal.goalive.nl → localhost:9000 (production - restricted)
staging.terminal.goalive.nl → localhost:8998 (staging - accessible)
dev.terminal.goalive.nl → localhost:8997 (dev - accessible)
```

## Caddy Config

**Location:** `/root/alive/ops/caddy/Caddyfile`

```caddy
terminal.goalive.nl {
    reverse_proxy localhost:9000
}

staging.terminal.goalive.nl {
    reverse_proxy localhost:8998
}

dev.terminal.goalive.nl {
    reverse_proxy localhost:8997
}
```

Reload: `systemctl reload caddy`

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-xxx
ALIVE_PASSCODE=your_secure_passcode
CLAUDE_MODEL=claude-haiku-4-5        # Optional
WORKSPACE_BASE=/srv/webalive/sites            # Optional
```

**Local dev only:**
```bash
ALIVE_ENV=local
LOCAL_TEMPLATE_PATH=.alive/template
```

## Atomic Build

Builds isolated in `.builds/v{n}/`, old version remains running until new build succeeds. See `docs/deployment/deployment.md`.

## Quick Verification

After deployment:

- [ ] Site responds: `curl -H "Host: staging.terminal.goalive.nl" localhost:8998`
- [ ] Systemd shows running: `systemctl status alive-staging`
- [ ] Logs clean: `journalctl -u alive-staging -n 50 | grep -i error` (no errors)
- [ ] Caddy active: `systemctl status caddy`
- [ ] Public domain works: `curl https://terminal.goalive.nl`

## Troubleshooting

**Port already in use:**
- `lsof -i :9000` - find process
- `systemctl stop alive-production` - stop the service
- `fuser -k 9000/tcp` - kill the port if still in use

**Build fails atomically:**
- Old version still running (safe)
- Check `.builds/` directory has space
- Check git pull succeeded: `cd /root/alive && git status`

**Caddy not reloading:**
- Check syntax: `caddy validate --config /root/alive/ops/caddy/Caddyfile`
- Manual reload: `systemctl reload caddy`
- View logs: `journalctl -u caddy -n 50`
