# Genuine E2E Tests - Architecture & Setup

This document explains the architecture of genuine E2E tests and how they differ from regular E2E tests.

## Purpose

Genuine E2E tests make **REAL API calls** to Claude to verify the complete request/response pipeline works end-to-end without mocks.

## Architecture

### Test Lifecycle

```
1. globalSetup (genuine-setup.ts)
   └─> Creates /tmp/test-workspace with minimal structure

2. webServer starts (start-test-server-genuine.sh)
   └─> BRIDGE_ENV=local, NO PLAYWRIGHT_TEST flag

3. Tests run (chat-genuine.spec.ts)
   └─> Real API calls to Claude

4. globalTeardown (genuine-teardown.ts)
   └─> Removes /tmp/test-workspace
```

### File Structure

```
e2e-tests/
├── genuine-setup.ts          # Creates test workspace before all tests
├── genuine-teardown.ts       # Cleans up test workspace after all tests
├── chat-genuine.spec.ts      # Genuine test (uses real Claude API)
├── fixtures/
│   └── test-data.ts          # TEST_USER, TEST_WORKSPACE constants
└── helpers.ts                # Shared test helpers
```

### Configuration Files

**playwright.genuine.config.ts**:
```typescript
{
  testMatch: "**/*-genuine.spec.ts",  // Only run *-genuine tests
  globalSetup: "./e2e-tests/genuine-setup.ts",
  globalTeardown: "./e2e-tests/genuine-teardown.ts",
  webServer: {
    command: "bash scripts/start-test-server-genuine.sh",
    port: 9548
  }
}
```

**start-test-server-genuine.sh**:
- Sets `BRIDGE_ENV=local` (enables test mode)
- Does NOT set `PLAYWRIGHT_TEST=true` (allows real API calls)
- Starts server on port 9548

### Test Workspace

**Path**: `/tmp/test-workspace`
**Created by**: `genuine-setup.ts` (before tests)
**Cleaned by**: `genuine-teardown.ts` (after tests)

**Structure**:
```
/tmp/test-workspace/
├── package.json
├── index.html
├── src/
└── README.md
```

**Why needed?**
- Claude operations require a valid workspace directory
- Provides working directory for file operations (if tests use them)
- Ensures consistent test environment

### Authentication Flow

**Test Credentials** (from `fixtures/test-data.ts`):
```typescript
{
  email: "test@bridge.local",
  password: "test",
  workspace: "test.bridge.local"
}
```

**How it works**:
1. `BRIDGE_ENV=local` enables test mode in auth system
2. `workspace=test.bridge.local` triggers special handling
3. `workspaceRetriever.ts` returns `/tmp/test-workspace` path
4. API calls use this workspace as working directory

## Key Differences from Regular E2E Tests

| Aspect | Regular E2E | Genuine E2E |
|--------|-------------|-------------|
| **Config** | `playwright.config.ts` | `playwright.genuine.config.ts` |
| **Test Pattern** | `*.spec.ts` | `*-genuine.spec.ts` |
| **Server Port** | 9547 | 9548 |
| **PLAYWRIGHT_TEST** | `true` (blocks API) | NOT SET (allows API) |
| **API Calls** | Mocked | Real Claude API |
| **Cost** | Free | $$ (uses credits) |
| **Speed** | Fast (~2s) | Slow (~15s) |
| **Setup** | `setup.ts` | `genuine-setup.ts` |
| **Workspace** | Mocked | Real `/tmp/test-workspace` |

## How to Run

```bash
# Run all genuine tests
bun run test:e2e:genuine

# Run with UI (visual debugging)
bun run test:e2e:genuine:ui

# Run in headed mode (see browser)
bun run test:e2e:genuine:headed
```

## Prerequisites

1. **Environment Variables** (`.env`):
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   JWT_SECRET=...
   ```

2. **Chromium** (first time only):
   ```bash
   bunx playwright install chromium
   ```

3. **API Credits**:
   - Tests consume real Anthropic API credits
   - Haiku model: ~$0.01 per test
   - Budget accordingly

## Adding New Genuine Tests

1. **Create file**: `e2e-tests/your-feature-genuine.spec.ts`
2. **Import fixtures**:
   ```typescript
   import { test, expect } from "@playwright/test"
   import { TEST_USER, TEST_TIMEOUTS } from "./fixtures/test-data"
   ```
3. **Use consistent patterns**:
   ```typescript
   test("your test", async ({ page }) => {
     // Login with TEST_USER
     await page.goto("/")
     await page.getByPlaceholder("you@example.com").fill(TEST_USER.email)
     await page.getByPlaceholder("Enter your password").fill(TEST_USER.password)
     await page.getByRole("button", { name: "Continue" }).click()
     await page.waitForURL("/chat", { timeout: TEST_TIMEOUTS.max })

     // Your test code - makes real API calls
   })
   ```
4. **Run**: `bun run test:e2e:genuine`

## Troubleshooting

### Test Workspace Not Found

**Error**: `WORKSPACE_NOT_FOUND: /tmp/test-workspace`

**Fix**: Ensure `globalSetup` is configured:
```typescript
// playwright.genuine.config.ts
{
  globalSetup: "./e2e-tests/genuine-setup.ts"
}
```

### TEST_MODE_BLOCK Error

**Error**: `403 TEST_MODE_BLOCK`

**Cause**: Server has `PLAYWRIGHT_TEST=true` set

**Fix**: Verify `start-test-server-genuine.sh` does NOT export `PLAYWRIGHT_TEST`

### Insufficient Tokens

**Error**: `402 INSUFFICIENT_TOKENS`

**Cause**: Test workspace has no credits

**Impact**: Test may fail if it expects Claude to respond

**Fix**: Either:
- Provide user API key in Settings UI (for that test user)
- Update test to handle both success and insufficient credits

### Port Already in Use

**Error**: `Port 9548 already in use`

**Fix**:
```bash
# Find and kill process
lsof -ti:9548 | xargs kill -9

# Or let Playwright reuse existing server
# (already configured with reuseExistingServer: !process.env.CI)
```

## Change Resistance

This setup is designed to be resilient:

✅ **Uses constants**: All paths/credentials in `fixtures/test-data.ts`
✅ **Automatic setup/teardown**: Workspace created/cleaned automatically
✅ **No manual steps**: Everything handled by globalSetup
✅ **Works after restart**: No persistent state required
✅ **Works in CI**: Conditional server reuse (`!process.env.CI`)
✅ **Proper types**: TypeScript ensures correctness
✅ **Documentation**: This file explains architecture

## Developer Intent

From the testing guide:

> **E2E tests should be for UI flows, not API testing**

Genuine tests are an exception - they test the **complete E2E flow** including:
- UI interaction (login, typing, clicking)
- API request structure
- Real Claude API integration
- Response streaming
- UI updates

They serve as **integration smoke tests** for the full stack with real external dependencies.

## Best Practices

✅ **Use fixtures**: Import TEST_USER, TEST_WORKSPACE, TEST_TIMEOUTS
✅ **Use constants**: Never hardcode paths, credentials, timeouts
✅ **Document prerequisites**: List required env vars, setup steps
✅ **Handle errors gracefully**: Test both success and common error cases
✅ **Clean up**: Use globalTeardown for cleanup
✅ **Run sparingly**: These cost money - not every commit

❌ **Don't hardcode**: No magic strings or inline credentials
❌ **Don't skip setup**: Always use globalSetup for workspace
❌ **Don't leave state**: Clean up in globalTeardown
❌ **Don't run in CI by default**: Too expensive
❌ **Don't test implementation**: Test behavior, not internals

## Related Documentation

- [TESTING_GUIDE.md](../docs/testing/TESTING_GUIDE.md) - General testing guide
- [README-GENUINE-TESTS.md](./README-GENUINE-TESTS.md) - User-facing docs
- [test-data.ts](./fixtures/test-data.ts) - Test constants
- [workspaceRetriever.ts](../features/chat/lib/workspaceRetriever.ts) - Workspace resolution
