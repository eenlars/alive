# Testing Failure Modes - Murphy's Law

> **Everything that can go wrong, will go wrong.** Here's what to expect and how to fix it.

---

## Port Conflicts

### Port 9547 Already in Use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::9547
```

**Causes:**
- Previous test run didn't clean up
- Another dev server running
- Some random process grabbed the port

**Fixes:**
```bash
# Find what's using port 9547
lsof -i :9547
# or
netstat -an | grep 9547

# Kill the process
kill -9 <PID>

# Or change the port in playwright.config.ts
const TEST_PORT = '9548' // Use different port
```

### Multiple Test Runs at Once

**Symptoms:**
```
Error: Cannot lock conversation - already in use
```

**Causes:**
- Running `bun run test:e2e` in multiple terminals
- CI and local tests running simultaneously
- Playwright retry running parallel workers

**Fixes:**
```typescript
// In playwright.config.ts, ensure:
workers: 1,  // Force sequential
fullyParallel: false,
```

---

## Environment Variables

### Missing .env.local

**Symptoms:**
- Tests timeout waiting for page
- Login fails with "workspace not found"
- `test/test` credentials don't work

**Causes:**
- No `BRIDGE_ENV=local` set
- Missing `LOCAL_TEMPLATE_PATH`

**Fixes:**
```bash
# Create .env.local
cat > apps/web/.env.local <<EOF
BRIDGE_ENV=local
LOCAL_TEMPLATE_PATH=/path/to/template
EOF
```

### Template Path Doesn't Exist

**Symptoms:**
```
Error: ENOENT: no such file or directory
Workspace 'test' not found
```

**Fix:**
```bash
# Check template exists
ls -la /root/webalive/claude-bridge/packages/template/user

# Update playwright.config.ts with correct path
```

### Anthropic API Key Issues

**Symptoms:**
- Unit test throws: `🚨 Anthropic SDK query() called in test without mocking!`
- E2E test hangs or makes real API calls ($$$ cost)

**How It's Prevented:**

✅ **Unit Tests (Vitest)**: `tests/setup.ts` automatically mocks `@anthropic-ai/claude-agent-sdk` to throw errors

⚠️ **E2E Tests (Playwright)**: **NO automatic blocking** - You MUST call `mockClaudeStream()` in every test

**Why E2E can't auto-block:**
```
Browser → Next.js API (/api/claude/stream) → Server-side Anthropic API
         ↑ Playwright can intercept this
                                              ↑ Playwright CANNOT intercept this
```

**What Happens:**
```typescript
// Unit test - SDK throws error automatically
import { query } from '@anthropic-ai/claude-agent-sdk'
query({ prompt: 'test' }) // 🚨 Error: Would make REAL API call!

// ❌ E2E test WITHOUT mock - MAKES REAL API CALL ($$$)
test('send message', async ({ page }) => {
  await page.locator('[data-testid="send-button"]').click()
  // 💸 Just spent money calling real Anthropic API!
})

// ✅ E2E test WITH mock - Safe
test('send message', async ({ page }) => {
  await mockClaudeStream(page, { message: 'response' })
  await page.locator('[data-testid="send-button"]').click()
  // ✅ Safe, uses mock
})
```

**Required Fix:**
Always call `mockClaudeStream()` BEFORE sending messages in E2E tests.

---

## Timing Issues

### Server Not Ready

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:9547
Test timeout of 30000ms exceeded
```

**Causes:**
- Next.js takes longer than 120s to start
- First build after package changes
- Turbopack compilation slow

**Fixes:**
```typescript
// In playwright.config.ts
webServer: {
  timeout: 180000, // Increase to 3 minutes
}

// In tests, add longer waits
await page.waitForLoadState('networkidle')
```

### Race Conditions in Login

**Symptoms:**
- Sometimes passes, sometimes fails
- "Expected URL to be /chat but got /"
- Session not set before redirect

**Causes:**
- Login POST completes but cookie not set yet
- Verify endpoint races with redirect
- React state update timing

**Fixes:**
```typescript
// BAD
await page.click('button:has-text("ENTER")')
await expect(page).toHaveURL('/chat')

// GOOD - Wait for actual navigation
await Promise.all([
  page.waitForURL('/chat'),
  page.click('button:has-text("ENTER")')
])
```

### SSE Stream Timeouts

**Symptoms:**
```
Timeout waiting for message to appear
Element not found after 10000ms
```

**Causes:**
- Anthropic API slow/down
- Network issues
- Stream never completes

**Fixes:**
```typescript
// Increase timeout for streaming tests
test('can send message', async ({ page }) => {
  test.setTimeout(60000) // 60 seconds

  await expect(page.getByText('Hello')).toBeVisible({
    timeout: 30000 // 30 seconds for stream
  })
})
```

---

## Session & Cookie Issues

### Cookies Not Persisting

**Symptoms:**
- Login succeeds but chat page shows "not authenticated"
- Each test re-prompts for login
- Session cleared between navigations

**Causes:**
- Cookie domain mismatch
- SameSite cookie policy
- Context not shared between tests

**Fixes:**
```typescript
// Ensure all tests use same context
test.beforeEach(async ({ page }) => {
  // Don't create new context - use provided page
  await login(page)
})

// NOT THIS - creates new context
// const newPage = await context.newPage()
```

### Test Isolation Broken

**Symptoms:**
- First test passes, second fails
- Tests pass when run alone, fail in suite
- Conversation ID conflicts

**Causes:**
- Shared in-memory SessionStore
- Conversation locking persists
- activeConversations Set not cleared

**Fixes:**
```bash
# Run tests sequentially
workers: 1

# Or clear state between tests
test.beforeEach(async () => {
  // Clear any global state
  // Restart server between tests
})
```

---

## File System Issues

### Permission Denied on Hetzner

**Symptoms:**
```
EACCES: permission denied, mkdir 'test-results'
EACCES: permission denied, open 'playwright-report'
```

**Causes:**
- Running as root but files owned by different user
- /tmp directory full
- SELinux blocking writes

**Fixes:**
```bash
# Check permissions
ls -la apps/web/

# Fix ownership
chown -R root:root apps/web/test-results/

# Or run as correct user
sudo -u site-user bun run test:e2e
```

### Disk Full on CI

**Symptoms:**
```
ENOSPC: no space left on device
```

**Causes:**
- Screenshots accumulating
- Trace files not cleaned up
- Docker layers filling disk

**Fixes:**
```bash
# Clean old test results
rm -rf apps/web/test-results/ apps/web/playwright-report/

# In playwright.config.ts
use: {
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
  video: 'off', // Disable to save space
}
```

---

## Browser Issues

### Chromium Not Installed

**Symptoms:**
```
browserType.launch: Executable doesn't exist at /Users/here/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app
```

**Fix:**
```bash
bunx playwright install chromium
# Or with dependencies (Linux)
bunx playwright install --with-deps chromium
```

### Browser Crashes Mid-Test

**Symptoms:**
```
Protocol error: Target closed
Browser has been closed
```

**Causes:**
- Out of memory
- GPU issues in headless mode
- Long-running test with memory leak

**Fixes:**
```typescript
// In playwright.config.ts
use: {
  launchOptions: {
    args: [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-sandbox',
    ]
  }
}
```

### Headless vs Headed Differences

**Symptoms:**
- Tests pass in headed mode (--headed)
- Tests fail in headless (default)
- Or vice versa

**Causes:**
- Timing differences
- Font rendering affects layout
- Animation timing

**Fixes:**
```bash
# Run in headed to debug
bun run test:e2e:headed

# Or force headless consistency
# In playwright.config.ts
use: {
  headless: true, // Explicitly set
}
```

---

## Network Issues

### Accidentally Calling Real Anthropic API

**⚠️ PARTIALLY PROTECTED** - Unit tests are safe, E2E tests require manual mocking!

**How Protection Works:**

1. **Unit Tests (✅ AUTOMATIC)**: Global mock in `tests/setup.ts` throws errors
   ```typescript
   vi.mock('@anthropic-ai/claude-agent-sdk') // Throws error automatically
   ```

2. **E2E Tests (⚠️ MANUAL)**: You MUST call `mockClaudeStream()` in every test
   ```typescript
   // ❌ WRONG - Will make real API call ($$$)
   test('send message', async ({ page }) => {
     await page.locator('[data-testid="send-button"]').click()
     // 💸 Real Anthropic API call!
   })

   // ✅ CORRECT - Mock the API first
   test('send message', async ({ page }) => {
     await mockClaudeStream(page, { message: 'response' })
     await page.locator('[data-testid="send-button"]').click()
     // ✅ Safe
   })
   ```

**Why E2E Can't Auto-Block:**
The Anthropic API is called server-side (Node.js), not from the browser. Playwright can only intercept browser requests.

**Verification:**
Run `bun run test anthropic-safety` to verify unit test protection is active.

### DNS/Localhost Issues

**Symptoms:**
```
net::ERR_CONNECTION_REFUSED
Failed to fetch http://localhost:9547
```

**Causes:**
- Docker container can't reach host
- VPN blocking localhost
- IPv6 vs IPv4 confusion

**Fixes:**
```typescript
// Try 127.0.0.1 instead of localhost
baseURL: 'http://127.0.0.1:9547'

// Or IPv6
baseURL: 'http://[::1]:9547'
```

---

## Concurrency Issues

### Parallel Tests Sharing Conversation

**Symptoms:**
```
Error 409: Conversation in progress
Test randomly fails with concurrent access
```

**Causes:**
- workers > 1 with shared conversation IDs
- Same user ID across tests

**Fixes:**
```typescript
// Force sequential
workers: 1,
fullyParallel: false,

// Or unique conversation per test
const conversationId = crypto.randomUUID()
```

### File Locks on Windows

**Symptoms:**
```
EPERM: operation not permitted
The process cannot access the file because it is being used by another process
```

**Causes:**
- Windows locks files differently
- Antivirus scanning test files
- Previous process didn't exit cleanly

**Fixes:**
```bash
# Kill all Node/Bun processes
taskkill /F /IM node.exe
taskkill /F /IM bun.exe

# Disable antivirus on test directories
```

---

## CI/CD Specific

### Missing Secrets

**Symptoms:**
```
Error: ANTHROPIC_API_KEY is not set
Workspace test not found
```

**Causes:**
- GitHub secrets not configured
- Secret name mismatch

**Fixes:**
```yaml
# In .github/workflows/e2e.yml
env:
  BRIDGE_ENV: test
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  # Make sure secret exists in GitHub repo settings
```

### No Display Server (Headless CI)

**Symptoms:**
```
Error: Failed to launch browser
Cannot run in headed mode without display
```

**Fix:**
```bash
# Use xvfb on Linux CI
xvfb-run bun run test:e2e

# Or ensure headless mode
# In playwright.config.ts
use: {
  headless: true
}
```

### Timezone Issues

**Symptoms:**
- Date tests fail only in CI
- Timestamps don't match expectations

**Causes:**
- CI server in different timezone
- Local is PST, CI is UTC

**Fixes:**
```typescript
// In tests/setup.ts
process.env.TZ = 'UTC'

// Or in CI
env:
  TZ: UTC
```

---

## Code Changes Breaking Tests

### Selectors Changed

**Symptoms:**
```
Error: element(s) not found
Timeout waiting for locator
```

**Causes:**
- Changed "ENTER" button to "Submit"
- Changed placeholder text
- Removed/renamed elements

**Prevention:**
```typescript
// ❌ FRAGILE - breaks if text changes
await page.click('button:has-text("ENTER")')
await page.getByPlaceholder('Message')

// ✅ STABLE - using data-testid (Mastra's approach)
await page.locator('[data-testid="submit-button"]').click()
await page.locator('[data-testid="message-input"]')

// Add to code:
<button data-testid="submit-button">ENTER</button>
<textarea data-testid="message-input" placeholder="Message" />
```

**Available data-testid attributes:**
- `message-input` - Chat textarea
- `send-button` - Send message button
- `stop-button` - Stop streaming button
- `new-chat-button` - New conversation button
- `photos-button` - Photos button

### Routes Changed

**Symptoms:**
```
Expected URL /chat but got /dashboard
404 Not Found
```

**Causes:**
- Renamed /chat to /conversation
- Added middleware that redirects

**Fix:**
Update tests to match new routes.

### Auth Flow Changed

**Symptoms:**
- Login test fails
- New field required
- Different validation

**Causes:**
- Added email field
- Changed from passcode to OAuth
- New verification step

**Fix:**
Update helper functions in `tests/e2e/helpers.ts`

---

## Dependencies

### Playwright Version Mismatch

**Symptoms:**
```
Error: Chromium 1148 is not compatible with Playwright 1.50
Browser version mismatch
```

**Fix:**
```bash
bunx playwright install chromium
```

### Vitest Breaking Changes

**Symptoms:**
- Tests that worked suddenly fail
- New config format required

**Fix:**
Check vitest changelog, update config.

### Next.js 16 -> 17 Update

**Symptoms:**
- Server behavior changes
- Middleware runs differently
- Route handlers timeout

**Fix:**
Test after Next.js updates, update tests if needed.

---

## Hetzner Specific

### Production Interfering with Tests

**Symptoms:**
- Port 9547 works locally but not on Hetzner
- Tests fail only on server
- Mysterious 409 errors

**Causes:**
- Production (8999) somehow using test port
- Shared session store between prod and test
- File system conflicts

**Fixes:**
```bash
# Check what's on port 9547
lsof -i :9547

# Stop production temporarily
pm2 stop claude-bridge

# Run tests
bun run test:e2e

# Restart production
pm2 start claude-bridge
```

### Missing System Dependencies

**Symptoms:**
```
error while loading shared libraries: libgobject-2.0.so.0
Browser failed to launch
```

**Causes:**
- Chromium needs system libraries
- Headless mode missing fonts
- Missing GPU libraries

**Fix:**
```bash
# Install all Playwright dependencies
bunx playwright install-deps chromium

# Or manually
apt-get update
apt-get install -y \
  libnss3 libxss1 libasound2 libatk-bridge2.0-0 \
  libgtk-3-0 libgbm1
```

### Out of Memory

**Symptoms:**
```
Killed (signal 9)
JavaScript heap out of memory
```

**Causes:**
- Too many parallel tests
- Memory leak in tests
- Server has limited RAM

**Fixes:**
```typescript
// Reduce workers
workers: 1,

// Or increase Node memory
// In package.json
"test:e2e": "NODE_OPTIONS='--max-old-space-size=4096' playwright test"
```

---

## Prevention Strategies

### Use Data Attributes (Mastra's Approach)

**✅ IMPLEMENTED** - All critical UI elements now have `data-testid`:

```tsx
// In components (apps/web/app/chat/page.tsx)
<textarea data-testid="message-input" placeholder="Message" />
<button data-testid="send-button">→</button>
<button data-testid="stop-button"><Square /></button>
<button data-testid="new-chat-button">new chat</button>
<button data-testid="photos-button">photos</button>

// In tests (stable selectors)
await page.locator('[data-testid="message-input"]').fill('Hello')
await page.locator('[data-testid="send-button"]').click()
```

**Why this is better:**
- Won't break if button text changes from "→" to "Send"
- Won't break if placeholder text changes
- Semantic and intentional (clearly marked for testing)

### Add Retries for Flaky Tests

```typescript
test('flaky test', async ({ page }) => {
  test.setTimeout(60000)

  // Retry 3 times
  for (let i = 0; i < 3; i++) {
    try {
      await doSomething()
      break
    } catch (e) {
      if (i === 2) throw e
      await page.waitForTimeout(1000)
    }
  }
})
```

### Clean State Between Tests

```typescript
test.beforeEach(async ({ page }) => {
  // Clear cookies
  await page.context().clearCookies()

  // Clear localStorage
  await page.evaluate(() => localStorage.clear())
})
```

### Monitor Test Flakiness

```bash
# Run tests 10 times to find flaky tests
for i in {1..10}; do
  echo "Run $i"
  bun run test:e2e || echo "FAILED on run $i"
done
```

---

## Quick Debugging

### When a Test Fails

1. **Check screenshot**: `test-results/*/test-failed-1.png`
2. **View trace**: `npx playwright show-trace test-results/*/trace.zip`
3. **Run in headed mode**: `bun run test:e2e:headed`
4. **Run in debug mode**: `bun run test:e2e:debug`
5. **Check server logs**: Look for errors in Next.js output
6. **Verify environment**: `echo $BRIDGE_ENV`

### Common Quick Fixes

```bash
# Nuclear option - reset everything
rm -rf node_modules test-results playwright-report .next
bun install
bunx playwright install chromium
bun run test:e2e

# Just reset tests
rm -rf test-results playwright-report

# Kill stuck processes
pkill -f "next dev"
pkill -f playwright
```

---

## The Golden Rule

**If it can fail, it will fail - usually in production, on Friday at 5pm.**

Write defensive tests, add retries, mock external APIs, and always check the screenshots when things break.
