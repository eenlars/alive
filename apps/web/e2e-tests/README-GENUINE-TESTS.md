# Genuine API Integration Tests

This directory contains E2E tests that make **REAL API calls** to test the full request/response pipeline without mocks.

## ⚠️ Important Warnings

- **These tests consume actual API credits/tokens**
- They make real requests to the Anthropic Claude API
- They should be run sparingly (not in CI by default)
- Ensure you have a valid `ANTHROPIC_API_KEY` in `.env`

## Test Types

### Regular E2E Tests (`*.spec.ts`)
- Use mocks for Claude API calls
- Protected by `setup.ts` to block unmocked API calls
- Safe to run frequently
- Run with: `bun run test:e2e`

### Genuine API Tests (`*-genuine.spec.ts`)
- Make REAL API calls (no mocks)
- Use separate config (`playwright.genuine.config.ts`)
- Use separate test server (port 9548, without `PLAYWRIGHT_TEST=true`)
- Only matched by genuine test config
- Run with: `bun run test:e2e:genuine`

## Running Genuine Tests

```bash
# Run all genuine tests
cd apps/web
bun run test:e2e:genuine

# Run with UI
bun run test:e2e:genuine:ui

# Run in headed mode (see browser)
bun run test:e2e:genuine:headed
```

## Prerequisites

1. **Environment Variables**: Ensure `.env` contains:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   SUPABASE_URL=https://...
   SUPABASE_SERVICE_ROLE_KEY=...
   JWT_SECRET=...
   ```

2. **Test Account**: The tests use `ALIVE_ENV=local` which enables test credentials:
   - Email: `test@alive.local`
   - Password: `test`

## What These Tests Verify

### `chat-genuine.spec.ts`

1. **Full Request/Response Pipeline**
   - Sends actual message to Claude API
   - Validates request body structure
   - Validates response headers and streaming
   - Verifies assistant response appears in UI

2. **Validation Errors**
   - Tests that empty messages are prevented
   - Verifies UI-level validation

3. **Workspace Context**
   - Tests workspace field in request
   - Verifies terminal vs standard mode behavior

4. **Authentication**
   - Validates JWT structure
   - Ensures session cookie is properly set
   - Verifies workspace access

## Architecture

```
Regular E2E Tests:
  playwright.config.ts
  → start-test-server.sh (PLAYWRIGHT_TEST=true)
  → Route handler BLOCKS real API calls
  → Tests MUST mock /api/claude/stream

Genuine API Tests:
  playwright.genuine.config.ts
  → start-test-server-genuine.sh (no PLAYWRIGHT_TEST)
  → Route handler ALLOWS real API calls
  → Tests make ACTUAL API requests
```

## Debugging Failed Tests

### Request Validation Errors

If you see `INVALID_REQUEST` errors, check:
1. Request body structure matches `BodySchema` in `types/guards/api.ts`
2. `conversationId` is a valid UUID
3. `model` is a valid Claude model name
4. JWT token is valid and not expired

### Authentication Errors

If you see `NO_SESSION` or auth errors:
1. Check that login helper is working
2. Verify session cookie is set
3. Check JWT_SECRET in .env matches what's expected

### Streaming Errors

If responses don't stream properly:
1. Check Content-Type is `application/x-ndjson`
2. Verify X-Request-Id header is present
3. Check server logs for stream errors

### API Errors

If Claude API returns errors:
1. Verify ANTHROPIC_API_KEY is valid
2. Check API quota/limits
3. Review API error message in response

## Adding New Genuine Tests

1. Create file: `e2e-tests/your-feature-genuine.spec.ts`
2. Import: `import { test, expect } from "@playwright/test"`
3. Use `login` helper for auth
4. Make requests as normal (no mocks needed)
5. Run: `bun run test:e2e:genuine`

Example:
```typescript
import { test, expect } from "@playwright/test"
import { login } from "./helpers"

test.describe("Your Feature - Genuine", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto("/chat")
  })

  test("your test case", async ({ page }) => {
    // Your test code - makes real API calls
  })
})
```

## CI/CD Integration

These tests should NOT run in CI by default (they cost money!).

To run in CI for specific branches/releases:
```yaml
# .github/workflows/test-genuine.yml
- name: Run genuine API tests
  if: github.ref == 'refs/heads/release'
  run: |
    cd apps/web
    bun run test:e2e:genuine
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Cost Considerations

Each test run costs approximately:
- Simple message: ~$0.01 (with Haiku model)
- Complex message with tools: ~$0.05-0.10

Budget accordingly and use these tests sparingly.
