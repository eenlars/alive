# Deployment Tests

This directory contains tests for the deployment infrastructure.

## Tests

### `concurrent-deploy.integration.test.ts`

**Purpose**: Validates that concurrent deployments don't corrupt the Caddyfile through proper file locking.

**Test Type**: Integration test (not E2E)

**Why Integration**:
- Tests API behavior (file locking mechanism), not UI
- Faster execution (~37s vs 2+ minutes for E2E)
- More reliable (no browser, no form validation timing)
- Easier to debug (console.log works, breakpoints work)

**What It Tests**:
1. Creates 3 test users with organizations
2. Makes 3 concurrent API calls to `/api/deploy-subdomain`
3. Verifies all deployments succeed
4. **Critical**: Validates Caddyfile integrity after concurrent writes:
   - Balanced braces
   - All domains present
   - No incomplete entries
   - No corruption
5. Verifies systemd services are running
6. Verifies site directories exist
7. Cleans up test data

**Running**:
```bash
# Run this specific test
bun run test features/deployment/__tests__/concurrent-deploy.integration.test.ts

# Run all deployment tests
bun run test features/deployment/__tests__/

# Run with verbose output
bun run test features/deployment/__tests__/concurrent-deploy.integration.test.ts --reporter=verbose
```

**Debugging**:
```typescript
// Add console.log in the test file
console.log("Response:", await response.json())

// Run with Node debugger
node --inspect-brk $(which bun) test features/deployment/__tests__/concurrent-deploy.integration.test.ts
```

**Known Issues**:
- Currently failing due to port validation mismatch in deployment script
- Sites deploy successfully (running on dynamic ports)
- Verification expects hardcoded port, finds different port
- This is a deployment infrastructure issue, not a test issue

**Maintenance**:
- Test users use `@alive-vitest.internal` domain (internal test domain)
- Automatically cleans up after itself (users, orgs, sites)
- Timeout: 3 minutes (enough for 3 concurrent deployments)

## Test History

**Original Version** (`e2e-tests/concurrent-deploy.spec.ts`):
- E2E test using Playwright
- Tested through browser UI (forms, clicks, etc.)
- Slow (~2+ minutes), flaky (form validation timing)
- Deprecated and skipped

**Current Version** (this file):
- Integration test using Vitest + fetch
- Tests API directly
- Fast (~37s), reliable, easy to debug
- Follows TESTING_GUIDE.md best practices

## Related Documentation

- [Testing Guide](../../../docs/testing/TESTING_GUIDE.md)
- [Deployment Architecture](../../../docs/deployment/)
- [Test Helpers](../../../lib/test-helpers/)
