# WebAlive Operations Infrastructure

This directory contains **operations and infrastructure code only**—NOT part of the npm package.

## Directory Structure

```
ops/
├── README.md                    # This file
├── caddy/                       # Reverse proxy configs (production only)
│   ├── Caddyfile               # Live routing config (ignored in git)
│   ├── Caddyfile.example       # Template for reference
│   └── ...
├── nginx/                       # Legacy nginx configs
├── systemd/                     # systemd service templates
│   ├── README.md               # systemd setup guide
│   ├── webalive-mode-check.service    # Mode verification service
│   ├── webalive-mode-check.timer      # Mode verification timer
│   └── ...
├── scripts/                     # Operational scripts (server mgmt only)
│   ├── README.md               # Script documentation
│   ├── check-site-health.sh    # Health check utility
│   ├── monitor-sites.sh        # Auto-restart failed sites
│   ├── set-site-mode.sh        # Change deployment mode
│   ├── show-site-modes.sh      # Display site modes
│   ├── sync-site-modes.sh      # Sync registry with current state
│   ├── verify-site-modes.sh    # Verify + fix mode drift
│   └── site-modes.json.template # Registry template
└── server-config.example.json   # Server configuration template
```

## Important: NOT for Distribution

Everything in `ops/` is **infrastructure management only**:
- ❌ Do NOT include in npm package
- ❌ Do NOT publish to npm registry
- ❌ Do NOT include in public documentation
- ❌ Do NOT reference from app code

These are DevOps/SRE tools for managing the production server.

## What Goes Where

### Include in npm package (`packages/` / `apps/`)
- Source code
- Libraries
- Tools for developers
- Public APIs
- Configuration templates

### Keep in `ops/` only
- Server management scripts
- systemd units
- Reverse proxy configs
- Deployment orchestration
- Infrastructure setup
- Monitoring scripts

## Subdirectories

### `/ops/caddy`
Caddy reverse proxy configuration. The live `Caddyfile` is gitignored and contains all customer domains.

**Files:**
- `Caddyfile` - IGNORED in git (production routing config)
- `Caddyfile.example` - Template for reference
- `Caddyfile.snippets` - Reusable config blocks
- `etc/` - Example snippets

**Management:**
```bash
systemctl reload caddy  # Reload without restarting
systemctl restart caddy # Full restart
```

### `/ops/nginx`
Legacy nginx configs (kept for reference, not actively used).

### `/ops/systemd`
systemd service and timer templates for site management.

**Files:**
- `webalive-mode-check.service` - Verifies site modes hourly
- `webalive-mode-check.timer` - Scheduling for verification

**Management:**
```bash
systemctl status webalive-mode-check.timer
systemctl status webalive-mode-check.service
```

### `/ops/scripts`
Operational scripts for server management. See `/ops/scripts/README.md` for detailed documentation.

**Scripts:**
- `check-site-health.sh` - Health check utility
- `monitor-sites.sh` - Auto-restart monitoring (cron job)
- `set-site-mode.sh` - Change site deployment mode
- `show-site-modes.sh` - Display all site modes
- `sync-site-modes.sh` - Sync registry with actual state
- `verify-site-modes.sh` - Verify + fix mode drift

**Registry:**
- `site-modes.json.template` - Template for `/var/lib/webalive/site-modes.json`

See `/ops/scripts/README.md` for full documentation.

## Deployment

### First-Time Setup
```bash
# Copy scripts to /usr/local/bin
sudo cp ops/scripts/*.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/*.sh

# Copy systemd units
sudo cp ops/systemd/*.service /etc/systemd/system/
sudo cp ops/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload

# Initialize registry
sudo mkdir -p /var/lib/webalive
sudo cp ops/scripts/site-modes.json.template /var/lib/webalive/site-modes.json

# Enable and start services
sudo systemctl enable webalive-mode-check.timer
sudo systemctl start webalive-mode-check.timer
```

### Initialize Monitoring
```bash
# Copy cron job
sudo cp ops/scripts/monitor-webalive-sites /etc/cron.d/

# Initialize logs
sudo touch /var/log/webalive-monitor.log
sudo touch /var/log/webalive-mode-check.log
sudo chmod 666 /var/log/webalive-*.log
```

## Git Policy

**Do NOT commit:**
- `ops/caddy/generated/Caddyfile.sites` - Generated routing (synced from `/var/lib/claude-bridge/generated/Caddyfile.sites`)
- `/var/lib/webalive/site-modes.json` - Runtime registry
- `/var/log/webalive-*.log` - Log files

**Do commit:**
- `ops/scripts/*.sh` - Operational tools
- `ops/systemd/*.service` - Service templates
- `ops/caddy/Caddyfile.example` - Reference templates
- `ops/*/README.md` - Documentation

See `.gitignore` for complete rules.

## Monitoring & Logs

### Service Health
```bash
# Check all site services
systemctl status 'site@*.service'

# View recent errors
journalctl -u 'site@*.service' -n 50 -e
```

### Mode Verification
```bash
# Check verification timer
systemctl status webalive-mode-check.timer

# View verification logs
tail -f /var/log/webalive-mode-check.log
```

### Site Monitoring
```bash
# View monitoring logs
tail -f /var/log/webalive-monitor.log

# Check cron status
systemctl status cron
```

## Troubleshooting

### Lost registry?
```bash
# Rebuild from actual systemd configs
sudo /usr/local/bin/sync-site-modes.sh
```

### Site mode drift?
```bash
# Verify and fix all sites
sudo /usr/local/bin/verify-site-modes.sh
```

### Manual health check
```bash
sudo /usr/local/bin/check-site-health.sh <domain> [port]
```

### View all site modes
```bash
sudo /usr/local/bin/show-site-modes.sh
```

## Contact

Infrastructure questions: DevOps team
Development questions: See main README.md and docs/
