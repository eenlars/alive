# Test Data Cleanup - Safety Documentation

## Overview

This document explains the safety mechanisms in place to prevent accidental deletion of real production data.

## Safety Mechanisms

### 1. **ENFORCED** Test Email Domains

Test users **CANNOT** be created without using allowed test domains:

**Allowed domains** (defined in `lib/test-helpers/test-email-domains.ts`):
- `@test.com` ← **PREFERRED**
- `@example.com`
- `@localhost`
- `@test.local`

**Enforcement:**
- `createTestUser()` **throws an error** if email doesn't use allowed domain
- Cleanup script **only deletes** users with these domains
- E2E tests **must use** these domains

**Example:**
```typescript
// ✅ WORKS - Uses allowed test domain
createTestUser("mytest@test.com")

// ❌ FAILS - Throws SECURITY ERROR
createTestUser("mytest@example.com")
```

### 2. Double-Check for User Deletion

Users are only deleted if **BOTH** conditions are true:

1. **Database flag**: `is_test_env = true`
2. **Email domain**: Must end with an allowed test domain (see above)

### 3. Production User Protection

All production user creation code explicitly sets `is_test_env = false`:

- ✅ `scripts/add-domain-to-supabase.ts` - Deployment script
- ✅ `lib/deployment/domain-registry.ts` - Domain registration
- ✅ `scripts/migrate-json-to-supabase.ts` - Data migration

Only test helper sets `is_test_env = true` (with email validation):

- ⚠️ `lib/test-helpers/auth-test-helper.ts` - Test user creation (ENFORCES allowed domains)

### 4. Domain Pattern Restrictions

Domains are only deleted if they match strict test patterns:

- `tc1.alive.best`
- `tc2.alive.best`
- `tc3.alive.best`
- `test-concurrent-1.alive.best`
- `test-concurrent-2.alive.best`
- `test-concurrent-3.alive.best`
- Or belong to organizations owned by test users (double-checked)

**Production domains are never touched** - they don't match these patterns.

### 4. Dry Run Mode

The cleanup script defaults to **dry run** mode:

```bash
# Preview only (safe - no deletion)
bun run cleanup-test-db

# Actually delete (requires --force flag)
bun scripts/cleanup-test-database.ts --force
```

### 5. Warnings for Edge Cases

If the script finds users with `is_test_env = true` but **non-test emails**, it:

- **Skips** those users (doesn't delete them)
- **Logs a warning** to alert you of the anomaly

Example:
```
⚠️  [Test Cleanup] Skipped 2 users with is_test_env=true but non-test emails (safety check)
```

## What Gets Deleted

### Test Users

- Must have `is_test_env = true`
- Must have test email pattern
- Typically created by E2E tests or test helpers

### Test Organizations

- Organizations that belong to test users
- Orphaned organizations (no members)

### Test Domains

- Domains matching test patterns
- Domains belonging to test organizations

### Related Data

- Sessions for test users
- Organization memberships for test users
- Pending invites for test organizations

## What Will NEVER Be Deleted

❌ **Users with real email addresses** (even if `is_test_env = true` by mistake)
❌ **Production domains** (don't match test patterns)
❌ **Organizations with active real users**
❌ **Any data not associated with test users**

## Usage

### Preview Mode (Safe)

```bash
# See what would be deleted (no actual deletion)
bun run cleanup-test-db

# Or directly
bun scripts/cleanup-test-database.ts
```

### Actual Cleanup

```bash
# Actually delete test data
bun scripts/cleanup-test-database.ts --force
```

### E2E Test Integration

E2E tests automatically call `cleanupTestDatabase()` in their `afterAll` hook:

```typescript
test.afterAll(async () => {
  // ... filesystem cleanup ...

  // Database cleanup (not dry run)
  const { cleanupTestDatabase } = await import("@/lib/test-helpers/cleanup-test-database")
  await cleanupTestDatabase(false) // false = actually delete
})
```

### Cron Job (Automated)

Add to crontab for daily cleanup at 2am:

```bash
0 2 * * * cd /root/webalive/claude-bridge && bun scripts/cleanup-test-database.ts --force >> /var/log/test-cleanup.log 2>&1
```

## Verification

After cleanup, verify no orphaned data remains:

### SQL Verification (manual)

Run the verification queries from `scripts/cleanup-test-data.sql`:

```sql
-- Should return 0
SELECT COUNT(*) FROM iam.users WHERE is_test_env = true;

-- Should return 0
SELECT COUNT(*) FROM app.domains
WHERE hostname ~ '^(tc\d+|test-concurrent-\d+|test-).*\.(alive\.best|example\.com)$';

-- Should return 0
SELECT COUNT(*) FROM iam.orgs o
WHERE NOT EXISTS (
    SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
);
```

### Script Output

The cleanup script shows a summary:

```
✅ Cleanup completed successfully!
================================
Summary:
  • Users deleted: 15
  • Organizations deleted: 8
  • Domains deleted: 6
  • Memberships deleted: 15
  • Invites deleted: 0
  • Sessions deleted: 3
```

## Edge Cases

### Scenario: Someone manually sets `is_test_env = true` on a real user

**Protection**: Email pattern check will skip this user and log a warning.

### Scenario: Test creates a production-looking domain

**Protection**: Domain patterns are very specific (tc*.alive.best, test-*.alive.best, etc.)

### Scenario: Concurrent cleanup and deployment

**Protection**: Database transactions and atomic operations prevent race conditions.

## Best Practices

1. **ALWAYS use test email domains**: Use `@test.com` for all test users
2. **Always preview first**: Run without `--force` to see what would be deleted
3. **Check warnings**: Pay attention to skipped user warnings
4. **Verify after cleanup**: Check the counts in the summary
5. **Keep test patterns updated**: Add new test domain patterns to the cleanup script as needed
6. **Monitor logs**: Check cron logs regularly if using automated cleanup
7. **Run tests to verify**: `bun run test lib/test-helpers/__tests__/test-email-enforcement.test.ts`

## Files

- `lib/test-helpers/test-email-domains.ts` - **ENFORCED** test email domain constants
- `lib/test-helpers/auth-test-helper.ts` - Test user creation (with enforcement)
- `lib/test-helpers/cleanup-test-database.ts` - Core cleanup logic (uses enforcement)
- `lib/test-helpers/__tests__/test-email-enforcement.test.ts` - Enforcement tests
- `scripts/cleanup-test-database.ts` - CLI script
- `scripts/cleanup-test-data.sql` - SQL version (manual)
- `scripts/cleanup-orgs-without-users.sql` - Orphaned orgs cleanup
- `e2e-tests/concurrent-deploy.spec.ts` - E2E integration
