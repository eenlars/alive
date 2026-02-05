# E2E Test Improvements

## Current State Analysis
- 9 test files, ~1,300 lines total
- Sequential execution (workers: 1)
- Each test performs full login
- 30s timeout for all tests
- Duplicate workspace-ready checks

## Recommended Improvements

### 🚀 Speed Improvements (Estimated 40-60% faster)

#### 1. **Shared Authentication State** (Save ~3-5s per test)
**Current:** Each test calls `login(page)` which navigates, fills form, clicks button
**Better:** Use Playwright's storage state to share authentication

```typescript
// e2e-tests/global-setup.ts
export default async function globalSetup() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Login once
  await page.goto('/')
  // Set workspace using typed helper from @webalive/shared
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: WORKSPACE_STORAGE.KEY,
    value: createWorkspaceStorageValue('test.alive.local', orgId),
  })
  await page.getByPlaceholder('you@example.com').fill('test@alive.local')
  await page.getByPlaceholder('Enter your password').fill('test')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('/chat')

  // Save authenticated state
  await page.context().storageState({ path: 'e2e-tests/.auth/user.json' })
  await browser.close()
}

// playwright.config.ts
export default defineConfig({
  globalSetup: './e2e-tests/global-setup.ts',
  use: {
    storageState: 'e2e-tests/.auth/user.json',
  },
})

// Tests can now skip login entirely!
test('can send message', async ({ page }) => {
  await page.goto('/chat')  // Already authenticated!
  // ... rest of test
})
```

**Impact:** Removes ~3-5s per test, 20+ tests = **60-100s saved**

#### 2. **Parallel Test Execution** (Save 50%+ total time)
**Current:** `workers: 1` - tests run sequentially
**Better:** Run independent tests in parallel

```typescript
// playwright.config.ts
export default defineConfig({
  workers: process.env.CI ? 2 : 4, // Parallel on CI and local

  // Mark tests that can't run in parallel
  projects: [
    {
      name: 'serial',
      testMatch: '**/deploy.spec.ts', // Tests that modify shared state
      fullyParallel: false,
    },
    {
      name: 'parallel',
      testMatch: '**/*.spec.ts',
      testIgnore: '**/deploy.spec.ts',
      fullyParallel: true,
    },
  ],
})
```

**Impact:** 10 tests @ 5s each: 50s sequential → **12.5s parallel (4 workers)**

#### 3. **Reduce Timeouts** (Save 1-2s per assertion)
**Current:** Generic 30s timeout, 5s workspace-ready checks
**Better:** Granular timeouts based on operation

```typescript
// Fast operations (UI already loaded)
await expect(sendButton).toBeEnabled({ timeout: 1000 })  // Was 2000

// Medium operations (API calls)
await expect(page.getByText('Response')).toBeVisible({ timeout: 3000 })  // Was 5000

// Slow operations only (initial page load)
await expect(page.locator('[data-testid="workspace-ready"]')).toBeVisible({
  timeout: 5000,  // Keep this as-is
})
```

**Impact:** ~2s saved per test with multiple assertions

#### 4. **Optimize Workspace Initialization Helper**
**Current:** Each test waits for workspace-ready individually
**Better:** Create fixture that handles it automatically

```typescript
// e2e-tests/fixtures.ts
export const test = base.extend({
  authenticatedChatPage: async ({ page }, use) => {
    await page.goto('/chat')
    await expect(page.locator('[data-testid="workspace-ready"]')).toBeVisible({
      timeout: 5000,
    })
    await use(page)
  },
})

// Usage
test('can send message', async ({ authenticatedChatPage: page }) => {
  // Page is already on /chat with workspace ready!
  const messageInput = page.locator('[data-testid="message-input"]')
  // ... rest of test
})
```

**Impact:** Cleaner tests, no duplication, same speed

---

### 🎯 Reliability Improvements

#### 5. **Page Object Model for Chat**
Reduce flakiness and improve maintainability

```typescript
// e2e-tests/pages/ChatPage.ts
export class ChatPage {
  constructor(private page: Page) {}

  async waitForReady() {
    await expect(this.page.locator('[data-testid="workspace-ready"]')).toBeVisible({
      timeout: 5000,
    })
  }

  async sendMessage(text: string) {
    await this.messageInput.fill(text)
    await expect(this.sendButton).toBeEnabled({ timeout: 1000 })
    await this.sendButton.click()
  }

  async expectMessage(text: string | RegExp) {
    const locator = typeof text === 'string'
      ? this.page.getByText(text, { exact: true })
      : this.page.getByText(text)
    await expect(locator.first()).toBeVisible({ timeout: 3000 })
  }

  get messageInput() {
    return this.page.locator('[data-testid="message-input"]')
  }

  get sendButton() {
    return this.page.locator('[data-testid="send-button"]')
  }
}

// Usage
test('can send message', async ({ page }) => {
  const chat = new ChatPage(page)
  await chat.waitForReady()
  await chat.sendMessage('Hello')
  await chat.expectMessage('Hello')
  await chat.expectMessage(/Hi there/)
})
```

**Benefits:**
- Centralized selectors (change once, fix everywhere)
- Better error messages (from ChatPage methods)
- Reusable patterns
- Type-safe

#### 6. **Better Waiting Strategies**
Replace `.first()` hacks with precise selectors

```typescript
// Current (fragile - depends on DOM order)
await expect(page.getByText('Hello').first()).toBeVisible()

// Better (precise - targets specific element)
await expect(page.locator('[data-testid="chat-messages"]').getByText('Hello')).toBeVisible()

// Add to chat page:
<div data-testid="chat-messages" className="flex-1 min-h-0 overflow-y-auto">
  {/* messages */}
</div>
```

#### 7. **Automatic Retry for Flaky Assertions**
```typescript
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,  // Retry on CI only

  // Or custom retry logic for specific assertions
  use: {
    actionTimeout: 10000,  // Individual action timeout
    navigationTimeout: 15000,  // Navigation timeout
  },
})
```

---

### 🧹 Maintainability Improvements

#### 8. **Shared Test Data**
```typescript
// e2e-tests/fixtures/test-data.ts
export const TEST_USER = {
  email: 'test@alive.local',
  password: 'test',
  workspace: 'test.alive.local',
}

export const TEST_MESSAGES = {
  simple: 'Hello',
  complex: 'Build a todo app with React',
}

// Usage
await page.getByPlaceholder('you@example.com').fill(TEST_USER.email)
```

#### 9. **Custom Assertions**
```typescript
// e2e-tests/assertions.ts
export async function expectWorkspaceReady(page: Page) {
  await expect(page.locator('[data-testid="workspace-ready"]')).toBeVisible({
    timeout: 5000,
  })
}

export async function expectChatMessage(page: Page, text: string | RegExp) {
  const locator = typeof text === 'string'
    ? page.getByText(text, { exact: true })
    : page.getByText(text)
  await expect(locator.first()).toBeVisible({ timeout: 3000 })
}
```

#### 10. **Test Organization**
```typescript
// Group related tests
test.describe('Chat - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await expectWorkspaceReady(page)
  })

  test('has chat interface', async ({ page }) => { /* ... */ })
  test('can send message', async ({ page }) => { /* ... */ })
  test('can receive response', async ({ page }) => { /* ... */ })
})

test.describe('Chat - Protection', () => {
  // Protection tests
})
```

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 hours, 30% faster)
1. ✅ Add workspace-ready helper fixture
2. ✅ Reduce timeouts for fast operations
3. ✅ Add test data constants
4. ✅ Fix `.first()` with proper selectors

### Phase 2: Medium Impact (3-4 hours, 50% faster)
5. ⏳ Implement shared authentication state
6. ⏳ Create ChatPage object model
7. ⏳ Enable parallel execution for independent tests

### Phase 3: Long-term (1-2 days, best practices)
8. ⏳ Full page object model for all pages
9. ⏳ Custom assertions library
10. ⏳ CI-specific optimizations

---

## Expected Results

### Current Performance
- **Total runtime:** ~90-120s for all tests
- **Average test:** 8-12s
- **Login overhead:** 3-5s per test
- **Workers:** 1 (sequential)

### After Improvements
- **Total runtime:** ~20-30s for all tests (75% faster)
- **Average test:** 2-4s
- **Login overhead:** 0s (shared state)
- **Workers:** 4 (parallel)

### ROI
- **Developer time saved:** 60-90s per test run
- **CI time saved:** ~2 minutes per PR
- **Reliability:** Fewer flaky tests, better error messages
- **Maintenance:** Easier to update when UI changes
