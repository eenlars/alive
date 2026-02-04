# Shell Server: How to Never Go Down Again

**Updated**: 2026-02-04
**Service**: go.goalive.nl

## The Actual Solution (Simple)

The shell-server-go now runs as a **systemd service** with automatic restarts. That's it.

### What Systemd Does

1. **Auto-restart on crash** - Service crashes? Systemd restarts it in 5 seconds
2. **Auto-start on boot** - Server reboots? Service comes back up automatically
3. **Resource limits** - Memory leaks? Service won't exceed 4GB
4. **Logging** - Everything goes to journalctl, not random log files
5. **Single source of truth** - One way to run it, not PM2 + cron + scripts

## Management Commands

```bash
# Check if it's running
systemctl status shell-server-go

# View logs
journalctl -u shell-server-go -n 50

# Restart it
systemctl restart shell-server-go

# Stop it (for maintenance)
systemctl stop shell-server-go

# Start it
systemctl start shell-server-go
```

## After Code Changes

**Automatic (Recommended):**
```bash
# Deploy staging or dev - shell-server-go rebuilds automatically
make staging
# or
make dev
```

**Manual (if needed):**
```bash
cd /root/alive/apps/shell-server-go
make build
systemctl restart shell-server-go
systemctl status shell-server-go
```

## Verify It's Working

```bash
# 1. Check systemd
systemctl status shell-server-go
# Should show: "active (running)"

# 2. Check port
lsof -i :3888
# Should show shell-server-go process

# 3. Check HTTP
curl -I http://localhost:3888
# Should return: HTTP/1.1 200 OK

# 4. Check domain
curl -I https://go.goalive.nl
# Should return: HTTP/2 200
```

## Files

- **Service definition**: `/etc/systemd/system/shell-server-go.service` (also in ops/systemd/)
- **Environment vars**: `/root/alive/apps/shell-server-go/.env.production`
- **App code**: `/root/alive/apps/shell-server-go/`
- **Built binary**: `/root/alive/apps/shell-server-go/shell-server-go`

## What We Removed

- ❌ Cron-based health checks (systemd handles this)
- ❌ PM2 configuration (systemd is simpler)
- ❌ Custom monitoring scripts (journalctl is sufficient)
- ❌ Passwords in git (using .env.production)

## If It's Down

1. Check status: `systemctl status shell-server-go`
2. Check logs: `journalctl -u shell-server-go -n 100`
3. Common issues:
   - **"failed"** → Check logs for error message
   - **"activating" loop** → App is crashing immediately, check build
   - **Port conflict** → Something else on 3888: `lsof -i :3888`
4. Rebuild if needed: `cd apps/shell-server-go && make build`
5. Restart: `systemctl restart shell-server-go`

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
