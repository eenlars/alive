# Test Email Domain Enforcement - Quick Reference

## 🔒 ENFORCED RULE: Test users MUST use approved domains

### Allowed Test Email Domains

```typescript
@test.com      ← PREFERRED (use this one!)
@example.com
@localhost
@test.local
```

## For Developers Writing Tests

### ✅ CORRECT Usage

```typescript
import { createTestUser, generateTestEmail } from "@/lib/test-helpers/auth-test-helper"

// Option 1: Auto-generate (recommended)
const user = await createTestUser()
// Creates: test-1234567890-abc@test.com

// Option 2: Custom email with allowed domain
const user = await createTestUser("mytest@test.com")

// Option 3: Use generator
const email = generateTestEmail("mytest")
const user = await createTestUser(email)
```

### ❌ WRONG Usage (Will throw error)

```typescript
// ❌ SECURITY ERROR: Real email domain
const user = await createTestUser("test@example.com")

// ❌ SECURITY ERROR: Not an allowed domain
const user = await createTestUser("test@notallowed.invalid")

// ❌ SECURITY ERROR: Production domain
const user = await createTestUser("test@alive.best")
```

### Error Message You'll See

```
SECURITY ERROR: Test users MUST use test email domains!
Provided: test@example.com
Allowed domains: @test.com, @example.com, @localhost, @test.local
Example: test-user@test.com
```

## For E2E Tests

```typescript
// In your test file
const TEST_SITES = [
  { slug: "tc1", domain: "tc1.alive.best", email: "tc1@test.com" },  // ✅ GOOD
  { slug: "tc2", domain: "tc2.alive.best", email: "tc2@test.com" },  // ✅ GOOD
]

// NOT this:
// { email: "tc1@example.com" }  // ❌ WILL FAIL
```

## Why This Matters

### Problem: Lazy devs forget to use test emails
- Tests create users with real-looking emails
- Cleanup scripts can't safely delete them
- Database fills with orphaned test data

### Solution: Enforcement at creation time
- **Cannot create** test users without approved domains
- Tests **fail immediately** if wrong domain used
- Cleanup scripts **only delete** users with approved domains
- **Zero risk** of deleting real users

## Testing the Enforcement

```bash
# Run enforcement tests
cd apps/web
bun run test lib/test-helpers/__tests__/test-email-enforcement.test.ts
```

All tests must pass before committing.

## Adding New Test Domains (Rare)

If you need to add a new test domain:

1. Edit `apps/web/lib/test-helpers/test-email-domains.ts`
2. Add to `ALLOWED_TEST_EMAIL_DOMAINS` array
3. Update this documentation
4. Run tests to verify: `bun run test lib/test-helpers/__tests__/test-email-enforcement.test.ts`

**WARNING:** Only add **fake/test** domains, NEVER real domains!

## API Reference

### `generateTestEmail(prefix?, domain?)`

Generates a unique test email with timestamp + random string.

```typescript
generateTestEmail()
// → "test-1234567890-abc123@test.com"

generateTestEmail("mytest")
// → "mytest-1234567890-abc123@test.com"

generateTestEmail("test", "@example.com")
// → "test-1234567890-abc123@example.com"
```

### `isTestEmail(email)`

Checks if an email uses an allowed test domain.

```typescript
isTestEmail("user@test.com")     // → true
isTestEmail("user@example.com")    // → false
```

### `validateTestEmail(email)`

Throws an error if email doesn't use allowed domain.

```typescript
validateTestEmail("user@test.com")    // ✓ No error
validateTestEmail("user@example.com")   // ✗ Throws SECURITY ERROR
```

### `createTestUser(email?, credits?)`

Creates a test user with enforcement.

```typescript
// Auto-generate email
const user = await createTestUser()

// Custom email (must be allowed domain)
const user = await createTestUser("mytest@test.com")

// Custom credits
const user = await createTestUser("mytest@test.com", 1000)
```

## Summary

| Action | Enforcement |
|--------|------------|
| Create test user with `@test.com` | ✅ Works |
| Create test user with `@example.com` | ❌ Throws error |
| Cleanup users with `@test.com` | ✅ Deleted safely |
| Cleanup users with `@example.com` | ⚠️ Skipped (even if `is_test_env=true`) |

**Result:** Impossible to accidentally delete real users, even with lazy devs! 🎉
