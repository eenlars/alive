# Test Patterns: Do This, Not That

**These patterns are enforced by code review. AI-generated tests that violate these will be rejected.**

## 1. PREFER INTEGRATION TESTS OVER MOCKING

```typescript
// ❌ BAD - mocks internal business logic
vi.mock('@/lib/credits', () => ({
  deductCredits: vi.fn().mockResolvedValue({ success: true })
}))

// ✅ GOOD - test against real behavior with test data
const user = await createTestUser(undefined, 100) // 100 credits
await callApi('/api/deploy', user.session)
const updated = await getCredits(user.orgId)
expect(updated).toBeLessThan(100)
```

**Exceptions (mocking is OK):**
- External services (Supabase, Redis, APIs) - mock to avoid network calls
- `next/headers`, `next/server` - framework mocks are necessary
- Rate limiters - mock to test rate limit behavior

## 2. NO `any` TYPES FOR BUSINESS DATA

```typescript
// ❌ BAD - loses type safety for real data
let user: any
let response: any

// ✅ GOOD - use proper types
let user: TestUser
let response: DeploySubdomainResponse
```

**Exceptions (any is OK):**
- Testing functions that handle arbitrary input (like `truncateDeep`)
- Mock return types where Supabase typing is complex
- Circular reference tests

## 3. TEST AGAINST REAL DB STATE (for integration tests)

```typescript
// ❌ BAD - fake IDs that violate FK constraints
const fakeOrgId = 'org_fake_12345'
await deployToOrg(fakeOrgId)

// ✅ GOOD - create real test data
const user = await createTestUser()
await deployToOrg(user.orgId)
```

## 4. DESCRIPTIVE TEST NAMES THAT DOCUMENT BEHAVIOR

```typescript
// ❌ BAD - vague
it('works')
it('handles error')

// ✅ GOOD - documents behavior
it('should return 401 when session cookie is missing')
it('should reject slug with path traversal attempt')
it('CRITICAL: User A cannot deploy to User B organization')
```

## 5. DYNAMIC IMPORTS: ONLY FOR MOCKED MODULES

```typescript
// ❌ BAD - dynamic import without mocking
it('test', async () => {
  const { myFunction } = await import('@/lib/myModule')
})

// ✅ GOOD - static import when not mocking
import { myFunction } from '@/lib/myModule'

// ✅ ALSO GOOD - dynamic import AFTER vi.mock (required by Vitest)
vi.mock('@/lib/auth', () => ({ getUser: vi.fn() }))
const { getUser } = await import('@/lib/auth') // Gets mocked version
```

## 6. USE TEST HELPERS FOR AUTH

```typescript
// ❌ BAD - raw fetch with manual cookie handling
const response = await fetch(url, {
  headers: { Cookie: `session=${token}` }
})

// ✅ GOOD - use test helpers
import { authenticatedFetch } from '@/lib/test-helpers/test-auth-helpers'
const response = await authenticatedFetch(url, sessionCookie)
```

## 7. CLEAN UP TEST DATA

```typescript
// ❌ BAD - leaves test data in DB
beforeAll(async () => {
  user = await createTestUser()
})

// ✅ GOOD - always clean up
const createdUsers: TestUser[] = []

beforeAll(async () => {
  user = await createTestUser()
  createdUsers.push(user)
})

afterAll(async () => {
  for (const u of createdUsers) {
    await cleanupTestUser(u.userId)
  }
})
```

## 8. TEST ERROR PATHS, NOT JUST HAPPY PATHS

```typescript
// ❌ BAD - only tests success
describe('deploy', () => {
  it('should deploy successfully')
})

// ✅ GOOD - tests security boundaries
describe('deploy', () => {
  it('should deploy successfully')
  it('should return 401 without auth')
  it('should return 403 for wrong org')
  it('should reject path traversal in slug')
  it('should reject SQL injection in slug')
})
```

## Quick Decision Guide

| Scenario | Mock? | Why |
|----------|-------|-----|
| Testing auth logic | No | Test real behavior |
| Testing API routes with DB | Mock Supabase | Avoid test DB pollution |
| Testing credit deduction | Integration test | Business logic must be real |
| Testing rate limiting | Mock rate limiter | Control timing |
| External API (Stripe, etc) | Mock | No network calls in tests |

## Reference Examples

- `apps/web/features/deployment/__tests__/deployment-api-security.test.ts` - Security tests (integration)
- `apps/web/app/api/manager/users/__tests__/route.test.ts` - API route tests (mocked DB)
- `packages/tools/test/get-template.test.ts` - File system tests (real files)
