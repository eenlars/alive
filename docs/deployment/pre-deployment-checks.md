# Pre-Deployment Checks

This document describes the automated checks that run before every staging/production deployment to prevent bugs from reaching production.

## Implemented Checks

The deployment pipeline (`scripts/deployment/build-and-serve.sh`) now runs **4 layers of validation** before building and deploying:

### 1. Linter (Biome)
```bash
bun run lint
```
- **Purpose**: Catch code style issues, unused imports, and basic syntax errors
- **Blocks**: Deployment aborted if linter fails
- **Fix**: Run `bun run format` and `bun run lint` locally

### 2. TypeScript Type Checking ⭐ NEW
```bash
cd apps/web && bun run tsc
```
- **Purpose**: Catch type errors, undefined functions, missing imports
- **Example**: Would have caught `loginStaging` → `_loginDev` error
- **Blocks**: Deployment aborted if type checking fails
- **Fix**: Run `cd apps/web && bun run tsc` locally and fix type errors

### 3. Unit Tests (Vitest)
```bash
bun run test
```
- **Purpose**: Test individual functions and modules in isolation
- **Coverage**:
  - Security functions (auth, workspace validation)
  - Business logic (domain slug conversion, workspace resolution)
  - API utilities
- **Blocks**: Deployment aborted if any unit test fails
- **Fix**: Run `bun run test` locally

### 4. E2E Tests (Playwright) ⭐ NEW
```bash
cd apps/web && bun run test:e2e
```
- **Purpose**: Test full user flows in a real browser
- **Coverage**:
  - Authentication flows
  - Workspace selection
  - Chat interface
  - API protection layers
- **Blocks**: Deployment aborted if any E2E test fails
- **Note**: Runs against local test server with `PLAYWRIGHT_TEST=true`
- **Fix**: Run `bun run test:e2e` locally

## Test Coverage Added

### Workspace Resolution Unit Tests
**File**: `apps/web/features/chat/lib/workspaceRetriever.test.ts`

Tests the critical domain → slug conversion logic that was causing bugs:

```typescript
// Example: converts "demo.alive.best" → "/srv/webalive/sites/demo-goalive-nl/user"
```

**Coverage** (14 tests):
- ✅ Domain to slug conversion (dots → hyphens)
- ✅ Domain normalization (removes protocol, www, lowercases)
- ✅ Path construction (auto-prepends webalive/sites/, appends /user)
- ✅ Error handling (missing workspace, nonexistent directory)
- ✅ Security (path traversal prevention)
- ✅ Local dev mode (test workspace)

### Existing E2E Tests
- Authentication flow
- Organization/workspace selection
- Chat interface rendering
- Protection system verification
- Smoke tests

## Running Tests Locally

### Before committing:
```bash
# Quick validation
bun run lint
cd apps/web && bun run tsc

# Run tests
bun run test
bun run test:e2e
```

### Testing against dev server:
```bash
# Genuine E2E tests (requires dev server running)
cd apps/web && bun run test:e2e:genuine
```

## Deployment Flow

```
Developer pushes code
         ↓
make staging (or make dev)
         ↓
┌────────────────────────────┐
│ 1. Install dependencies    │
└────────────────────────────┘
         ↓
┌────────────────────────────┐
│ 2. Linter                  │  ← Catches style issues
│    (bun run lint)          │
└────────────────────────────┘
         ↓
┌────────────────────────────┐
│ 3. TypeScript Checking ⭐  │  ← Catches type errors, undefined functions
│    (bun run tsc)           │
└────────────────────────────┘
         ↓
┌────────────────────────────┐
│ 4. Unit Tests              │  ← Catches logic bugs
│    (bun run test)          │
└────────────────────────────┘
         ↓
┌────────────────────────────┐
│ 5. E2E Tests ⭐            │  ← Catches integration bugs
│    (bun run test:e2e)      │
└────────────────────────────┘
         ↓
┌────────────────────────────┐
│ 6. Build (next build)      │
└────────────────────────────┘
         ↓
┌────────────────────────────┐
│ 7. Deploy & Health Check   │
└────────────────────────────┘
```

## What Gets Caught

| Issue Type | Caught By | Example |
|------------|-----------|---------|
| Syntax errors in tests | TypeScript Checking | `loginStaging` instead of `_loginDev` |
| Type mismatches | TypeScript Checking | Passing `number` to function expecting `string` |
| Logic bugs | Unit Tests | Domain slug not converting dots to hyphens |
| Integration bugs | E2E Tests | Workspace resolution failing in browser |
| Auth bugs | E2E Tests | Session cookie not being set |
| UI bugs | E2E Tests | Chat input not visible |

## Performance Impact

Pre-deployment validation adds ~30-60 seconds to deployment time:
- Linter: ~5s
- TypeScript: ~10s
- Unit tests: ~5s
- E2E tests: ~30s
- **Total overhead**: ~50s

This is acceptable because it catches bugs **before** they reach staging/production, preventing:
- Failed deployments
- Rollbacks
- Hotfixes
- User-facing bugs

## Future Improvements

1. **Parallel execution**: Run linter + TypeScript + unit tests in parallel
2. **Cache TypeScript**: Use `--incremental` flag for faster type checking
3. **E2E test sharding**: Split E2E tests across multiple workers
4. **Smoke tests on staging**: Run genuine E2E tests against staging after deployment

## Related Documentation

- [Testing Guide](../testing/TESTING_GUIDE.md) - How to write tests
- [Deployment Guide](./deployment.md) - Full deployment documentation
- [Workspace Enforcement](../architecture/workspace-privilege-separation.md) - Security architecture
