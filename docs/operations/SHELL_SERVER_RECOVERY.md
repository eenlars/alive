# Shell Server: How to Never Go Down Again

**Updated**: 2025-11-20
**Service**: shell.terminal.goalive.nl

## The Actual Solution (Simple)

The shell-server now runs as a **systemd service** with automatic restarts. That's it.

### What Systemd Does

1. **Auto-restart on crash** - Service crashes? Systemd restarts it in 5 seconds
2. **Auto-start on boot** - Server reboots? Service comes back up automatically
3. **Resource limits** - Memory leaks? Service won't exceed 500MB
4. **Logging** - Everything goes to journalctl, not random log files
5. **Single source of truth** - One way to run it, not PM2 + cron + scripts

## Management Commands

```bash
# Check if it's running
systemctl status shell-server

# View logs
journalctl -u shell-server -n 50

# Restart it
systemctl restart shell-server

# Stop it (for maintenance)
systemctl stop shell-server

# Start it
systemctl start shell-server
```

## After Code Changes

**Automatic (Recommended):**
```bash
# Deploy staging or dev - shell-server rebuilds automatically
make staging
# or
make dev
```

**Manual (if needed):**
```bash
cd /root/webalive/claude-bridge/apps/shell-server
bun run build
systemctl restart shell-server
systemctl status shell-server
```

## Verify It's Working

```bash
# 1. Check systemd
systemctl status shell-server
# Should show: "active (running)"

# 2. Check port
lsof -i :3888
# Should show node process

# 3. Check HTTP
curl -I http://localhost:3888
# Should return: HTTP/1.1 200 OK

# 4. Check domain
curl -I https://shell.terminal.goalive.nl
# Should return: HTTP/2 200
```

## Files

- **Service definition**: `/etc/systemd/system/shell-server.service`
- **Environment vars**: `/root/webalive/claude-bridge/apps/shell-server/.env.production`
- **App code**: `/root/webalive/claude-bridge/apps/shell-server/`
- **Built output**: `/root/webalive/claude-bridge/apps/shell-server/dist/index.js`

## What We Removed

- ❌ Cron-based health checks (systemd handles this)
- ❌ PM2 configuration (systemd is simpler)
- ❌ Custom monitoring scripts (journalctl is sufficient)
- ❌ Passwords in git (using .env.production)

## If It's Down

1. Check status: `systemctl status shell-server`
2. Check logs: `journalctl -u shell-server -n 100`
3. Common issues:
   - **"failed"** → Check logs for error message
   - **"activating" loop** → App is crashing immediately, check build
   - **Port conflict** → Something else on 3888: `lsof -i :3888`
4. Rebuild if needed: `bun run build`
5. Restart: `systemctl restart shell-server`

## Why This Won't Happen Again

**Before:**
- PM2 pointing to deleted directory
- Environment vars not persisted
- No automatic recovery
- Configuration not tracked

**After:**
- Systemd service properly configured
- Environment file outside git
- Auto-restart on failure (built-in)
- Simple, documented, one way to run it

The service is now boring and reliable, which is exactly what it should be.
