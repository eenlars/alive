# Caddy Operations Reference

**Last Updated**: 2025-11-20

This document describes all Caddy-related operations available in the `@webalive/site-controller` package.

## Overview

ALL Caddy operations for the WebAlive infrastructure are centralized in this package. This ensures:
- Consistent error handling
- Proper file locking (prevents concurrent Caddyfile corruption)
- Atomic operations via bash scripts
- Type-safe TypeScript interface
- Single source of truth for Caddy management

## Architecture

The site-controller uses a **Shell-Operator Pattern**:
- **TypeScript** (Brain): Orchestration, error handling, type safety
- **Bash Scripts** (Hands): Atomic file operations, flock, systemctl

## Available Operations

### 1. configureCaddy()

**Purpose**: Add or update a domain in Caddyfile with reverse proxy configuration

**Signature**:
```typescript
async function configureCaddy(params: ConfigureCaddyParams): Promise<void>

interface ConfigureCaddyParams {
  domain: string          // Domain name (e.g., example.com)
  port: number           // Port number for reverse proxy
  caddyfilePath: string  // Path to Caddyfile
  caddyLockPath: string  // Path to lock file
  flockTimeout: number   // Flock timeout in seconds
}
```

**What it does**:
1. Acquires flock on Caddyfile (prevents concurrent corruption)
2. Checks if domain block exists
3. If exists: Updates port in existing block
4. If not: Appends new domain block with headers
5. Releases lock
6. Reloads Caddy via systemctl
7. Waits 2 seconds for reload
8. Tests HTTPS endpoint (warns if not accessible)

**Example**:
```typescript
import { configureCaddy, PATHS, DEFAULTS } from '@webalive/site-controller'

await configureCaddy({
  domain: 'example.com',
  port: 3333,
  caddyfilePath: PATHS.CADDYFILE_PATH,
  caddyLockPath: PATHS.CADDY_LOCK,
  flockTimeout: DEFAULTS.FLOCK_TIMEOUT,
})
```

**Bash Script**: `scripts/05-caddy-inject.sh`

---

### 2. teardown()

**Purpose**: Remove a site completely (stops service, removes from Caddy, optionally removes user/files)

**Signature**:
```typescript
async function teardown(params: TeardownParams): Promise<void>

interface TeardownParams {
  domain: string
  slug: string
  serviceName: string
  removeUser?: boolean      // Optional: Delete system user
  removeFiles?: boolean     // Optional: Delete site files
  caddyfilePath?: string    // Optional: Path to Caddyfile
  caddyLockPath?: string    // Optional: Path to lock file
  envFilePath?: string      // Optional: Path to env file
  registryPath?: string     // Optional: Path to port registry
}
```

**What it does**:
1. Stops and disables systemd service
2. Acquires flock on Caddyfile
3. Removes domain block from Caddyfile (if caddyfilePath provided)
4. Reloads Caddy
5. Releases lock
6. Removes environment file (if envFilePath provided)
7. Removes port from registry (if registryPath provided)
8. Optionally removes system user (if removeUser=true)
9. Optionally removes site files (if removeFiles=true)

**Example**:
```typescript
import { teardown, PATHS } from '@webalive/site-controller'

await teardown({
  domain: 'example.com',
  slug: 'example-com',
  serviceName: 'site@example-com.service',
  removeUser: false,
  removeFiles: false,
  caddyfilePath: PATHS.CADDYFILE_PATH,
  caddyLockPath: PATHS.CADDY_LOCK,
  envFilePath: '/etc/sites/example-com.env',
  registryPath: PATHS.REGISTRY_PATH,
})
```

**Bash Script**: `scripts/99-teardown.sh`

---

### 3. reloadCaddy()

**Purpose**: Reload Caddy configuration with zero downtime

**Signature**:
```typescript
async function reloadCaddy(): Promise<void>
```

**What it does**:
1. Executes `systemctl reload caddy`
2. Throws error if reload fails

**Example**:
```typescript
import { reloadCaddy } from '@webalive/site-controller'

try {
  await reloadCaddy()
  console.log('Caddy reloaded successfully')
} catch (error) {
  console.error('Caddy reload failed:', error.message)
}
```

**Use Cases**:
- Manual reload via manager API
- Test cleanup (E2E/integration tests)
- After manual Caddyfile edits

---

### 4. getCaddyStatus()

**Purpose**: Check if Caddy service is active and get detailed status

**Signature**:
```typescript
async function getCaddyStatus(): Promise<CaddyStatus>

interface CaddyStatus {
  isActive: boolean  // True if service is active
  status: string     // Output from systemctl status
  message?: string   // Human-readable message
}
```

**What it does**:
1. Checks `systemctl is-active --quiet caddy`
2. Gets detailed status from `systemctl status caddy`
3. Returns combined result

**Example**:
```typescript
import { getCaddyStatus } from '@webalive/site-controller'

const status = await getCaddyStatus()
if (status.isActive) {
  console.log('Caddy is running')
} else {
  console.error('Caddy is not active:', status.status)
}
```

**Use Cases**:
- Pre-deployment health checks
- Monitoring scripts
- Deployment verification

---

### 5. validateCaddyConfig()

**Purpose**: Validate Caddyfile syntax without applying changes

**Signature**:
```typescript
async function validateCaddyConfig(caddyfilePath: string): Promise<CaddyValidation>

interface CaddyValidation {
  isValid: boolean  // True if config is valid
  output: string    // Stdout from caddy validate
  error?: string    // Stderr if validation failed
}
```

**What it does**:
1. Executes `caddy validate --config <path>`
2. Returns validation result with output

**Example**:
```typescript
import { validateCaddyConfig, PATHS } from '@webalive/site-controller'

const result = await validateCaddyConfig(PATHS.CADDYFILE_PATH)
if (!result.isValid) {
  console.error('Caddyfile validation failed:', result.error)
  process.exit(1)
}
```

**Use Cases**:
- Pre-deployment validation
- CI/CD checks
- Before reloading Caddy

---

### 6. checkDomainInCaddy()

**Purpose**: Check if a domain exists in Caddyfile

**Signature**:
```typescript
async function checkDomainInCaddy(domain: string, caddyfilePath: string): Promise<boolean>
```

**What it does**:
1. Reads Caddyfile content
2. Searches for domain block (e.g., `example.com {`)
3. Returns true if found, false otherwise

**Example**:
```typescript
import { checkDomainInCaddy, PATHS } from '@webalive/site-controller'

const exists = await checkDomainInCaddy('example.com', PATHS.CADDYFILE_PATH)
if (exists) {
  console.log('Domain is already configured')
} else {
  console.log('Domain needs to be added')
}
```

**Use Cases**:
- Pre-deployment checks
- Idempotent deployments
- Status queries

---

## File Locking Pattern

All Caddyfile modifications use **flock** to prevent concurrent corruption:

```bash
# Acquire lock (30 second timeout, file descriptor 200)
exec 200>"$CADDY_LOCK_PATH"
flock -w 30 200 || die "Failed to acquire lock"

# Critical section: modify Caddyfile
...

# Release lock
flock -u 200
```

**Lock file**: `/tmp/caddyfile.lock` (configurable via `PATHS.CADDY_LOCK`)

**Timeout**: 30 seconds (configurable via `DEFAULTS.FLOCK_TIMEOUT`)

This ensures that concurrent deployments (e.g., 3 users deploying simultaneously) wait in queue rather than corrupting the Caddyfile.

---

## Constants

Use these constants for consistent configuration:

```typescript
import { PATHS, DEFAULTS } from '@webalive/site-controller'

// Paths
PATHS.CADDYFILE_PATH     // '/root/alive/Caddyfile'
PATHS.CADDY_LOCK         // '/tmp/caddyfile.lock'

// Defaults
DEFAULTS.FLOCK_TIMEOUT   // 30 (seconds)
DEFAULTS.CADDY_WAIT_MS   // 2000 (milliseconds)
```

---

## Migration Guide

### For API Routes

**Before** (direct systemctl):
```typescript
// apps/web/app/api/manager/caddy/reload/route.ts
import { execSync } from "node:child_process"

const output = execSync("systemctl reload caddy", { encoding: "utf-8" })
```

**After** (use site-controller):
```typescript
import { reloadCaddy } from '@webalive/site-controller'

try {
  await reloadCaddy()
} catch (error) {
  console.error('Caddy reload failed:', error.message)
}
```

### For Tests

**Before** (direct systemctl):
```typescript
import { execSync } from "node:child_process"

execSync("systemctl reload caddy", { stdio: "ignore" })
```

**After** (use site-controller):
```typescript
import { reloadCaddy } from '@webalive/site-controller'

try {
  await reloadCaddy()
} catch {
  // Best effort cleanup
}
```

### For Deployment Scripts

**Before** (duplicate bash logic):
```bash
# Check if domain exists
if grep -q "^$DOMAIN {" "$CADDYFILE"; then
  # Update port...
else
  # Add domain...
fi
systemctl reload caddy
```

**After** (use site-controller orchestrator):
```typescript
import { SiteOrchestrator } from '@webalive/site-controller'

const orchestrator = new SiteOrchestrator()
await orchestrator.deploy({
  domain: 'example.com',
  slug: 'example-com',
  templatePath: '/path/to/template',
})
// Caddy configuration handled automatically
```

---

## Error Handling

All operations throw errors with descriptive messages:

```typescript
import { reloadCaddy } from '@webalive/site-controller'

try {
  await reloadCaddy()
} catch (error) {
  if (error.message.includes('Failed to reload Caddy')) {
    // Handle Caddy reload failure
  }
}
```

For script operations (`configureCaddy`, `teardown`), errors include:
- Script name
- Exit code
- Stdout
- Stderr

```typescript
import { configureCaddy } from '@webalive/site-controller'
import { ScriptError } from '@webalive/site-controller/dist/executors/common'

try {
  await configureCaddy(params)
} catch (error) {
  if (error instanceof ScriptError) {
    console.error(`Script ${error.script} failed with code ${error.exitCode}`)
    console.error('Stderr:', error.stderr)
    console.error('Stdout:', error.stdout)
  }
}
```

---

## Testing

The package includes unit tests for configuration validation:

```bash
cd packages/site-controller
bun run test
```

For integration testing with real Caddy operations, use a test environment with proper permissions.

---

## Design Decisions

### Why Not a CaddyService Class?

We considered creating a dedicated `CaddyService` class but chose to extend the executor pattern instead:

**Rationale**:
1. **Consistency**: All site-controller executors use functions, not classes
2. **Atomicity**: Bash scripts handle complex flock logic atomically
3. **Simplicity**: Thin TypeScript wrappers, heavy lifting in bash
4. **Composability**: Functions are easier to use in orchestrator
5. **Testing**: Pure functions are easier to test than stateful classes

### Why Bash Scripts?

Bash scripts provide:
- **Atomicity**: All-or-nothing operations with `set -e`
- **File locking**: Native flock support
- **System integration**: Direct systemctl/systemd access
- **Idempotency**: Same operation can run multiple times safely
- **Error handling**: Exit codes and stderr capture

TypeScript provides:
- **Type safety**: Compile-time checks
- **Error handling**: Try/catch and structured errors
- **Orchestration**: Coordinate multiple operations
- **Async**: Promise-based flow control

---

## Summary

| Operation | Purpose | Bash Script | Status |
|-----------|---------|-------------|--------|
| `configureCaddy()` | Add/update domain | `05-caddy-inject.sh` | ✅ Implemented |
| `teardown()` | Remove site completely | `99-teardown.sh` | ✅ Implemented |
| `reloadCaddy()` | Reload Caddy config | N/A (direct systemctl) | ✅ Implemented |
| `getCaddyStatus()` | Check Caddy status | N/A (direct systemctl) | ✅ Implemented |
| `validateCaddyConfig()` | Validate Caddyfile | N/A (direct caddy CLI) | ✅ Implemented |
| `checkDomainInCaddy()` | Check domain exists | N/A (reads file) | ✅ Implemented |

**Total Operations**: 6
**Bash Scripts**: 2 (atomic operations with flock)
**TypeScript Wrappers**: 6 (all operations)
**Package Exports**: All operations exported via `src/index.ts`

---

## Next Steps

### Recommended Migrations

1. **Update Manager API** (`apps/web/app/api/manager/caddy/reload/route.ts`)
   - Replace `execSync("systemctl reload caddy")` with `reloadCaddy()`

2. **Update E2E Tests** (`apps/web/e2e-tests/concurrent-deploy.spec.ts`)
   - Replace direct systemctl calls with `reloadCaddy()`

3. **Update Integration Tests** (`apps/web/features/deployment/__tests__/`)
   - Replace direct systemctl calls with `reloadCaddy()`

4. **Deprecate Old Scripts** (`scripts/sites/deploy-site-systemd.sh`)
   - Mark as deprecated, point users to site-controller orchestrator

5. **Update Build Script** (`scripts/deployment/build-and-serve.sh`)
   - Consider using `getCaddyStatus()` and `reloadCaddy()` (optional, as this is for Alive deployment, not sites)

### Future Enhancements

- Add `restartCaddy()` for full restart (non-zero-downtime)
- Add `getCaddyVersion()` for version reporting
- Add `backupCaddyfile()` for pre-modification backups
- Add `rollbackCaddyfile()` for rollback on failure
- Add metrics/logging for Caddy operations

---

## Support

For issues or questions:
1. Check this documentation
2. Review bash scripts in `packages/site-controller/scripts/`
3. Check TypeScript source in `packages/site-controller/src/executors/caddy.ts`
4. Consult main README: `/root/alive/packages/site-controller/README.md`
