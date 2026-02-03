# TTL (Time-To-Live) Usage Guide

This guide explains how to use the TTL feature for automatic cleanup of OAuth secrets.

## Overview

TTL support allows OAuth secrets to automatically expire and be cleaned up after a specified duration. This is useful for:

1. **Test environments**: Short-lived secrets that auto-cleanup
2. **Provider token expiry**: Modeling actual token lifetimes
3. **Security hygiene**: Ensuring old secrets don't accumulate
4. **Compliance**: Meeting data retention policies

## How TTL Works

When a secret is saved with a TTL:
1. The `expires_at` timestamp is calculated as `now() + TTL`
2. The secret functions normally until expiry
3. After expiry, the secret becomes eligible for cleanup
4. A cleanup job (manual or scheduled) removes expired secrets

**Important**: Expired secrets are NOT automatically deleted immediately. They require a cleanup process to remove them.

## Setting TTL

### Per-Instance Configuration

Set a default TTL when creating an OAuth manager:

```typescript
import { createOAuthManager } from '@webalive/oauth-core'

// Production: No TTL (secrets persist until explicitly rotated)
const prodOAuth = createOAuthManager({
  provider: 'linear',
  instanceId: 'linear:prod',
  namespace: 'oauth_connections',
  environment: 'prod',
  defaultTtlSeconds: undefined  // No automatic expiry
})

// Test: 10-minute TTL for automatic cleanup
const testOAuth = createOAuthManager({
  provider: 'linear',
  instanceId: 'linear:test:e2e',
  namespace: 'oauth_connections',
  environment: 'test',
  defaultTtlSeconds: 600  // 10 minutes
})

// Development: 1-hour TTL
const devOAuth = createOAuthManager({
  provider: 'github',
  instanceId: 'github:dev',
  namespace: 'oauth_connections',
  environment: 'dev',
  defaultTtlSeconds: 3600  // 1 hour
})
```

### Dynamic TTL Based on Token Expiry

For providers that return `expires_in`, the TTL is automatically calculated:

```typescript
// When saving tokens with expires_in
const tokens = {
  access_token: 'abc123',
  refresh_token: 'xyz789',
  expires_in: 7200  // 2 hours
}

// If defaultTtlSeconds is not set, the token's expires_in is used
await oauthManager.saveTokens(userId, provider, tokens)
// Secret will have expires_at = now + 2 hours
```

## TTL Recommendations by Environment

### Production (`prod`)
```typescript
defaultTtlSeconds: undefined  // No TTL - secrets persist
```
- Let tokens persist until explicitly rotated
- Rely on refresh token rotation
- Manual cleanup only when needed

### Staging (`staging`)
```typescript
defaultTtlSeconds: 86400  // 24 hours
```
- Daily cleanup for testing artifacts
- Mirrors production behavior
- Prevents test data accumulation

### Development (`dev`)
```typescript
defaultTtlSeconds: 3600  // 1 hour
```
- Frequent cleanup during development
- Quick iteration cycles
- Reduces local database size

### E2E Tests (`test`)
```typescript
defaultTtlSeconds: 600  // 10 minutes
```
- Very short TTL for test isolation
- Automatic cleanup between test runs
- Prevents test data pollution

## Cleanup Methods

### Method 1: Scheduled Script (Recommended)

Run the cleanup script via cron:

```bash
# Add to crontab (runs daily at 3 AM)
0 3 * * * cd /path/to/oauth-core && bun run scripts/cleanup-expired-secrets.ts

# Or run manually
bun run scripts/cleanup-expired-secrets.ts --dry-run --verbose
```

### Method 2: Database Function (Backend Only)

> **⚠️ SECURITY WARNING**: This function deletes secrets across ALL tenants.
> It must ONLY be called from backend code using the `SUPABASE_SERVICE_KEY`.
> NEVER expose this to client-side code or use with anon/authenticated keys.

Call via Supabase RPC from a **backend service**:

```typescript
import { createClient } from '@supabase/supabase-js'

// MUST use service_role key - this is backend-only!
const adminSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!  // NOT the anon key!
)

// Dry run
const { data: dryRun, error } = await adminSupabase
  .schema('lockbox')
  .rpc('cleanup_expired_secrets', { p_dry_run: true })

if (error) throw error
console.log(`Would delete ${dryRun.expired_count} secrets`)

// Actual cleanup
const { data: result } = await adminSupabase
  .schema('lockbox')
  .rpc('cleanup_expired_secrets', { p_dry_run: false })

console.log(`Deleted ${result.deleted_count} expired secrets`)
```

### Method 3: Database Scheduled Job

Using pg_cron (if available):

```sql
-- Schedule daily cleanup at 3 AM UTC
SELECT cron.schedule(
  'cleanup-expired-secrets',
  '0 3 * * *',
  $$SELECT lockbox.cleanup_expired_secrets(false);$$
);
```

### Method 4: Application-Level Cleanup (Backend Only)

Add to your **backend** application startup (NOT client-side):

```typescript
import { createClient } from '@supabase/supabase-js'

// Cleanup on server startup (non-blocking)
// SECURITY: Only call from backend services, never from client code
async function startupCleanup() {
  if (process.env.NODE_ENV !== 'local') {
    // MUST use service_role key
    const adminSupabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    try {
      await adminSupabase
        .schema('lockbox')
        .rpc('cleanup_expired_secrets', { p_dry_run: false })
      console.log('Expired secrets cleaned up')
    } catch (error) {
      console.error('Cleanup failed (non-fatal):', error)
    }
  }
}
```

## Monitoring Expired Secrets

### Check for expired secrets:

```sql
SELECT
  instance_id,
  COUNT(*) as expired_count,
  MIN(expires_at) as oldest_expired,
  MAX(expires_at) as newest_expired
FROM lockbox.user_secrets
WHERE expires_at < now()
GROUP BY instance_id;
```

### Find secrets expiring soon:

```sql
SELECT
  user_id,
  instance_id,
  namespace,
  name,
  expires_at,
  expires_at - now() as time_remaining
FROM lockbox.user_secrets
WHERE expires_at IS NOT NULL
  AND expires_at > now()
  AND expires_at < now() + INTERVAL '1 hour'
ORDER BY expires_at ASC;
```

## Important Notes

1. **TTL is optional**: Not all secrets need TTLs. Production tokens often shouldn't have them.

2. **Cleanup is separate**: Expired secrets remain readable until cleaned up. This prevents surprises.

3. **User deletion cascades**: When a user is deleted, their secrets are deleted regardless of TTL (via foreign key cascade).

4. **TTL doesn't affect rotation**: Secret rotation works the same way regardless of TTL.

5. **Instance isolation**: TTLs are per-instance. Different instances can have different TTL policies.

## Security Considerations

1. **Cleanup is backend-only** - The `cleanup_expired_secrets` function deletes across ALL tenants. It requires `service_role` and must NEVER be called from client-side code.
2. **Don't set TTLs too short** in production - you might lose valid refresh tokens
3. **Monitor cleanup jobs** - ensure they're running successfully
4. **Test TTL behavior** in staging before production
5. **Consider grace periods** - maybe cleanup secrets expired > 24 hours ago
6. **Audit before deletion** - use dry-run mode to review what will be deleted

## Example: E2E Test Configuration

```typescript
// E2E test setup with automatic cleanup
export function createE2EOAuthManager(
  provider: string,
  runId: string,
  workerIndex: number
) {
  return createOAuthManager({
    provider,
    instanceId: buildInstanceId(provider, 'test', undefined, runId, workerIndex),
    namespace: 'oauth_connections',
    environment: 'test',
    defaultTtlSeconds: 300  // 5 minutes - shorter than test timeout
  })
}

// After all tests
afterAll(async () => {
  // Force immediate cleanup for this test run
  await supabase
    .from('user_secrets')
    .delete()
    .match({ instance_id: testInstanceId })
    .lt('expires_at', new Date().toISOString())
})
```

This ensures test secrets are automatically eligible for cleanup shortly after tests complete.