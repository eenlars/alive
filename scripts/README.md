# Alive Scripts Organization

This directory contains all scripts for managing the Alive multi-tenant development platform. Scripts are organized by category for easy maintenance and discoverability.

## Directory Structure

### `deployment/` - Alive Environment Deployment
Scripts for building, deploying, and managing the three Alive environments (production, staging, dev).

**Key Scripts:**
- `deploy-prod.sh` - Deploy to production (port 9000)
- `deploy-staging.sh` - Deploy to staging (port 8998)
- `deploy-dev.sh` - Restart dev environment with hot-reload (port 8997)
- `build-and-serve.sh` - Core build and deployment script (production/staging)
- `build-atomic.sh` - Atomic build system with zero-downtime deployments
- `logs-prod.sh` - View production logs
- `logs-staging.sh` - View staging logs
- `logs-dev.sh` - View dev logs
- `status.sh` - Show status of all three environments
- `rollback.sh` - Interactive rollback to previous build

**Usage:**
```bash
make staging         # Staging deployment
make dev             # Dev restart
make logs-staging    # Staging logs
make logs-dev        # Dev logs
make status          # Status of all environments
make rollback        # Interactive rollback

# ⚠️  Production deployment is restricted - contact devops
```

### `sites/` - Website/Project Deployment
Scripts for deploying and managing individual customer websites.

**Key Scripts:**
- `deploy-site-systemd.sh` - Deploy a new site with systemd isolation
- `delete-site.sh` - Delete a site (stops service, removes files, updates Caddy)
- `add-verification-files.sh` - Add alive verification files to sites
- `fix-file-ownership.sh` - Fix file permissions for site access

**Usage:**
```bash
scripts/sites/deploy-site-systemd.sh example.com
scripts/sites/delete-site.sh example.com           # Interactive
scripts/sites/delete-site.sh example.com --force   # Non-interactive
```

### `database/` - Database Migration & Cleanup
Scripts for database initialization, migrations, and data cleanup.

**Key Scripts:**
- `init-database.ts` - Initialize Supabase database
- `migrate-to-database.ts` - Migrate from JSON to database
- `cleanup-legacy-test-orgs.ts` - Clean up test organizations
- `cleanup-test-database.ts` - Clean test data from database
- `verify-migration.ts` - Verify migration success

**Usage:**
```bash
bun scripts/database/init-database.ts
bun scripts/database/migrate-to-database.ts
```

### `testing/` - Testing & Verification
Scripts for testing deployments, workspace invariants, and API endpoints.

**Key Scripts:**
- `test-upload.js` - Test file upload functionality
- `test-workspace-invariants.js` - Verify workspace consistency
- `test-ws-connection.js` - Test WebSocket connections
- `test-reload.js` - Test dev server hot reload

**Usage:**
```bash
node scripts/testing/test-upload.js
node scripts/testing/test-workspace-invariants.js
```

### `maintenance/` - System Maintenance & Setup
Scripts for system setup, backups, and periodic maintenance tasks.

**Key Scripts:**
- `setup-auto-cleanup.sh` - Setup automatic cleanup jobs
- `setup-webhook.sh` - Configure GitHub webhooks
- `backup-current-state.sh` - Backup current deployment state
- `backfill-created-dates.sh` - Backfill creation dates
- `update-cors-domains.sh` - Update CORS configuration

**Usage:**
```bash
bash scripts/maintenance/backup-current-state.sh
bash scripts/maintenance/setup-webhook.sh
```

### `utilities/` - Utility Functions & Helpers
Reusable utility scripts for common operations.

**Key Scripts:**
- `hash-password.mjs` - Hash passwords for database
- `migrate-passwords-to-bcrypt.mjs` - Migrate passwords to bcrypt
- `link-workspace-deps.sh` - Link workspace dependencies

**Usage:**
```bash
node scripts/utilities/hash-password.mjs mypassword
```

### `setup/` - Installation & Configuration
Initial setup scripts (auto-populated by installation process).

### `docs/` - Documentation
Important documentation about scripts and operations.

**Files:**
- `CLEANUP_SAFETY.md` - Safety guidelines for cleanup operations
- `TEST_EMAIL_ENFORCEMENT.md` - Email validation documentation

## Architecture Overview

### Three-Tier Environment Model

| Environment | Port | Type | Domain | Build Directory | Command |
|-------------|------|------|--------|-----------------|---------|
| **Production** | 9000 | Standalone | terminal.goalive.nl | `.builds/prod/current/` | Restricted - contact devops |
| **Staging** | 8998 | Standalone | staging.terminal.goalive.nl | `.builds/staging/current/` | `make staging` |
| **Dev** | 8997 | Hot-reload | dev.terminal.goalive.nl | `node_modules/.bin/next dev` | `make dev` |

### Single Source of Truth

All environment configuration is defined in:
- **`packages/shared/src/environments.json`** - Master configuration file (scripts read this with `jq`)
- **`environments.config.ts`** - TypeScript interface for type-safe access

### Deployment Flow

```
make deploy/staging
    ↓
deploy-prod/staging.sh
    ↓
build-and-serve.sh [prod|staging]
    ↓
build-atomic.sh [prod|staging]
    ├─ Install dependencies
    ├─ Run linter & tests
    ├─ Build project
    ├─ Atomic symlink swap (.builds/{env}/dist.TIMESTAMP → current)
    └─ Zero-downtime restart
```

### Dev Environment

Dev does NOT use `build-and-serve.sh` or `build-atomic.sh`. Instead:

```
make dev
    ↓
deploy-dev.sh
    ├─ Rebuild packages (images, tools)
    ├─ Run linter
    └─ Restart systemd service (next dev --turbo)
```

## Best Practices

1. **Always use `make` commands** - These handle path resolution automatically
2. **Use relative paths in scripts** - Scripts calculate `PROJECT_ROOT` dynamically
3. **Keep scripts in subdirectories** - Don't add scripts to root of `scripts/` folder
4. **Update paths when moving scripts** - Ensure relative path calculations are correct
5. **Test after reorganizing** - Verify all Make targets work as expected

## Common Operations

### View logs in real-time
```bash
make logs-staging    # Staging logs
make logs-dev        # Dev logs
```

### Check environment status
```bash
make status
```

### Deploy new changes
```bash
make staging         # Test in staging first
# Production deployment restricted - contact devops
```

### Rollback to previous build
```bash
make rollback        # Interactive selection
```

### Restart dev environment
```bash
make dev
```

## Adding New Scripts

1. Choose the appropriate subdirectory based on function
2. Name the script descriptively (e.g., `backup-database.sh`)
3. Add a comment header explaining purpose and usage
4. Use `SCRIPT_DIR` and `PROJECT_ROOT` for path resolution
5. Update relevant Make targets or documentation
6. Test the script before committing

## Path Resolution Pattern

All scripts should follow this pattern for reliable path resolution:

```bash
#!/bin/bash
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"  # Adjust ../ based on nesting level
```

For scripts in subdirectories:
- `deployment/script.sh` → `$(cd "$SCRIPT_DIR/../.." && pwd)` (up 2 levels)
- `database/script.ts` → `$(cd "$SCRIPT_DIR/../.." && pwd)` (up 2 levels)
- `setup/script.sh` → `$(cd "$SCRIPT_DIR/../.." && pwd)` (up 2 levels)

## Troubleshooting

### Script path errors
- Check that `SCRIPT_DIR` and `PROJECT_ROOT` calculations are correct
- Run script with absolute path to verify: `/root/alive/scripts/deployment/deploy-prod.sh`

### Makefile not finding scripts
- Update script paths in Makefile if you reorganize
- Use `@./scripts/deployment/script-name.sh` format

## References

- [Makefile](../Makefile) - Main deployment commands
- [environments.json](../environments.json) - Environment configuration
- [Deployment Documentation](../docs/deployment/deployment.md) - Detailed deployment guide
