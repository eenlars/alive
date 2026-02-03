# Deployment Guide

**⚠️ WARNING: Production deployment is intentionally restricted. Contact devops for production deploys.**

## Commands

### Dev & Staging Deployments

```bash
make staging                      # Full staging deployment (port 8998)
make dev                          # Rebuild tools + restart dev server (port 8997)
```

### Logs

```bash
make logs-staging                 # View staging environment logs
make logs-dev                     # View dev environment logs
```

### Status & Troubleshooting

```bash
make status                       # Show status of all environments
make rollback                     # Interactive rollback to previous build
```

### Site Deployment

For deploying individual websites (not the Claude Bridge):
```bash
bun run deploy-site <domain.com>  # Deploy a website to the infrastructure
```

### Verify Dev/Staging

```bash
curl -I http://localhost:8997/              # Test dev environment
systemctl status claude-bridge-dev          # Check dev process status
journalctl -u claude-bridge-dev -n 50       # View dev logs
```

## Dev Environment Troubleshooting

### Tests Failed Locally

**Symptom:** `ERROR: Tests failed`

**Cause:** One or more tests failing in the test suite

**Solution:**
```bash
# Run tests locally to see failures
bun run test

# Fix failing tests
# [make your fixes]

# Restart dev
make dev
```

**Prevention:** Always run `bun run test` locally before testing.

### CSS Not Loading in Dev (404)

**Symptom:** `/_next/static/chunks/*.css` returns 404

**Cause:** Dev assets not built properly

**Solution:**
```bash
make dev  # Full rebuild
```

**Prevention:** Build script copies assets automatically.

### Port 8997 Already in Use

**Symptom:** `ERROR: Port 8997 is in use by another process`

**Cause:** Stale process on port 8997 (deploy script now auto-kills these)

**Solution:**
```bash
# Check what's using the port
fuser 8997/tcp

# Kill it
fuser -k 8997/tcp

# Restart dev
make dev
```

### Dev Returns 500 Error

**Symptom:** Dev environment returns 500 or "ENOENT: no such file or directory"

**Cause:** Dev files not built properly

**Solution:**
```bash
systemctl restart claude-bridge-dev  # Regenerates dev files
# or
make dev
```

### Disk Space Full

**Symptom:** `ERROR: Insufficient disk space`

**Cause:** Less than 250MB available

**Solution:**
```bash
# Remove all but last 3 builds
cd .builds
ls -dt dist.* | tail -n +4 | xargs rm -rf
```

### Build Fails Locally

**Symptom:** Build script exits with error

**Solution:**
1. Check error message
2. Fix the issue
3. Run `make dev` again

## Configuration

### Build Paths
```
.builds/current/standalone/apps/web/server.js  # Production entry point
apps/web/.next/                                # Build source
```

### Systemd Services
```bash
# Dev (port 8997) - hot reload
systemctl status claude-bridge-dev
journalctl -u claude-bridge-dev -f

# Staging (port 8998)
systemctl status claude-bridge-staging
journalctl -u claude-bridge-staging -f

# Production (port 8999)
systemctl status claude-bridge
journalctl -u claude-bridge -f
```

All services are managed by systemd.

### Disk Usage
```
Each build: ~127MB
Retention: Last 3 builds
Total: ~400MB
```

## Safety Guarantees

- ✅ Concurrent deploys blocked (lock file)
- ✅ Failed builds don't affect production (atomic swap)
- ✅ CSS/static assets copied automatically
- ✅ Staging isolated (dev files backed up)
- ✅ Disk space checked before build
- ✅ Port conflicts detected early
- ✅ Old builds preserved for rollback
- ✅ Health checks with auto-rollback

See [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details.
