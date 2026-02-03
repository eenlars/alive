# Safe Config Migration Guide

This guide ensures config/file migrations don't break production or development environments.

**Required reading after**: [Postmortem 2025-11-23](../postmortems/2025-11-23-config-migration-outage.md)

---

## When to Use This Guide

Use this checklist when:
- Moving config files to new locations
- Renaming config files
- Deleting deprecated config files
- Refactoring environment variables
- Changing config file formats (e.g., JSON → TypeScript)

---

## Pre-Migration Checklist

### 1. Document the Migration

Create a migration plan in `docs/migrations/YYYY-MM-DD-migration-name.md`:

```markdown
# Migration: [Brief description]

## Motivation
Why this migration is needed

## Changes
- Old: `path/to/old-file.js`
- New: `path/to/new-file.ts`

## Affected Services
- [ ] Dev server (systemd)
- [ ] Staging server
- [ ] Production server
- [ ] CLI tools
- [ ] Tests

## Rollback Plan
Steps to revert if something goes wrong
```

### 2. Identify All References

**Critical**: Search for ALL references before deleting files.

```bash
# Search in code
grep -r "old-config.js" . \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=.git \
  --exclude-dir=dist

# Check package.json scripts specifically
grep "old-config" apps/*/package.json packages/*/package.json

# Check bash scripts
grep "old-config" scripts/*.sh

# Check documentation
grep "old-config" docs/**/*.md
```

**Look for:**
- ✅ TypeScript/JavaScript imports: `import ... from './old-config'`
- ✅ CommonJS requires: `require('./old-config')`
- ✅ Dynamic requires in scripts: `require('../../old-config.js').value`
- ✅ Bash script references: `source old-config.sh`
- ✅ JSON references: `"configPath": "./old-config.json"`
- ✅ Documentation examples
- ✅ Environment variable references

### 3. Create New Config First

**Important**: Create new config BEFORE updating references.

```bash
# Create new config file
# Update format, structure, values as needed
# Test that it loads correctly
```

---

## Migration Execution

### Step 1: Update All References

Update references in this order (least to most critical):

1. ✅ **Documentation** - Update examples, references
2. ✅ **Tests** - Update test fixtures, mock configs
3. ✅ **Type definitions** - Update TypeScript types
4. ✅ **Application code** - Update imports/requires
5. ✅ **Scripts** - Update bash/npm scripts
6. ✅ **package.json** - Update npm scripts last

**For npm scripts** - avoid dynamic requires:

```json
// ❌ Bad - dynamic require
{
  "scripts": {
    "dev": "next dev -p $(node -p \"require('./config.js').port\")"
  }
}

// ✅ Good - import and reference
{
  "scripts": {
    "dev": "node scripts/dev.js"
  }
}
```

```typescript
// scripts/dev.js
import { config } from './config'
import { spawn } from 'child_process'

spawn('next', ['dev', '-p', config.port], { stdio: 'inherit' })
```

### Step 2: Validate No References

**Critical step** - DO NOT SKIP!

```bash
# Use the validation script
./scripts/validate-no-deleted-refs.sh old-config.js old-config.json

# Expected output: ✅ VALIDATION PASSED
```

If validation fails:
1. ❌ **DO NOT DELETE FILES YET**
2. Update remaining references
3. Re-run validation
4. Repeat until validation passes

### Step 3: Test in Dev Environment

**Before deleting any files**, test in development:

```bash
# Restart services
pm2 restart claude-bridge-dev

# Check logs for errors
pm2 logs claude-bridge-dev --lines 50

# Run test suite
bun run test        # Unit tests
bun run test:e2e    # E2E tests

# Build check
bun run build

# Type check
bun run type-check
```

**Validation criteria:**
- ✅ No errors in PM2 logs
- ✅ Service stays running (not restarting)
- ✅ All tests pass
- ✅ Build succeeds
- ✅ TypeScript compiles

### Step 4: Delete Old Files

Only after ALL validation passes:

```bash
# Delete old config files
rm path/to/old-config.js
rm path/to/old-config.json

# Commit the deletion
git add -A
git commit -m "chore: remove deprecated config files after migration to new-config.ts

Migration validated:
- No remaining references (validated with validate-no-deleted-refs.sh)
- Dev server tested and stable
- All tests passing (unit + E2E)
- Build and type-check passing

Related: docs/migrations/YYYY-MM-DD-migration-name.md"
```

---

## Post-Migration Validation

### Immediate checks (within 5 minutes):

1. **Dev server health**
   ```bash
   # Check PM2 status
   pm2 status

   # Check for rapid restarts
   pm2 logs claude-bridge-dev --lines 100 | grep -i error

   # Test endpoint
   curl https://dev.terminal.goalive.nl/api/health
   ```

2. **Run full test suite**
   ```bash
   bun run test && bun run test:e2e
   ```

3. **Monitor for 10 minutes**
   - Watch PM2 restart count
   - Check error logs
   - Verify no 502 errors

### Follow-up checks (within 24 hours):

1. **Staging deployment**
   ```bash
   # Deploy to staging
   make staging

   # Verify staging health
   curl https://staging.terminal.goalive.nl/api/health
   ```

2. **Monitor metrics**
   - Error rates
   - Response times
   - Restart counts

---

## Rollback Procedure

If issues are detected:

### Immediate rollback (if files still exist):

```bash
# 1. Restore old files
git checkout HEAD~1 -- path/to/old-config.js

# 2. Revert code changes
git revert <migration-commit>

# 3. Restart services
pm2 restart all

# 4. Verify stability
pm2 status
pm2 logs --lines 50
```

### Full rollback (if files deleted):

```bash
# 1. Revert the entire migration commit
git revert <migration-commit>
git push

# 2. Redeploy
make dev        # or make staging, make production

# 3. Verify
# Run through Post-Migration Validation checklist
```

---

## Common Pitfalls

### ❌ Don't Do This:

1. **Deleting files before updating references**
   - Always update references first, delete last

2. **Skipping validation script**
   - Always run `validate-no-deleted-refs.sh`

3. **Not testing service restarts**
   - Always restart and monitor for errors

4. **Using dynamic requires in npm scripts**
   - Hard to test, easy to miss during validation

5. **Forgetting about bash scripts**
   - Check `scripts/*.sh`, systemd configs, cron jobs

6. **Only checking TypeScript files**
   - Also check: JSON, bash, markdown, env files

### ✅ Do This Instead:

1. **Create migration document first**
2. **Search exhaustively for references**
3. **Run validation script**
4. **Test service restarts**
5. **Monitor for 24 hours after migration**
6. **Keep rollback plan ready**

---

## Examples

### Example 1: Moving Config File

```bash
# Starting state
config/old.json    # To delete
config/new.ts      # New location

# Step 1: Create new config
# (already done)

# Step 2: Search for references
grep -r "old.json" . --exclude-dir=node_modules

# Output shows:
# - src/lib/config.ts:import old from '../config/old.json'
# - scripts/deploy.sh:CONFIG_FILE="config/old.json"
# - docs/setup.md:Copy `config/old.json.example`

# Step 3: Update all three files
# ... (make updates)

# Step 4: Validate
./scripts/validate-no-deleted-refs.sh old.json
# ✅ VALIDATION PASSED

# Step 5: Test
pm2 restart claude-bridge-dev
bun run test

# Step 6: Delete
rm config/old.json
git commit -m "chore: remove old.json after migration to new.ts"
```

### Example 2: Renaming Config Format

```bash
# Change: config.js → config.ts (adding types)

# Step 1: Create config.ts with proper types
# Step 2: Update imports to use .ts
# Step 3: Validate no .js references remain
./scripts/validate-no-deleted-refs.sh config.js
# Step 4: Delete config.js
```

---

## Monitoring Checklist

After migration, monitor these metrics:

- [ ] PM2 restart count (should not increase)
- [ ] Error rate (should remain stable)
- [ ] Response time (should remain stable)
- [ ] Test pass rate (should remain 100%)
- [ ] Dev server uptime (should be 100%)

**Alert thresholds:**
- 🚨 >10 restarts in 5 minutes
- 🚨 >5% error rate increase
- 🚨 >50% response time increase
- 🚨 Any test failures

---

## Related Documentation

- [Postmortem: 2025-11-23 Config Migration Outage](../postmortems/2025-11-23-config-migration-outage.md)
- [Environment Configuration](../deployment/ENVIRONMENTS_CONFIG.md)
- [PM2 Management](../deployment/pm2-management.md)

---

## Quick Reference

```bash
# Migration workflow (copy-paste friendly)

# 1. Document
vim docs/migrations/$(date +%Y-%m-%d)-migration-name.md

# 2. Search
grep -r "old-file" . --exclude-dir=node_modules --exclude-dir=.git

# 3. Update references
# ... (manually update all files)

# 4. Validate
./scripts/validate-no-deleted-refs.sh old-file.js
# Must pass before continuing!

# 5. Test
pm2 restart claude-bridge-dev
pm2 logs claude-bridge-dev --lines 50
bun run test
bun run test:e2e

# 6. Delete (only if all tests pass)
rm old-file.js
git add -A
git commit -m "chore: remove old-file.js after migration"

# 7. Monitor
pm2 status
# Watch for 10 minutes, check restart count
```

---

**Last updated**: 2025-11-23
**Maintainer**: DevOps Team
