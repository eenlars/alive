# E2E Testing Guide

> **Focus**: Test complete user flows in a real browser using Playwright

## Architecture Overview

This section explains how E2E tests work across different environments.

### Environment Comparison

| Environment | Target | Workers | Database | Triggered By |
|-------------|--------|---------|----------|--------------|
| **Local** | `localhost:9547` | 4 | Test DB | `bun run test:e2e` |
| **Staging** | `staging.terminal.goalive.nl` | 6 | Production DB | `make staging` |
| **Production** | `terminal.goalive.nl` | 6 | Production DB | `make wash` |

### Local Development

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOCAL DEVELOPMENT                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Developer Machine                                             │
│   ┌─────────────────┐      ┌─────────────────┐                 │
│   │  Playwright     │ ───► │  Test Server    │ (localhost:9547)│
│   │  (4 workers)    │      │  (next dev)     │                 │
│   └─────────────────┘      └─────────────────┘                 │
│          │                        │                             │
│          │                        ▼                             │
│          │                 ┌─────────────────┐                 │
│          │                 │  .env.test      │ (test secrets)  │
│          │                 └─────────────────┘                 │
│          │                                                      │
│          ▼                                                      │
│   Creates test users: e2e_w0@alive.local, e2e_w1@alive.local │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key points:**
- Playwright auto-starts a test server on port 9547
- Uses `.env.test` for configuration
- Test users created in test database
- Mocking Claude API is optional (but recommended to avoid costs)

### Staging / Production Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                    STAGING / PRODUCTION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Same Server (YOUR_SERVER_IP)                                   │
│   ┌─────────────────┐      ┌─────────────────┐                 │
│   │  Playwright     │ ───► │  Deployed App   │                 │
│   │  (6 workers)    │      │  (systemd)      │                 │
│   │                 │      │                 │                 │
│   │  Runs during    │      │  staging:8998   │                 │
│   │  deployment     │      │  prod:9000      │                 │
│   └─────────────────┘      └─────────────────┘                 │
│          │                        │                             │
│          │ HTTPS via Caddy        │                             │
│          ▼                        ▼                             │
│   ┌─────────────────┐      ┌─────────────────┐                 │
│   │ staging.terminal│      │  .env.staging   │                 │
│   │ .goalive.nl     │      │  or             │                 │
│   │       or        │      │  .env.production│                 │
│   │ terminal.goalive│      └─────────────────┘                 │
│   │ .nl             │             │                             │
│   └─────────────────┘             │                             │
│                                   ▼                             │
│                          Same Supabase DB!                      │
│                          (real users created)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key points:**
- Tests run on the **same server** as the deployed app
- No separate test server - tests hit the real deployed application
- Uses production Supabase database
- Test users use `.alive.local` domain (not real TLD) for isolation

### Deployment Flow with E2E Tests

```
make wash (production deployment)
    │
    ├─► 1. Build new version
    ├─► 2. Deploy to production (port 9000)
    ├─► 3. Health check passes
    │
    ├─► 4. Run E2E tests against https://terminal.goalive.nl
    │       │
    │       ├─► global-setup.ts creates test users via API
    │       ├─► Tests run (login, navigate, verify UI)
    │       └─► global-teardown.ts cleans up
    │
    ├─► 5a. If tests FAIL → rollback to previous build
    └─► 5b. If tests PASS → deployment complete ✓
```

### Test User Isolation

Each Playwright worker gets its own isolated test user:

```typescript
// Worker 0: e2e_w0@alive.local → workspace e2e-w0.alive.local
// Worker 1: e2e_w1@alive.local → workspace e2e-w1.alive.local
// Worker 2: e2e_w2@alive.local → workspace e2e-w2.alive.local
// etc.
```

This allows 6 workers to run tests in parallel without conflicts.

### The E2E_TEST_SECRET

The `E2E_TEST_SECRET` prevents unauthorized access to test bootstrap endpoints:

```
┌──────────────┐    x-test-secret header    ┌──────────────────┐
│  global-     │ ────────────────────────►  │ /api/test/       │
│  setup.ts    │    E2E_TEST_SECRET         │ bootstrap-tenant │
│              │                            │                  │
└──────────────┘                            └──────────────────┘
                                                   │
                                                   ▼
                                             Creates test
                                             users in DB
```

**Configuration:**
- Local: Set in `.env.test`
- Staging: Set in `.env.staging`
- Production: Set in `.env.production`

Without this secret, the `/api/test/bootstrap-tenant` endpoint rejects requests.

### Why Test Against Production?

| Benefit | Explanation |
|---------|-------------|
| **Real environment** | Tests run against actual production config, Caddy, systemd |
| **Catches real issues** | Database migrations, env vars, service configs all tested |
| **No drift** | No separate test infrastructure that can diverge from prod |
| **Automatic rollback** | If tests fail, deployment rolls back automatically |

### Running E2E Tests

```bash
# Local development
bun run test:e2e

# Against staging (manual)
TEST_ENV=staging bun run test:e2e

# Against production (manual)
TEST_ENV=production bun run test:e2e

# During deployment (automatic)
make wash        # Production - runs E2E after deploy
make staging     # Staging - runs E2E after deploy
```

---

## What are E2E Tests?

End-to-end (E2E) tests simulate real user interactions in a browser. They:
- Test complete user workflows (login → chat → get response)
- Run in a real browser (Chromium)
- Interact with the full application stack
- Are slower than unit tests but catch integration issues

## When to Write E2E Tests

### ✅ Write E2E tests for:
- Critical user flows (authentication, chat interaction)
- Multi-step workflows
- Features that touch multiple parts of the system
- User-facing bugs you want to prevent from recurring

### ❌ Don't write E2E tests for:
- Individual function logic (use unit tests)
- Error cases that are hard to reproduce in browser (use unit tests)
- Every edge case (too slow, use unit tests for those)

---

## Configuration

### Playwright Config

```typescript
// apps/web/playwright.config.ts
import { defineConfig } from "@playwright/test"

const TEST_PORT = "9547"  // Different from production (9000)
const BASE_URL = `http://localhost:${TEST_PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,

  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",  // Auto-capture on failures
    trace: "retain-on-failure",     // Auto-trace on failures
  },

  webServer: {
    command: "bun run dev:test",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      PLAYWRIGHT_TEST: "true",
    },
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
})
```

**Key settings:**
- `testDir` - Where E2E tests live
- `timeout: 30000` - 30 seconds per test
- `webServer` - Auto-starts dev server on port 9547
- `screenshot: "only-on-failure"` - Debugging help
- `trace: "retain-on-failure"` - Full trace for debugging

### E2E Setup File

```typescript
// apps/web/tests/e2e/setup.ts
import { test as base } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    // Safety check: prevent real Claude API calls
    page.on('request', request => {
      if (request.url().includes('/api/claude/stream')) {
        // Check if route was mocked
        if (!request.isInterceptResolutionHandled()) {
          throw new Error('🚨 Claude API not mocked! This will cost money!')
        }
      }
    })

    await use(page)
  }
})

export { expect } from '@playwright/test'
```

**This protects you from accidentally making real API calls that cost money.**

---

## File Structure

```
apps/web/tests/e2e/
├── setup.ts              # Custom test fixture (API protection)
├── helpers.ts            # Reusable functions (login, etc.)
├── lib/
│   ├── stream-builder.ts # Build mock SSE streams
│   └── handlers.ts       # Pre-built mock handlers
├── auth.spec.ts          # Authentication tests
├── chat.spec.ts          # Chat interaction tests
└── workspace.spec.ts     # Workspace switching tests
```

**Naming convention**: `{feature}.spec.ts`

---

## Basic Patterns

### 1. Basic Test Structure

```typescript
// tests/e2e/chat.spec.ts
import { expect, test } from './setup'
import { login } from './helpers'
import { handlers } from './lib/handlers'

test('user can send message and get response', async ({ page }) => {
  // Step 1: Login
  await login(page)

  // Step 2: Mock Claude API (REQUIRED - prevents real API calls)
  await page.route('**/api/claude/stream', handlers.text('Hello! How can I help?'))

  // Step 3: Navigate to chat
  await page.goto('/chat')

  // Step 4: Verify UI is ready
  await expect(page.locator('[data-testid="message-input"]')).toBeVisible()
  await expect(page.locator('[data-testid="send-button"]')).toBeVisible()

  // Step 5: Send message
  await page.locator('[data-testid="message-input"]').fill('What is this project?')
  await page.locator('[data-testid="send-button"]').click()

  // Step 6: Verify response appears
  await expect(page.getByText('Hello! How can I help?')).toBeVisible({ timeout: 5000 })
})
```

### 2. Always Mock the Claude API

**CRITICAL**: E2E tests **MUST** mock `/api/claude/stream` to prevent real API calls.

```typescript
// ✅ CORRECT - Mock registered before page.goto()
await page.route('**/api/claude/stream', handlers.text('response'))
await page.goto('/chat')

// ❌ WRONG - Will make real API call and cost money
await page.goto('/chat')
await page.locator('[data-testid="send-button"]').click() // 💸 Real API call!
```

### 3. Using Mock Handlers

```typescript
import { handlers } from './lib/handlers'

// Simple text response
await page.route('**/api/claude/stream', handlers.text('Hello!'))

// Response with thinking
await page.route('**/api/claude/stream',
  handlers.withThinking('Let me think...', 'Here is the answer')
)

// File read operation
await page.route('**/api/claude/stream',
  handlers.fileRead('/test.txt', 'file contents', 'I read the file')
)

// Error response
await page.route('**/api/claude/stream',
  handlers.error('Something went wrong')
)

// Custom response using StreamBuilder
import { StreamBuilder } from './lib/stream-builder'

const stream = new StreamBuilder()
  .start()
  .thinking('Analyzing...')
  .tool('Read', { file_path: '/test.txt' }, 'contents')
  .text('Done!')
  .complete()

await page.route('**/api/claude/stream', handlers.custom(stream))
```

---

## Locators (Finding Elements)

### Semantic Queries (Preferred)

```typescript
// By role
page.getByRole('button', { name: 'Submit' })
page.getByRole('textbox', { name: 'Email' })

// By label
page.getByLabel('Email')
page.getByLabel('Password')

// By placeholder
page.getByPlaceholder('Enter email')

// By text
page.getByText('Welcome')
page.getByText(/error/i)  // Case insensitive regex

// By title
page.getByTitle('Close')
```

### Test IDs (When Semantic Not Available)

```typescript
page.locator('[data-testid="message-input"]')
page.locator('[data-testid="send-button"]')
```

Add to JSX:
```jsx
<input data-testid="message-input" />
<button data-testid="send-button">Send</button>
```

### CSS Selectors (Use Sparingly)

```typescript
page.locator('.my-class')
page.locator('#my-id')
page.locator('button.primary')
```

---

## Interactions

```typescript
// Click
await page.getByRole('button', { name: 'Submit' }).click()

// Fill input
await page.getByLabel('Email').fill('user@example.com')

// Clear and fill
await page.getByLabel('Email').clear()
await page.getByLabel('Email').fill('new@example.com')

// Check checkbox
await page.getByLabel('Accept terms').check()

// Select dropdown
await page.getByLabel('Country').selectOption('USA')

// Press key
await page.keyboard.press('Enter')
await page.keyboard.press('Escape')

// Upload file
await page.getByLabel('Upload').setInputFiles('/path/to/file.txt')

// Hover
await page.getByText('Menu').hover()

// Drag and drop
await page.locator('.drag-me').dragTo(page.locator('.drop-here'))
```

---

## Assertions

```typescript
// Visibility
await expect(page.getByText('Hello')).toBeVisible()
await expect(element).toBeHidden()

// Content
await expect(page).toHaveTitle('My Page')
await expect(page).toHaveURL('/chat')
await expect(element).toHaveText('exact text')
await expect(element).toContainText('partial')

// Attributes
await expect(element).toHaveAttribute('href', '/link')
await expect(element).toHaveClass('active')

// Count
await expect(page.getByRole('button')).toHaveCount(3)

// Input
await expect(input).toHaveValue('text')
await expect(input).toBeChecked()
await expect(input).toBeDisabled()
await expect(input).toBeEnabled()

// Wait conditions
await expect(element).toBeVisible({ timeout: 10000 }) // Wait up to 10s
```

---

## Real-World Examples

### Example 1: Authentication Flow

```typescript
// tests/e2e/auth.spec.ts
import { expect, test } from './setup'

test('user can login with valid passcode', async ({ page }) => {
  await page.goto('/workspace')

  // Fill workspace and passcode
  await page.getByLabel('Workspace').fill('test')
  await page.getByLabel('Passcode').fill('test')
  await page.getByRole('button', { name: 'Login' }).click()

  // Should redirect to chat
  await expect(page).toHaveURL('/chat')
  await expect(page.getByText('Welcome')).toBeVisible()
})

test('shows error with invalid passcode', async ({ page }) => {
  await page.goto('/workspace')

  await page.getByLabel('Workspace').fill('test')
  await page.getByLabel('Passcode').fill('wrong')
  await page.getByRole('button', { name: 'Login' }).click()

  // Should show error
  await expect(page.getByText(/Invalid passcode/i)).toBeVisible()

  // Should NOT redirect
  await expect(page).toHaveURL('/workspace')
})
```

### Example 2: Chat Interaction

```typescript
// tests/e2e/chat.spec.ts
import { expect, test } from './setup'
import { login } from './helpers'
import { handlers } from './lib/handlers'

test('displays tool usage correctly', async ({ page }) => {
  await login(page)

  // Mock response with file read operation
  await page.route('**/api/claude/stream',
    handlers.fileRead(
      '/src/index.ts',
      'export default function App() { return <div>Hello</div> }',
      'I found the main App component'
    )
  )

  await page.goto('/chat')
  await page.locator('[data-testid="message-input"]').fill('Show me the App component')
  await page.locator('[data-testid="send-button"]').click()

  // Verify tool input shows file path
  await expect(page.getByText('/src/index.ts')).toBeVisible()

  // Verify tool output shows file contents
  await expect(page.getByText(/export default function App/)).toBeVisible()

  // Verify Claude's response
  await expect(page.getByText('I found the main App component')).toBeVisible()
})
```

### Example 3: Error Handling

```typescript
// tests/e2e/error-handling.spec.ts
import { expect, test } from './setup'
import { login } from './helpers'
import { handlers } from './lib/handlers'

test('shows error when API fails', async ({ page }) => {
  await login(page)

  // Mock API error
  await page.route('**/api/claude/stream', handlers.error('Service unavailable'))

  await page.goto('/chat')
  await page.locator('[data-testid="message-input"]').fill('Test')
  await page.locator('[data-testid="send-button"]').click()

  // Verify error message appears
  await expect(page.getByText(/Service unavailable/i)).toBeVisible({ timeout: 5000 })
})
```

### Example 4: Custom Stream Builder

```typescript
// tests/e2e/multi-step.spec.ts
import { expect, test } from './setup'
import { login } from './helpers'
import { handlers, StreamBuilder } from './lib/handlers'

test('handles multi-step response', async ({ page }) => {
  await login(page)

  // Build custom response with multiple steps
  const customStream = new StreamBuilder()
    .start()
    .thinking('Let me analyze your project...')
    .tool('Glob', { pattern: '**/*.ts' }, 'Found 42 TypeScript files')
    .tool('Read', { file_path: 'package.json' }, '{ "name": "my-app" }')
    .text('Your project has 42 TypeScript files and is called "my-app"')
    .complete()

  await page.route('**/api/claude/stream', handlers.custom(customStream))

  await page.goto('/chat')
  await page.locator('[data-testid="message-input"]').fill('Analyze my project')
  await page.locator('[data-testid="send-button"]').click()

  // Verify thinking block appears
  await expect(page.getByText('Let me analyze your project...')).toBeVisible()

  // Verify tool usage appears
  await expect(page.getByText('Glob')).toBeVisible()
  await expect(page.getByText('Found 42 TypeScript files')).toBeVisible()

  // Verify final response
  await expect(page.getByText(/Your project has 42 TypeScript files/)).toBeVisible()
})
```

---

## Helper Functions

Create reusable functions in `helpers.ts`:

```typescript
// tests/e2e/helpers.ts
import type { Page } from '@playwright/test'

export async function login(page: Page, workspace = 'test', passcode = 'test') {
  await page.goto('/workspace')
  await page.getByLabel('Workspace').fill(workspace)
  await page.getByLabel('Passcode').fill(passcode)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL('/chat')
}

export async function sendMessage(page: Page, message: string) {
  await page.locator('[data-testid="message-input"]').fill(message)
  await page.locator('[data-testid="send-button"]').click()
}

export async function clearMessages(page: Page) {
  await page.getByRole('button', { name: 'Clear' }).click()
}
```

Usage:
```typescript
test('my test', async ({ page }) => {
  await login(page)
  await sendMessage(page, 'Hello')
  // ...
})
```

---

## Running E2E Tests

```bash
# First time setup - install browser
bunx playwright install chromium

# Run all E2E tests
bun run test:e2e

# Run in headed mode (see browser)
bun run test:e2e:headed

# Run in debug mode (pause execution)
bun run test:e2e:debug

# Run specific test file
bunx playwright test chat.spec.ts

# Run specific test by name
bunx playwright test -g "user can login"
```

**Package.json scripts:**
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

---

## Debugging E2E Tests

### 1. View Screenshots

```bash
ls apps/web/test-results/*/test-failed-*.png
open apps/web/test-results/*/test-failed-*.png
```

### 2. View Trace

```bash
npx playwright show-trace apps/web/test-results/*/trace.zip
```

Trace viewer shows:
- Timeline of all actions
- Network requests
- Console logs
- Screenshots at each step

### 3. Add page.pause()

```typescript
test('debug', async ({ page }) => {
  await page.goto('/chat')
  await page.pause() // Opens Playwright Inspector
  // ... rest of test
})
```

### 4. Console logs

```typescript
page.on('console', msg => console.log('PAGE LOG:', msg.text()))

test('my test', async ({ page }) => {
  // Will see all console.log from the page
})
```

### 5. Run with --debug flag

```bash
bunx playwright test --debug
```

Opens inspector, allows stepping through test.

---

## Best Practices

### ✅ DO: Wait for elements properly

```typescript
// ✅ Good - auto-waits for element
await expect(page.getByText('Hello')).toBeVisible()

// ✅ Good - explicit timeout
await expect(page.getByText('Hello')).toBeVisible({ timeout: 10000 })

// ❌ Bad - no waiting
const element = page.getByText('Hello')
// element might not exist yet!
```

### ✅ DO: Use semantic queries

```typescript
// ✅ Good - resilient to changes
page.getByRole('button', { name: 'Submit' })

// ❌ Bad - brittle
page.locator('button.btn-primary.submit')
```

### ✅ DO: Test user journeys, not implementation

```typescript
// ✅ Good - tests user flow
test('user can create and view workspace', async ({ page }) => {
  await login(page)
  await createWorkspace(page, 'my-workspace')
  await expect(page.getByText('my-workspace')).toBeVisible()
})

// ❌ Bad - tests implementation
test('createWorkspace API is called', async ({ page }) => {
  // Testing implementation details
})
```

### ✅ DO: Clean up test data

```typescript
test.afterEach(async ({ page }) => {
  // Clear cookies/storage
  await page.context().clearCookies()
})
```

### ❌ DON'T: Test every edge case in E2E

```typescript
// ❌ Bad - too slow, use unit tests
test('validates email format', async ({ page }) => {
  await page.getByLabel('Email').fill('invalid')
  await expect(page.getByText('Invalid email')).toBeVisible()
})

// ✅ Good - use unit test for validation
// E2E just tests one happy path
test('user can register', async ({ page }) => {
  await page.getByLabel('Email').fill('user@example.com')
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page).toHaveURL('/dashboard')
})
```

---

## Common Issues

### Issue: Port 9547 already in use

```bash
lsof -i :9547
kill -9 <PID>
```

### Issue: Test times out

```typescript
// Increase timeout for slow operations
test.setTimeout(60000) // 60 seconds

// Or per assertion
await expect(page.getByText('Hello')).toBeVisible({ timeout: 30000 })
```

### Issue: Element not found

```typescript
// Wait for element to exist first
await page.waitForSelector('[data-testid="element"]')
await page.locator('[data-testid="element"]').click()

// Or use auto-waiting assertion
await expect(page.getByText('Hello')).toBeVisible()
```

### Issue: Test makes real API call

**Cause**: Forgot to mock before navigation

**Solution**: Always mock BEFORE `page.goto()`

```typescript
// ✅ Correct order
await page.route('**/api/claude/stream', handler)
await page.goto('/chat')

// ❌ Wrong order
await page.goto('/chat')
await page.route('**/api/claude/stream', handler) // Too late!
```

---

## Resources

- [Playwright Docs](https://playwright.dev/) - Official documentation
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) - Recommended patterns
- [Locator Guide](https://playwright.dev/docs/locators) - Finding elements
- [Debugging Guide](https://playwright.dev/docs/debug) - Troubleshooting tests
