# Claude Bridge Deployment Environments

## Production

⚠️ **Production deployment is restricted.** Contact devops for production deploys.

**Domain:** `terminal.goalive.nl`
**Port:** `8999`
**Process:** `claude-bridge`
**Mode:** Standalone Next.js server

## Staging

**Domain:** `staging.terminal.goalive.nl`
**Port:** `8998`
**Process:** `claude-bridge-staging`
**Mode:** Standalone Next.js server

**Deploy:**
```bash
make staging
```

**Monitor:**
```bash
make logs-staging                            # logs
systemctl status claude-bridge-staging       # status
systemctl restart claude-bridge-staging      # restart
```

## Dev

**Domain:** `dev.terminal.goalive.nl`
**Port:** `8997`
**Process:** `claude-bridge-dev`
**Mode:** Dev server with hot reload

**Deploy:**
```bash
make dev
```

**Monitor:**
```bash
make logs-dev                           # logs
systemctl status claude-bridge-dev      # status
systemctl restart claude-bridge-dev     # restart
```

## Network

```
Internet → Caddy (80/443)
  ↓
terminal.goalive.nl → localhost:8999 (production - restricted)
staging.terminal.goalive.nl → localhost:8998 (staging - accessible)
dev.terminal.goalive.nl → localhost:8997 (dev - accessible)
```

## Caddy Config

**Location:** `/root/webalive/claude-bridge/Caddyfile`

```caddy
terminal.goalive.nl {
    reverse_proxy localhost:8999
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
BRIDGE_PASSCODE=your_secure_passcode
CLAUDE_MODEL=claude-haiku-4-5        # Optional
WORKSPACE_BASE=/srv/webalive/sites            # Optional
```

**Local dev only:**
```bash
BRIDGE_ENV=local
LOCAL_TEMPLATE_PATH=.alive/template
```

## Atomic Build

Builds isolated in `.builds/v{n}/`, old version remains running until new build succeeds. See `docs/deployment/deployment.md`.

## Quick Verification

After deployment:

- [ ] Site responds: `curl -H "Host: terminal.goalive.nl" localhost:8999`
- [ ] Systemd shows running: `systemctl status claude-bridge-staging`
- [ ] Logs clean: `bun run see | grep -i error` (no errors)
- [ ] Caddy active: `systemctl status caddy`
- [ ] Public domain works: `curl https://terminal.goalive.nl`

## Troubleshooting

**Port already in use:**
- `lsof -i :8999` - find process
- `systemctl stop claude-bridge` - stop the service
- `fuser -k 8999/tcp` - kill the port if still in use

**Build fails atomically:**
- Old version still running (safe)
- Check `.builds/` directory has space
- Check git pull succeeded: `cd /root/webalive/claude-bridge && git status`

**Caddy not reloading:**
- Check syntax: `caddy validate --config /root/webalive/claude-bridge/Caddyfile`
- Manual reload: `systemctl reload caddy`
- View logs: `journalctl -u caddy -n 50`
