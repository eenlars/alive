# WebAlive Site Management Scripts

Operations scripts for managing WebAlive site deployments. These are **infrastructure tools only**—not part of the open-source codebase.

## Overview

These scripts provide:
- Site deployment mode management (dev/preview/start)
- Health monitoring and auto-restart
- Deployment mode verification
- Service health checks

## Installation

These scripts are meant to run on the production server only. They should NOT be included in the npm package or distributed publicly.

### Deploy to Production Server

```bash
# Copy scripts to /usr/local/bin
sudo cp *.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/*.sh

# Copy systemd units (from ../systemd/)
sudo cp ../systemd/webalive-mode-check.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable webalive-mode-check.timer
sudo systemctl start webalive-mode-check.timer
```

### Initialize Registry

```bash
sudo mkdir -p /var/lib/webalive
sudo cp site-modes.json.template /var/lib/webalive/site-modes.json
```

## Scripts

### `check-site-health.sh`
Check if a specific site is running and responsive.

```bash
check-site-health.sh <domain> [port]

# Example:
check-site-health.sh luuk.alive.best 3656
```

**What it does:**
1. Checks if systemd service is running
2. Auto-restarts if down
3. Verifies port is responding
4. Reports status

### `show-site-modes.sh`
Display all sites and their current deployment modes.

```bash
show-site-modes.sh
```

**Output:**
```
WebAlive Site Deployment Modes
==============================

DOMAIN                                   EXPECTED        ACTUAL
------                                   --------        ------
luuk.alive.best                          dev             dev
alivecustomers.alive.best                preview         preview
alive.best                               start           start
```

Highlights mismatches in red.

### `set-site-mode.sh`
Change a site's deployment mode and apply the change.

```bash
set-site-mode.sh <domain> <dev|preview|start>

# Example:
set-site-mode.sh mysite.alive.best dev
```

**What it does:**
1. Creates/updates systemd override config
2. Updates registry
3. Reloads systemd
4. Restarts the service
5. Verifies startup

### `sync-site-modes.sh`
Scan all sites and sync their modes into the registry.

```bash
sync-site-modes.sh
```

**Use when:**
- First setting up the system
- Recovering from registry loss
- Adding new sites

### `verify-site-modes.sh`
Verify all sites match their intended modes, fix mismatches.

```bash
verify-site-modes.sh
```

**What it does:**
1. Reads registry (expected modes)
2. Checks systemd overrides (actual modes)
3. Auto-fixes any mismatches
4. Logs all changes

**Runs automatically:**
- Every hour via `webalive-mode-check.timer`
- On boot via `webalive-mode-check.service`

### `monitor-sites.sh`
Monitor all sites, auto-restart if any are down.

```bash
monitor-sites.sh
```

**What it does:**
1. Checks all `site@*.service` units
2. Restarts any that are inactive
3. Logs results and errors
4. Counts failures and successes

**Runs automatically:**
- Every 5 minutes via cron (see `/etc/cron.d/monitor-webalive-sites`)

## Registry: `site-modes.json`

Location: `/var/lib/webalive/site-modes.json`

Tracks the intended deployment mode for each site:

```json
{
  "version": "1.0.0",
  "description": "Deployment mode registry for all WebAlive sites",
  "lastUpdated": "2026-02-03T15:58:00Z",
  "modeDefinitions": {
    "dev": "Development mode with hot reload (vite)",
    "preview": "Production preview mode (vite preview)",
    "start": "Custom start script (package.json start)",
    "default": "dev"
  },
  "sites": {
    "luuk.alive.best": "dev",
    "alivecustomers.alive.best": "preview",
    "alive.best": "start"
  }
}
```

### Adding a site to the registry

Manual:
```bash
jq '.sites."mysite.alive.best" = "dev"' /var/lib/webalive/site-modes.json > /tmp/modes.json && mv /tmp/modes.json /var/lib/webalive/site-modes.json
```

Or use the helper:
```bash
set-site-mode.sh mysite.alive.best dev
```

## Systemd Integration

### Service: `webalive-mode-check.service`
One-shot service that verifies all sites match their intended modes.

```bash
# Run verification now
sudo systemctl start webalive-mode-check.service

# View logs
sudo journalctl -u webalive-mode-check.service -n 50
```

### Timer: `webalive-mode-check.timer`
Runs verification every hour, boots after 2 minutes.

```bash
# Check timer status
sudo systemctl status webalive-mode-check.timer

# View next run time
sudo systemctl list-timers webalive-mode-check.timer
```

## Cron Jobs

### Monitor Sites (`monitor-webalive-sites`)
Runs every 5 minutes, restarts any failed sites.

Location: `/etc/cron.d/monitor-webalive-sites`

```bash
*/5 * * * * root /usr/local/bin/monitor-sites.sh >> /var/log/webalive-monitor.log 2>&1
```

## Logs

| Log | Purpose |
|-----|---------|
| `/var/log/webalive-monitor.log` | Monitor script runs + restarts |
| `/var/log/webalive-mode-check.log` | Mode verification + syncs |
| `/var/log/webalive-sync-modes.log` | Registry sync operations |
| `journalctl -u webalive-mode-check.service` | Systemd service logs |
| `journalctl -u webalive-mode-check.timer` | Timer execution logs |

## Architecture

```
Systemd Base Template
├─ /etc/systemd/system/site@.service
│  └─ ExecStart: /usr/local/bin/bun run dev
│
Site-Specific Override
├─ /etc/systemd/system/site@[domain].service.d/override.conf
│  └─ ExecStart: /usr/local/bin/bun run <preview|start>
│
Registry
├─ /var/lib/webalive/site-modes.json
│  └─ Tracks all sites' intended modes
│
Verification
├─ webalive-mode-check.timer (hourly)
│  └─ verify-site-modes.sh (detects & fixes drift)
│
Monitoring
├─ /etc/cron.d/monitor-webalive-sites (every 5 min)
│  └─ monitor-sites.sh (restarts failed sites)
```

## Troubleshooting

### Site stuck in wrong mode?
```bash
# Force it to correct mode
set-site-mode.sh mysite.alive.best dev

# Or run full verification
verify-site-modes.sh
```

### Service won't start?
```bash
# Check status
systemctl status site@[domain].service

# View recent logs
journalctl -u site@[domain].service -n 50

# Try manual restart
systemctl restart site@[domain].service
```

### Registry corrupted?
```bash
# Rescan all sites and rebuild registry
sync-site-modes.sh
```

### Check all site health
```bash
# Show all modes + mismatches
show-site-modes.sh

# Run full verification
verify-site-modes.sh
```

## Operations Checklist

### After deployment
```bash
# 1. Verify mode is correct
show-site-modes.sh | grep newsite

# 2. Check health
check-site-health.sh newsite.alive.best

# 3. Verify systemd is running
systemctl status site@newsite-alive-best.service
```

### Regular maintenance
```bash
# Check all sites monthly
show-site-modes.sh

# Review logs
tail -100 /var/log/webalive-monitor.log
tail -100 /var/log/webalive-mode-check.log
```

### Emergency: Multiple sites down
```bash
# 1. Check what failed
tail -50 /var/log/webalive-monitor.log

# 2. Manual restart all
systemctl restart 'site@*.service'

# 3. Verify modes are correct
verify-site-modes.sh

# 4. Check systemd status
systemctl status 'site@*.service'
```

## Security Notes

- Registry `/var/lib/webalive/site-modes.json` is world-readable (contains no secrets)
- Systemd override configs are root-only (644 perms)
- All scripts require root to run
- Scripts validate all inputs (domain names, modes)
- No hardcoded credentials or secrets

## NOT Part of npm Package

These scripts must **never** be included in the npm distribution:
- ❌ Do not include in `package.json` files
- ❌ Do not publish to npm
- ❌ Do not document in public API docs
- ❌ Do not commit to open-source repos without clear ops-only separation

They are **operations infrastructure only**, maintained separately from the published package.
