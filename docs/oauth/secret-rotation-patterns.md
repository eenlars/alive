# Secret Rotation Patterns

This document explains the safe secret rotation patterns for the OAuth system with instance awareness.

## The Challenge

When rotating secrets, we need to ensure:
1. **No gaps**: There's always at least one current secret
2. **No duplicates**: Only one secret can be current per (user, instance, namespace, name)
3. **Atomicity**: The rotation either fully succeeds or fully fails
4. **Race safety**: Concurrent rotations don't corrupt data

## The Solution: Insert-Then-Demote Pattern

The key insight is to **INSERT first, then UPDATE**:

1. Insert the new secret with `is_current = true`
2. Demote older secrets by setting `is_current = false`

This ensures there's always at least one current secret during rotation.

## Implementation Options

### Option 1: Database Function (Recommended for Production)

**Pros:**
- True atomicity via database transaction
- Single round-trip to database
- Guaranteed consistency
- Better performance

**Cons:**
- Requires database migration
- Less portable across database engines

**When to use:**
- Production environments
- High-concurrency scenarios
- When atomicity is critical

See [`rotate_secret_function.sql`](./rotate_secret_function.sql) for the implementation.

### Option 2: Application-Level with Proper Ordering

**Pros:**
- No database changes required
- Portable across databases
- Easier to debug and test
- Works with existing Supabase client

**Cons:**
- Multiple round-trips to database
- Not truly atomic (but safe due to unique index)
- Slightly higher latency

**When to use:**
- Development environments
- Lower-concurrency scenarios
- When you can't modify the database

Current implementation in `packages/oauth-core/src/storage.ts`.

## Safety Guarantees

Both approaches rely on the partial unique index:

```sql
CREATE UNIQUE INDEX user_secrets_one_current_per_instance_idx
ON lockbox.user_secrets (user_id, instance_id, namespace, name)
WHERE is_current = true;
```

This index acts as a safety net:
- If two concurrent inserts try to create current secrets, one will fail with error 23505
- The application can catch this and retry
- Database integrity is always maintained

## Race Condition Handling

### Scenario 1: Concurrent Rotations

When two processes try to rotate the same secret simultaneously:

```
Process A: INSERT (version 2, is_current=true) ✓
Process B: INSERT (version 2, is_current=true) ✗ (unique violation)
Process A: UPDATE (demote version 1) ✓
Process B: Retry with version 3 ✓
```

The unique index prevents corruption, and Process B can safely retry.

### Scenario 2: Read During Rotation

Reads always use the `is_current = true` filter:

```sql
SELECT * FROM lockbox.user_secrets
WHERE user_id = $userId
  AND instance_id = $instanceId
  AND namespace = $namespace
  AND name = $name
  AND is_current = true;
```

With the insert-then-demote pattern:
- Before rotation: Returns old secret ✓
- During INSERT: Returns old secret ✓
- After INSERT: Returns new secret ✓ (or old if UPDATE hasn't completed)
- After UPDATE: Returns new secret ✓

There's never a moment with no current secret.

## Testing the Rotation

To test concurrent rotation safety:

```typescript
// Test concurrent rotations
async function testConcurrentRotation() {
  const promises = []

  // Launch 10 concurrent rotations
  for (let i = 0; i < 10; i++) {
    promises.push(
      oauthManager.saveTokens(
        'test-user',
        'github',
        {
          access_token: `token-${i}`,
          refresh_token: `refresh-${i}`
        }
      )
    )
  }

  const results = await Promise.allSettled(promises)

  // Some should succeed, some should fail with retry-able errors
  const succeeded = results.filter(r => r.status === 'fulfilled')
  const failed = results.filter(r => r.status === 'rejected')

  console.log(`Succeeded: ${succeeded.length}, Failed: ${failed.length}`)

  // Verify only one current secret exists
  const current = await db.query(`
    SELECT COUNT(*) as count
    FROM lockbox.user_secrets
    WHERE user_id = 'test-user'
      AND instance_id = 'test-instance'
      AND namespace = 'oauth_tokens'
      AND name = 'github'
      AND is_current = true
  `)

  assert(current.count === 1, 'Exactly one current secret should exist')
}
```

## Recommendations

1. **Use the database function** for production if possible
2. **Monitor for 23505 errors** - these indicate concurrent rotations
3. **Implement retry logic** for concurrent rotation errors
4. **Test with high concurrency** before deploying
5. **Never skip the unique index** - it's your safety net

## Migration Path

To migrate existing deployments:

1. Ensure the unique index exists (it's your safety net)
2. Deploy the new application code with insert-then-demote pattern
3. Optionally add the database function for better performance
4. Monitor for any 23505 errors during transition

The system is designed to be safe even during migration - the unique index prevents any data corruption.