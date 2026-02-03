# Unit Testing Guide

> **Focus**: Test individual functions and modules in isolation using Vitest

## What are Unit Tests?

Unit tests verify that individual functions, classes, or modules work correctly in isolation. They:
- Test one thing at a time
- Run fast (milliseconds)
- Don't touch external systems (databases, APIs, filesystem)
- Use mocks/stubs for dependencies

## When to Write Unit Tests (MVP Priorities)

### ✅ MUST write unit tests for:

1. **Security-critical functions** (100% coverage required)
   - Path traversal protection (`isPathWithinWorkspace`)
   - Session validation (`getSessionUser`, `hasSessionCookie`)
   - Workspace boundary checks (`getWorkspace`)
   - Shell command sanitization

2. **API route logic** (70% coverage target)
   - Authentication flows
   - Request validation
   - Error handling

3. **Complex business logic** (60% coverage target)
   - Workspace resolution
   - Stream processing
   - Validation functions

### ⚠️ SHOULD write unit tests for:
- Helper utilities (if complex)
- Data transformations with edge cases

### ❌ DON'T write unit tests for:
- Simple formatters/transforms
- Type guards (unless security-critical)
- Third-party library wrappers
- Configuration files

---

## Configuration

### Vitest Config

```typescript
// apps/web/vitest.config.ts
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "happy-dom",      // Simulates browser DOM
    setupFiles: ["./tests/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/tests/e2e/**",           // E2E tests use Playwright
      "**/.next/**",
    ],
  },
})
```

**Key settings:**
- `environment: "happy-dom"` - Fast DOM simulation for React testing
- `setupFiles` - Global mocks (Anthropic SDK auto-mocked here)
- `globals: true` - No need to import `describe`, `it`, `expect`

### Setup File

```typescript
// apps/web/tests/setup.ts
import { vi } from 'vitest'

// Auto-mock Anthropic SDK to prevent accidental API calls
vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  return {
    query: vi.fn(() => {
      throw new Error("🚨 Anthropic SDK query() called in test without mocking!")
    })
  }
})
```

This **automatically prevents** real API calls during tests.

---

## File Structure

Place unit tests in `__tests__/` folders next to source files:

```
apps/web/lib/
├── auth.ts
├── security.ts
├── validation.ts
└── __tests__/
    ├── auth.test.ts
    ├── security.test.ts
    └── validation.test.ts

apps/web/features/workspace/
├── workspaceRetriever.ts
└── __tests__/
    └── workspaceRetriever.test.ts
```

**Naming convention**: `{filename}.test.ts`

---

## Basic Patterns

### 1. Testing Pure Functions

```typescript
// lib/__tests__/validation.test.ts
import { describe, expect, it } from 'vitest'
import { validateEmail } from '../validation'

describe('validateEmail', () => {
  it('should accept valid emails', () => {
    expect(validateEmail('user@example.com')).toBe(true)
    expect(validateEmail('test+tag@domain.co.uk')).toBe(true)
  })

  it('should reject invalid emails', () => {
    expect(validateEmail('not-an-email')).toBe(false)
    expect(validateEmail('@domain.com')).toBe(false)
    expect(validateEmail('user@')).toBe(false)
  })

  it('should reject empty strings', () => {
    expect(validateEmail('')).toBe(false)
  })
})
```

**Pattern**: Arrange → Act → Assert

### 2. Mocking Functions

```typescript
import { vi } from 'vitest'

// Create a mock function
const mockFn = vi.fn()

// Set return value
mockFn.mockReturnValue('mocked value')

// Set async return value
mockFn.mockResolvedValue('async value')

// Set error
mockFn.mockRejectedValue(new Error('fail'))

// Assertions
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
expect(mockFn).toHaveBeenCalledTimes(3)
```

### 3. Mocking Modules

```typescript
// lib/__tests__/auth.test.ts
import { vi, beforeEach } from 'vitest'

// Mock Next.js headers module
vi.mock('next/headers', () => ({
  cookies: vi.fn()
}))

import { cookies } from 'next/headers'
import { getSessionUser } from '../auth'

describe('getSessionUser', () => {
  beforeEach(() => {
    vi.clearAllMocks() // Reset mocks between tests
  })

  it('should return null when no session cookie', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn(() => undefined)
    } as any)

    const user = await getSessionUser()
    expect(user).toBeNull()
  })

  it('should return user when valid session exists', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn(() => ({ value: 'user-123' }))
    } as any)

    const user = await getSessionUser()
    expect(user).toEqual({ id: 'user-123' })
  })
})
```

### 4. Testing Async Functions

```typescript
describe('fetchWorkspaceData', () => {
  it('should fetch and return data', async () => {
    const data = await fetchWorkspaceData('workspace-id')
    expect(data).toBeDefined()
  })

  it('should throw on invalid workspace', async () => {
    await expect(fetchWorkspaceData('invalid'))
      .rejects.toThrow('Workspace not found')
  })

  // Also works with .resolves
  it('should return data', async () => {
    await expect(fetchWorkspaceData('valid'))
      .resolves.toEqual({ workspace: 'valid' })
  })
})
```

---

## Advanced Patterns

### Testing React Hooks

```typescript
// features/chat/hooks/__tests__/useChat.test.ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useChat } from '../useChat'

describe('useChat', () => {
  it('should initialize with empty messages', () => {
    const { result } = renderHook(() => useChat())
    expect(result.current.messages).toEqual([])
  })

  it('should add message', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.sendMessage('Hello')
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]).toContain('Hello')
  })

  it('should clear messages', () => {
    const { result } = renderHook(() => useChat())

    act(() => {
      result.current.sendMessage('Hello')
      result.current.clear()
    })

    expect(result.current.messages).toEqual([])
  })
})
```

**Key APIs:**
- `renderHook(() => useYourHook())` - Render hook in test environment
- `act(() => {...})` - Wrap state updates
- `result.current` - Access hook's return value

### Timer Mocking

Test code that uses `setTimeout`, `setInterval`:

```typescript
import { vi } from 'vitest'

describe('retryWithDelay', () => {
  beforeEach(() => {
    vi.useFakeTimers() // Enable fake timers
  })

  afterEach(() => {
    vi.useRealTimers() // Clean up
  })

  it('should retry after delay', () => {
    const callback = vi.fn()
    retryWithDelay(callback, 1000)

    // Not called yet
    expect(callback).not.toHaveBeenCalled()

    // Fast-forward time
    vi.advanceTimersByTime(1000)

    // Now called
    expect(callback).toHaveBeenCalledOnce()
  })

  it('should handle async timers', async () => {
    const callback = vi.fn().mockResolvedValue('success')
    const promise = retryWithDelay(callback, 100)

    await vi.advanceTimersByTimeAsync(100)

    expect(await promise).toBe('success')
  })
})
```

**Key APIs:**
- `vi.useFakeTimers()` - Enable fake timers
- `vi.advanceTimersByTime(ms)` - Move time forward synchronously
- `vi.advanceTimersByTimeAsync(ms)` - Move time forward with async support
- `vi.useRealTimers()` - Restore real timers

### Fixture Factories

Generate realistic test data with Faker:

```bash
bun add -D @faker-js/faker
```

```typescript
// lib/test-utils/factories/user-factory.ts
import { faker } from '@faker-js/faker'

export function createUser(overrides?: Partial<User>): User {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    createdAt: faker.date.past(),
    ...overrides
  }
}

export function createUsers(count: number): User[] {
  return Array.from({ length: count }, () => createUser())
}

// Usage in tests
import { createUser, createUsers } from '@/lib/test-utils/factories/user-factory'

it('should process user', () => {
  const user = createUser({ name: 'John Doe' }) // Override specific fields
  expect(processUser(user)).toBeDefined()
})

it('should handle multiple users', () => {
  const users = createUsers(10) // Generate 10 random users
  expect(processUsers(users)).toHaveLength(10)
})
```

**Benefits:**
- Realistic data (no hardcoded "test@test.com")
- Reduces test brittleness
- Each test run uses different data

### Spying on Functions

Monitor function calls without replacing implementation:

```typescript
import { vi } from 'vitest'

describe('processWorkspace', () => {
  let loggerSpy: any

  beforeEach(() => {
    loggerSpy = vi.spyOn(logger, 'info')
  })

  afterEach(() => {
    loggerSpy.mockRestore() // Restore original function
  })

  it('should log processing steps', async () => {
    await processWorkspace('workspace-123')

    expect(loggerSpy).toHaveBeenCalledWith('Processing workspace workspace-123')
    expect(loggerSpy).toHaveBeenCalledTimes(2)
  })
})
```

**Key APIs:**
- `vi.spyOn(object, 'method')` - Spy on method
- `spy.mockRestore()` - Restore original implementation

### Dependency Injection

Make code testable by injecting dependencies:

```typescript
// lib/workspace/workspace-service.ts
interface IWorkspaceResolver {
  resolve(host: string): Promise<string>
}

export class WorkspaceService {
  constructor(private resolver: IWorkspaceResolver) {}

  async getWorkspace(host: string): Promise<string> {
    return this.resolver.resolve(host)
  }
}

// lib/workspace/__tests__/workspace-service.test.ts
describe('WorkspaceService', () => {
  it('should resolve workspace', async () => {
    const mockResolver = {
      resolve: vi.fn().mockResolvedValue('/srv/test-workspace')
    }

    const service = new WorkspaceService(mockResolver)
    const workspace = await service.getWorkspace('test.com')

    expect(workspace).toBe('/srv/test-workspace')
    expect(mockResolver.resolve).toHaveBeenCalledWith('test.com')
  })
})
```

---

## Real-World Examples

### Example 1: Security Logic (Path Traversal)

```typescript
// lib/__tests__/security.test.ts
import { describe, expect, it } from 'vitest'
import path from 'node:path'

function isPathWithinWorkspace(filePath: string, workspace: string): boolean {
  const resolved = path.resolve(workspace, filePath)
  const normalized = path.normalize(resolved)
  return normalized.startsWith(path.normalize(workspace))
}

describe('Path Traversal Protection', () => {
  const workspace = '/srv/webalive/sites/demo.com/user'

  it('should allow valid relative paths', () => {
    expect(isPathWithinWorkspace('src/index.ts', workspace)).toBe(true)
    expect(isPathWithinWorkspace('./package.json', workspace)).toBe(true)
  })

  it('should reject paths with ../', () => {
    expect(isPathWithinWorkspace('../../../etc/passwd', workspace)).toBe(false)
    expect(isPathWithinWorkspace('src/../../root/.ssh', workspace)).toBe(false)
  })

  it('should reject absolute paths outside workspace', () => {
    expect(isPathWithinWorkspace('/etc/passwd', workspace)).toBe(false)
    expect(isPathWithinWorkspace('/root/.ssh/id_rsa', workspace)).toBe(false)
  })
})
```

### Example 2: Validation Logic with Zod

```typescript
// lib/__tests__/validation.test.ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const MessageSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid(),
  workspace: z.string().optional()
})

describe('Message Validation', () => {
  it('should accept valid messages', () => {
    const valid = {
      message: 'Hello Claude',
      conversationId: '550e8400-e29b-41d4-a716-446655440000'
    }
    expect(MessageSchema.safeParse(valid).success).toBe(true)
  })

  it('should reject empty messages', () => {
    const invalid = {
      message: '',
      conversationId: '550e8400-e29b-41d4-a716-446655440000'
    }
    expect(MessageSchema.safeParse(invalid).success).toBe(false)
  })

  it('should reject messages over 10k chars', () => {
    const invalid = {
      message: 'a'.repeat(10001),
      conversationId: '550e8400-e29b-41d4-a716-446655440000'
    }
    expect(MessageSchema.safeParse(invalid).success).toBe(false)
  })
})
```

### Example 3: Table-Driven Tests

Test multiple scenarios efficiently:

```typescript
describe('Workspace Name Validation', () => {
  const validNames = [
    'my-workspace',
    'workspace123',
    'test-site-v2',
  ]

  validNames.forEach(name => {
    it(`should accept valid name: "${name}"`, () => {
      expect(validateWorkspaceName(name)).toBe(true)
    })
  })

  const invalidNames = [
    ['', 'empty'],
    ['my workspace', 'space'],
    ['../etc/passwd', 'path traversal'],
    ['workspace!', 'special char'],
  ]

  invalidNames.forEach(([name, reason]) => {
    it(`should reject ${reason}: "${name}"`, () => {
      expect(validateWorkspaceName(name)).toBe(false)
    })
  })
})
```

---

## Running Unit Tests

```bash
# All unit tests
cd apps/web && bun run test

# Watch mode (re-run on file changes)
bun run test --watch

# Specific file
bun run test security.test.ts

# With coverage
bun run test --coverage

# Verbose output
bun run test --reporter=verbose
```

**Important:** Always use `bun run test`, never `bun test` directly. Do NOT use `npx vitest`.

---

## Debugging Unit Tests

### Add console.log

```typescript
it('test', () => {
  console.log('Debug:', value)
  expect(value).toBe(true)
})
```

### Run single test

```typescript
// Use .only to run just this test
it.only('should do something', () => {
  // ...
})

// Skip a test
it.skip('not ready yet', () => {
  // ...
})
```

### Debug mode in VS Code

```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "runtimeExecutable": "bun",
  "runtimeArgs": ["test", "--inspect-brk", "--run"],
  "cwd": "${workspaceFolder}/apps/web"
}
```

---

## Best Practices

### ✅ DO: Test behavior, not implementation

```typescript
// ✅ Good - tests behavior
it('should reject invalid passwords', async () => {
  const result = await login({ password: 'wrong' })
  expect(result.success).toBe(false)
})

// ❌ Bad - tests implementation
it('should call bcrypt.compare', async () => {
  await login({ password: 'test' })
  expect(bcrypt.compare).toHaveBeenCalled() // Fragile!
})
```

### ✅ DO: Use descriptive test names

```typescript
// ✅ Good
it('should return 401 when session cookie is missing')

// ❌ Bad
it('works')
```

### ✅ DO: Test error paths

```typescript
describe('divide', () => {
  it('should divide two numbers')
  it('should throw when dividing by zero') // Don't forget errors!
})
```

### ✅ DO: Keep tests isolated

```typescript
beforeEach(() => {
  vi.clearAllMocks() // Reset mocks between tests
})

it('test A', () => {
  // This test doesn't depend on test B
})

it('test B', () => {
  // This test doesn't depend on test A
})
```

### ❌ DON'T: Test third-party libraries

```typescript
// ❌ Bad - testing Next.js, not your code
it('should render a div', () => {
  render(<div>test</div>)
  expect(screen.getByText('test')).toBeInTheDocument()
})

// ✅ Good - testing your logic
it('should show error when API fails', () => {
  mockApiFail()
  render(<MyComponent />)
  expect(screen.getByText('Error occurred')).toBeVisible()
})
```

---

## Common Assertions

```typescript
// Equality
expect(value).toBe(5)                    // Strict equality (===)
expect(value).toEqual({ foo: 'bar' })    // Deep equality

// Truthiness
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeDefined()
expect(value).toBeNull()
expect(value).toBeUndefined()

// Numbers
expect(value).toBeGreaterThan(5)
expect(value).toBeLessThan(10)
expect(value).toBeCloseTo(0.3, 5)        // Floating point

// Strings
expect(text).toContain('substring')
expect(text).toMatch(/regex/)

// Arrays
expect(array).toHaveLength(3)
expect(array).toContain('item')
expect(array).toEqual(expect.arrayContaining(['a', 'b']))

// Objects
expect(obj).toHaveProperty('key')
expect(obj).toHaveProperty('key', 'value')
expect(obj).toMatchObject({ key: 'value' }) // Partial match

// Errors
expect(() => fn()).toThrow()
expect(() => fn()).toThrow('error message')
expect(() => fn()).toThrow(TypeError)

// Async
await expect(promise).resolves.toBe(value)
await expect(promise).rejects.toThrow()

// Functions
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
expect(mockFn).toHaveBeenCalledTimes(3)
expect(mockFn).toHaveReturnedWith('value')
```

---

## Common Issues

### Issue: "Anthropic SDK query() called in test"

**Cause**: Forgot to mock the SDK for a test that uses it

**Solution**: Override the global mock in your test

```typescript
import { vi } from 'vitest'
import { query } from '@anthropic-ai/claude-agent-sdk'

it('should handle SDK errors', async () => {
  vi.mocked(query).mockResolvedValue({
    result: { text: 'mocked response' }
  })

  // Your test code
})
```

### Issue: Mock not working

**Cause**: Mock not cleared between tests

**Solution**: Add `beforeEach` to clear mocks

```typescript
beforeEach(() => {
  vi.clearAllMocks()
})
```

### Issue: Test passes in isolation but fails in suite

**Cause**: Shared state between tests

**Solution**: Reset state in `beforeEach` or use factories

```typescript
beforeEach(() => {
  // Reset global state
  globalState = {}
})
```

---

## Resources

- [Vitest Docs](https://vitest.dev/) - Official documentation
- [Vitest API](https://vitest.dev/api/) - Complete API reference
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/) - React hooks testing
- [Faker.js](https://fakerjs.dev/) - Generate test data
