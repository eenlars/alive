# Integration Testing Guide

> **Focus**: Test multiple components working together (without full browser E2E)

## What are Integration Tests?

Integration tests verify that multiple components work together correctly. They:
- Test interactions between modules
- May use real filesystem, network, or database
- Are slower than unit tests but faster than E2E tests
- Don't require a browser (unlike E2E tests)

**Integration tests sit between unit tests and E2E tests.**

---

## When to Write Integration Tests

### ✅ Write integration tests for:
- API routes (request → validation → response)
- Workspace resolution (hostname → filesystem path)
- File operations (Read, Write, Edit with validation)
- SSE stream generation (SDK → stream builder → output)
- Authentication flows (cookie → session → validation)

### ❌ Don't write integration tests for:
- Simple functions (use unit tests)
- Full user flows (use E2E tests)
- UI components (use E2E tests or unit tests)

---

## Configuration

Integration tests use the same Vitest setup as unit tests:

```typescript
// apps/web/vitest.config.ts
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/tests/e2e/**",
    ],
  },
})
```

**Same as unit tests**, but you'll use more real dependencies instead of mocks.

---

## File Structure

Place integration tests in `__tests__/` folders or a dedicated `tests/integration/` directory:

```
apps/web/
├── app/api/login/
│   └── __tests__/
│       └── route.integration.test.ts
├── features/workspace/
│   └── __tests__/
│       └── workspaceRetriever.integration.test.ts
└── tests/integration/
    ├── api-routes.test.ts
    ├── file-operations.test.ts
    └── stream-generation.test.ts
```

**Naming convention**: `{filename}.integration.test.ts` or `{filename}.test.ts`

---

## Basic Patterns

### 1. Testing API Routes

```typescript
// app/api/login/__tests__/route.integration.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { POST } from '../route'

// Mock Next.js headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn()
  }))
}))

describe('POST /api/login (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should reject requests without passcode', async () => {
    const req = new Request('http://localhost/api/login', {
      method: 'POST',
      body: JSON.stringify({ workspace: 'test' })
    })

    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBeDefined()
  })

  it('should set session cookie on valid login', async () => {
    const req = new Request('http://localhost/api/login', {
      method: 'POST',
      body: JSON.stringify({
        workspace: 'test',
        passcode: 'test'
      })
    })

    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
  })

  it('should validate workspace parameter', async () => {
    const req = new Request('http://localhost/api/login', {
      method: 'POST',
      body: JSON.stringify({
        workspace: '../../../etc/passwd',  // Path traversal attempt
        passcode: 'test'
      })
    })

    const response = await POST(req)

    expect(response.status).toBe(400)
  })
})
```

### 2. Testing Workspace Resolution

```typescript
// features/workspace/__tests__/workspaceRetriever.integration.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { getWorkspace } from '../workspaceRetriever'

describe('Workspace Resolution (integration)', () => {
  const testWorkspace = '/tmp/test-workspace-' + Date.now()

  beforeEach(() => {
    // Create test workspace
    mkdirSync(testWorkspace, { recursive: true })
  })

  afterEach(() => {
    // Clean up
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true })
    }
  })

  it('should resolve workspace for valid terminal mode request', () => {
    const result = getWorkspace({
      host: 'terminal.example.com',
      body: { workspace: testWorkspace },
      requestId: 'test-123'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.workspace).toBe(testWorkspace)
    }
  })

  it('should reject workspace that does not exist', () => {
    const result = getWorkspace({
      host: 'terminal.example.com',
      body: { workspace: '/nonexistent/workspace' },
      requestId: 'test-123'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(404)
    }
  })

  it('should reject path traversal attempts', () => {
    const result = getWorkspace({
      host: 'terminal.example.com',
      body: { workspace: '../../../etc/passwd' },
      requestId: 'test-123'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(400)
    }
  })
})
```

### 3. Testing File Operations

```typescript
// tests/integration/file-operations.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { handleFileRead, handleFileWrite } from '@/lib/file-handlers'

describe('File Operations (integration)', () => {
  const testDir = '/tmp/test-files-' + Date.now()

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  it('should read file contents', async () => {
    const filePath = path.join(testDir, 'test.txt')
    writeFileSync(filePath, 'Hello World')

    const result = await handleFileRead(filePath, testDir)

    expect(result.success).toBe(true)
    expect(result.content).toBe('Hello World')
  })

  it('should reject reading file outside workspace', async () => {
    const filePath = '/etc/passwd'

    const result = await handleFileRead(filePath, testDir)

    expect(result.success).toBe(false)
    expect(result.error).toContain('outside workspace')
  })

  it('should write file contents', async () => {
    const filePath = path.join(testDir, 'new.txt')

    const result = await handleFileWrite(filePath, 'New content', testDir)

    expect(result.success).toBe(true)
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toBe('New content')
  })

  it('should reject writing outside workspace', async () => {
    const filePath = '/tmp/outside-workspace.txt'

    const result = await handleFileWrite(filePath, 'content', testDir)

    expect(result.success).toBe(false)
    expect(existsSync(filePath)).toBe(false)
  })
})
```

### 4. Testing SSE Stream Generation

```typescript
// tests/integration/stream-generation.test.ts
import { describe, expect, it } from 'vitest'
import { StreamBuilder } from '@/tests/e2e/lib/stream-builder'

describe('SSE Stream Generation (integration)', () => {
  it('should generate valid SSE stream with text', () => {
    const stream = new StreamBuilder()
      .start()
      .text('Hello World')
      .complete()

    const output = stream.toString()

    expect(output).toContain('event: start')
    expect(output).toContain('event: message')
    expect(output).toContain('Hello World')
    expect(output).toContain('event: complete')
  })

  it('should generate stream with tool usage', () => {
    const stream = new StreamBuilder()
      .start()
      .tool('Read', { file_path: '/test.ts' }, 'file contents')
      .text('I read the file')
      .complete()

    const output = stream.toString()

    expect(output).toContain('tool_use')
    expect(output).toContain('Read')
    expect(output).toContain('/test.ts')
    expect(output).toContain('tool_result')
    expect(output).toContain('file contents')
  })

  it('should handle thinking blocks', () => {
    const stream = new StreamBuilder()
      .start()
      .thinking('Let me analyze...')
      .text('Analysis complete')
      .complete()

    const output = stream.toString()

    expect(output).toContain('type":"thinking"')
    expect(output).toContain('Let me analyze...')
  })

  it('should generate error stream', () => {
    const stream = new StreamBuilder()
      .start()
      .error('Something went wrong')

    const output = stream.toString()

    expect(output).toContain('event: error')
    expect(output).toContain('Something went wrong')
  })
})
```

---

## Real-World Examples

### Example 1: API Route with Validation

```typescript
// app/api/claude/stream/__tests__/route.integration.test.ts
import { describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: 'test-session' }))
  }))
}))

describe('POST /api/claude/stream (integration)', () => {
  it('should reject unauthenticated requests', async () => {
    vi.mocked(cookies).mockReturnValueOnce({
      get: vi.fn(() => undefined)
    } as any)

    const req = new Request('http://localhost/api/claude/stream', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' })
    })

    const response = await POST(req)

    expect(response.status).toBe(401)
  })

  it('should validate message length', async () => {
    const req = new Request('http://localhost/api/claude/stream', {
      method: 'POST',
      body: JSON.stringify({
        message: 'a'.repeat(100000), // Too long
        conversationId: '550e8400-e29b-41d4-a716-446655440000'
      })
    })

    const response = await POST(req)

    expect(response.status).toBe(400)
  })

  it('should validate conversationId format', async () => {
    const req = new Request('http://localhost/api/claude/stream', {
      method: 'POST',
      body: JSON.stringify({
        message: 'test',
        conversationId: 'not-a-uuid'
      })
    })

    const response = await POST(req)

    expect(response.status).toBe(400)
  })
})
```

### Example 2: Session Management

```typescript
// lib/__tests__/session.integration.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import { SessionStore } from '../session-store'

describe('Session Store (integration)', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore()
  })

  it('should store and retrieve session', async () => {
    await store.set('user:123', 'session-abc')

    const session = await store.get('user:123')

    expect(session).toBe('session-abc')
  })

  it('should return null for non-existent session', async () => {
    const session = await store.get('non-existent')

    expect(session).toBeNull()
  })

  it('should delete session', async () => {
    await store.set('user:123', 'session-abc')
    await store.delete('user:123')

    const session = await store.get('user:123')

    expect(session).toBeNull()
  })

  it('should handle concurrent operations', async () => {
    const promises = [
      store.set('user:1', 'session-1'),
      store.set('user:2', 'session-2'),
      store.set('user:3', 'session-3'),
    ]

    await Promise.all(promises)

    const sessions = await Promise.all([
      store.get('user:1'),
      store.get('user:2'),
      store.get('user:3'),
    ])

    expect(sessions).toEqual(['session-1', 'session-2', 'session-3'])
  })
})
```

### Example 3: Authentication Flow

```typescript
// features/auth/__tests__/auth-flow.integration.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { login, validateSession, logout } from '../auth'

vi.mock('next/headers')

describe('Authentication Flow (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should complete full auth flow', async () => {
    // 1. Login
    const loginResult = await login('test', 'test')
    expect(loginResult.success).toBe(true)
    expect(loginResult.sessionId).toBeDefined()

    // 2. Validate session
    const session = await validateSession(loginResult.sessionId!)
    expect(session).toBeDefined()
    expect(session?.workspace).toBe('test')

    // 3. Logout
    await logout(loginResult.sessionId!)

    // 4. Session should be invalid
    const invalidSession = await validateSession(loginResult.sessionId!)
    expect(invalidSession).toBeNull()
  })

  it('should reject invalid credentials', async () => {
    const result = await login('test', 'wrong-password')

    expect(result.success).toBe(false)
    expect(result.sessionId).toBeUndefined()
  })

  it('should prevent session reuse after logout', async () => {
    const { sessionId } = await login('test', 'test')
    await logout(sessionId!)

    const session = await validateSession(sessionId!)
    expect(session).toBeNull()
  })
})
```

---

## Testing with Real Dependencies

### Using Real Filesystem

```typescript
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

describe('My Integration Test', () => {
  const testDir = '/tmp/test-' + Date.now()

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  it('should work with real files', () => {
    writeFileSync(`${testDir}/test.txt`, 'content')
    // Test your code with real files
  })
})
```

### Using Real Network (with caution)

```typescript
import { fetch } from 'undici'

describe('API Client (integration)', () => {
  it.skip('should fetch real data', async () => {
    // Use .skip for tests that hit real APIs
    const response = await fetch('https://api.example.com/data')
    expect(response.ok).toBe(true)
  })
})
```

**Note**: Skip tests that hit external APIs in CI. Use environment variables to control:

```typescript
const shouldRunRealNetworkTests = process.env.RUN_NETWORK_TESTS === 'true'

const testFn = shouldRunRealNetworkTests ? it : it.skip

testFn('should fetch real data', async () => {
  // ...
})
```

---

## Running Integration Tests

```bash
# Run all tests (includes integration)
cd apps/web && bun run test

# Run specific integration test
bun run test workspace.integration.test.ts

# Run with pattern
bun run test integration

# With coverage
bun run test --coverage
```

**Important:** Always use `bun run test`, never `bun test` directly. Do NOT use `npx vitest`.

**Separate integration tests** (optional pattern):

```bash
# Add script to package.json
"scripts": {
  "test:unit": "vitest run --exclude='**/*.integration.test.ts'",
  "test:integration": "vitest run '**/*.integration.test.ts'"
}

# Run unit tests only
bun run test:unit

# Run integration tests only
bun run test:integration
```

---

## Best Practices

### ✅ DO: Clean up after tests

```typescript
afterEach(async () => {
  // Clean up filesystem
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true })
  }

  // Clean up database (if using one)
  await db.clearTestData()

  // Reset mocks
  vi.clearAllMocks()
})
```

### ✅ DO: Use unique test data

```typescript
// ✅ Good - unique per test run
const testDir = '/tmp/test-' + Date.now()
const testWorkspace = `test-${Date.now()}`

// ❌ Bad - conflicts between tests
const testDir = '/tmp/test'
```

### ✅ DO: Test error paths

```typescript
describe('File Operations', () => {
  it('should read file successfully') // Happy path
  it('should handle missing files')    // Error path
  it('should reject invalid paths')    // Security path
})
```

### ✅ DO: Keep integration tests focused

```typescript
// ✅ Good - tests specific integration
it('should validate and resolve workspace', () => {
  const result = getWorkspace({ host: 'test.com', body: { workspace: 'test' } })
  expect(result.success).toBe(true)
})

// ❌ Bad - testing too much at once
it('should handle entire request lifecycle', async () => {
  // Tests auth + validation + resolution + processing + response
  // This is E2E, not integration
})
```

### ❌ DON'T: Mock everything

```typescript
// ❌ Bad - this is a unit test, not integration
it('should resolve workspace', () => {
  vi.mock('node:fs') // Mocking filesystem
  vi.mock('node:path') // Mocking path
  // Not testing real integration!
})

// ✅ Good - use real dependencies
it('should resolve workspace', () => {
  // Uses real filesystem, real path resolution
  const result = getWorkspace(...)
})
```

---

## Common Patterns

### Testing with Temporary Files

```typescript
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'

describe('File Handler', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'test-'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should process files', () => {
    // Use testDir for file operations
  })
})
```

### Testing Async Workflows

```typescript
describe('Async Workflow', () => {
  it('should complete multi-step process', async () => {
    // Step 1
    const result1 = await step1()
    expect(result1.success).toBe(true)

    // Step 2 depends on step 1
    const result2 = await step2(result1.data)
    expect(result2.success).toBe(true)

    // Step 3 depends on step 2
    const result3 = await step3(result2.data)
    expect(result3.success).toBe(true)
  })
})
```

### Testing with Environment Variables

```typescript
describe('Config', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it('should behave differently in production', () => {
    process.env.NODE_ENV = 'production'
    expect(getConfig().debug).toBe(false)
  })

  it('should enable debug in development', () => {
    process.env.NODE_ENV = 'development'
    expect(getConfig().debug).toBe(true)
  })
})
```

---

## Debugging Integration Tests

```bash
# Run with verbose output
bun run test --reporter=verbose

# Run single test
bun run test workspace.integration.test.ts

# Add console.log
it('test', async () => {
  console.log('Debug:', result)
  expect(result).toBeDefined()
})
```

---

## Resources

- [Vitest Docs](https://vitest.dev/) - Test runner
- [Node.js fs](https://nodejs.org/api/fs.html) - Filesystem operations
- [Node.js path](https://nodejs.org/api/path.html) - Path operations
