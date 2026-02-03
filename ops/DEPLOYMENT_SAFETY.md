# Deployment Safety Guarantees

This document outlines the safeguards and best practices for deploying Claude Bridge without downtime or failures.

## The Problem We Solved

**Previous Issue:** During production deployment on 2026-02-03, a port conflict caused:
- New service tried to start on port 9000 while old service still occupied it
- Process exited cleanly (status=0), confusing systemd
- systemd restart limit was hit (3 restarts in 5 minutes)
- Service went into `start-limit-hit` state
- Required manual intervention to recover

**Root Cause:** No port coordination between old and new processes during deployment.

**Solution:** Multi-layered safety system with pre-flight checks, graceful shutdown, health verification, and automatic rollback.

## Safe Deployment Process

### Step 1: Pre-Deployment Checks (MANDATORY)

```bash
pre-deployment-check.sh [staging|production]
```

**Verifies:**
- Service exists and is accessible
- Restart limits not exceeded
- Port is available or service is running
- Adequate disk space (< 80% used)
- Adequate memory (> 500MB free)
- Health endpoint responding
- Build directory structure intact

**Exit codes:**
- `0` - All checks passed, safe to deploy
- `1` - Issues found, fix before deployment

**If checks fail:**
```bash
# Service in failed state?
systemctl reset-failed claude-bridge-production

# Restart limit exceeded?
systemctl reset-failed claude-bridge-production

# Port in use but service not running?
lsof -i :9000  # Find process
kill -9 <PID>  # Kill it
```

### Step 2: Zero-Downtime Deployment

```bash
safe-deploy.sh [staging|production] [--force]
```

**Process:**
1. Run pre-deployment checks
2. Identify newest build
3. Verify not already deployed
4. Execute zero-downtime swap:
   - Check port availability
   - Gracefully stop old service (30s timeout)
   - Update build symlink atomically
   - Start new service
   - Wait for readiness (60s)
   - Verify health endpoint
   - Report success or rollback

**Health checks:**
- Service actively running (systemd check)
- Health endpoint responding (`/api/health`)
- Memory/CPU within limits
- No errors in logs

**Automatic rollback triggers:**
- Service fails to start
- Health checks fail after 10 attempts
- Port becomes unavailable during startup
- Memory spike detected

### Step 3: Post-Deployment Monitoring

After successful deployment:
- Service automatically restarts if it crashes
- Monitoring cron checks every 5 minutes
- Logs stored in `/var/log/deployment-*.log`

## Safeguards in Place

### 1. Graceful Shutdown (TimeoutStopSec=10s)
- Service gets 10 seconds to shut down cleanly
- After timeout, forcefully killed with SIGKILL
- Prevents port from remaining in TIME_WAIT state

### 2. Start Timeout (TimeoutStartSec=60s)
- Service must be fully ready within 60 seconds
- Prevents hanging processes
- Allows time for health checks

### 3. Restart Limits (3 restarts in 5 minutes)
- After 3 failed starts, service enters failed state
- Prevents restart loops that exhaust resources
- Requires manual `reset-failed` to re-enable

### 4. Port Coordination
- Pre-deployment check verifies port availability
- Zero-downtime deployment stops old service first
- New service only starts after port is released

### 5. Health Verification
- New service must pass health check (`/api/health`)
- 10 retry attempts with 3-second delay (30 seconds total)
- Automatic rollback if health checks fail

### 6. Atomic Symlink Swap
```bash
# Build directory structure
.builds/production/
├── current -> dist.20260203-123600  (symlink)
├── dist.20260203-123600/            (previous)
└── dist.20260203-151116/            (new)

# Atomic update using temp symlink
ln -sfn dist.20260203-151116 current.tmp
mv current.tmp current  # Atomic on same filesystem
```

### 7. Automatic Rollback
If health checks fail, automatically:
1. Identify previous stable build
2. Update symlink back to previous version
3. Restart service
4. Verify rollback successful

## Deployment Scenarios

### Scenario 1: Normal Staging Deployment

```bash
# 1. Check readiness
pre-deployment-check.sh staging

# 2. Deploy
safe-deploy.sh staging

# 3. Verify
curl http://localhost:8998/api/health
```

**Expected output:**
```json
{
  "status": "healthy",
  "services": {
    "redis": {"status": "connected"},
    "database": {"status": "connected"}
  }
}
```

### Scenario 2: Production Deployment (Higher Stakes)

```bash
# 1. Extra careful checks
pre-deployment-check.sh production

# 2. Check logs first
journalctl -u claude-bridge-production -n 50

# 3. Deploy (never use --force for production)
safe-deploy.sh production

# 4. Monitor
tail -f /var/log/deployment-claude-bridge-production-*.log
journalctl -u claude-bridge-production -f
```

### Scenario 3: Emergency Rollback

If something goes wrong and auto-rollback didn't work:

```bash
# Identify previous build
ls /root/webalive/claude-bridge/.builds/production/

# Manual rollback
cd /root/webalive/claude-bridge/.builds/production
ln -sfn dist.20260203-123600 current.tmp
mv current.tmp current

# Restart service
systemctl restart claude-bridge-production

# Verify
curl http://localhost:9000/api/health
```

## Monitoring & Alerting

### Service Health Commands

```bash
# Status
systemctl status claude-bridge-production

# Recent logs
journalctl -u claude-bridge-production -n 100

# Restart history
systemctl show -p NRestarts --value claude-bridge-production

# Memory usage
systemctl show -p MemoryCurrent --value claude-bridge-production

# Port verification
lsof -i :9000
ss -tlnp | grep 9000
```

### Log Locations

| Log | Purpose |
|-----|---------|
| `/var/log/deployment-*.log` | Deployment script logs |
| `journalctl -u claude-bridge-production` | Service logs |
| `journalctl -u claude-bridge-staging` | Staging logs |

## Command Reference

### Pre-Deployment

```bash
# Full pre-flight check
pre-deployment-check.sh production

# Just check restart limits
systemctl show -p NRestarts,StartLimitBurst --value claude-bridge-production

# Just check port
lsof -i :9000 || echo "Port available"
```

### Deployment

```bash
# Safe deployment (recommended)
safe-deploy.sh production

# Direct zero-downtime deploy (if needed)
deploy-with-zero-downtime.sh claude-bridge-production \
  /root/webalive/claude-bridge/.builds/production/dist.xyz \
  9000

# Force deployment (NOT recommended, use only if --force in safe-deploy)
safe-deploy.sh production --force
```

### Post-Deployment

```bash
# Verify health
curl http://localhost:9000/api/health | jq .

# Check resources
systemctl status claude-bridge-production | grep Memory

# View recent errors
journalctl -u claude-bridge-production --since "1 hour ago" | grep -i error
```

## What NOT to Do

### ❌ DO NOT

```bash
# ❌ Kill service and manually start new build
kill -9 $(pgrep bun)
bun /path/to/server.js

# ❌ Modify symlink without stopping service first
rm current && ln -s dist.xyz current

# ❌ Deploy while service is in failed state
systemctl restart claude-bridge-production

# ❌ Ignore pre-deployment checks
safe-deploy.sh production --force
```

### ✅ DO Instead

```bash
# ✅ Let safe-deploy handle everything
safe-deploy.sh production

# ✅ Reset failed state first
systemctl reset-failed claude-bridge-production

# ✅ Always run pre-checks
pre-deployment-check.sh production

# ✅ Only use --force for staging when debugging
safe-deploy.sh staging --force
```

## Troubleshooting

### Service won't start

```bash
# Check what's using the port
lsof -i :9000

# Check service logs
journalctl -u claude-bridge-production -n 100

# Reset and try again
systemctl reset-failed claude-bridge-production
systemctl start claude-bridge-production

# Check health
curl http://localhost:9000/api/health
```

### Health checks failing

```bash
# Get detailed health status
curl -v http://localhost:9000/api/health

# Check service status
systemctl status claude-bridge-production

# Check recent errors
journalctl -u claude-bridge-production --since "5 min ago" | tail -50

# Check database connection
systemctl show -p ExecStart --value claude-bridge-production | grep -o "DB.*="
```

### Deployment taking too long

```bash
# Check service status
systemctl show -p State --value claude-bridge-production

# Increase timeout temporarily
# Edit /etc/systemd/system/claude-bridge-production.service
# Change TimeoutStartSec=60s to TimeoutStartSec=120s
systemctl daemon-reload
```

## Safety Checklist

Before every deployment, verify:

- [ ] `pre-deployment-check.sh` reports all checks passed
- [ ] Service health endpoint responding
- [ ] Disk space > 20% free
- [ ] Memory available > 500MB
- [ ] Restart limit not exceeded
- [ ] Build directory contains new version
- [ ] Ready for potential 1-2 minute service restart (health checks + rollback)

## Version History

**2026-02-03** - Implemented zero-downtime deployment after production incident
- Added pre-deployment safety checks
- Created graceful shutdown coordinator
- Implemented automatic rollback
- Enhanced systemd timeout configuration
- Added health verification before service swap
