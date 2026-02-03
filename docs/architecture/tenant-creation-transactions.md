# Tenant Creation Transaction Management

## Current Implementation: Compensating Cleanup

**Status**: ✅ Implemented (2025-11-23)

The tenant creation endpoints (`/api/test/bootstrap-tenant` and `/api/manager/users/create`) currently use **compensating cleanup** to handle partial failures:

```typescript
// 1. Create user
const { error: userError } = await iam.from("users").insert({ ... })
if (userError) return error

// 2. Create org
const { error: orgError } = await iam.from("orgs").insert({ ... })
if (orgError) {
  await iam.from("users").delete().eq("user_id", userId) // Cleanup
  return error
}

// 3. Create membership
const { error: membershipError } = await iam.from("org_memberships").insert({ ... })
if (membershipError) {
  await Promise.allSettled([
    iam.from("users").delete().eq("user_id", userId),
    iam.from("orgs").delete().eq("org_id", orgId)
  ])
  return error
}
```

### Pros
- ✅ Simple to implement
- ✅ Works with existing Supabase client
- ✅ No database schema changes required
- ✅ Follows existing pattern in codebase

### Cons
- ❌ Not atomic (cleanup itself can fail)
- ❌ Race condition window (another request could see partial state)
- ❌ Cleanup deletes can fail silently with `Promise.allSettled`
- ❌ Clutters business logic with error handling

## Future Improvement: Database Transactions

**Status**: 📋 Proposed (not yet implemented)

For production-grade atomicity, implement a PostgreSQL function that wraps all operations in a transaction.

### Implementation

#### 1. Create Database Function

```sql
-- File: docs/database/functions/create-tenant.sql
CREATE OR REPLACE FUNCTION iam.create_tenant(
  p_user_id UUID,
  p_email TEXT,
  p_password_hash TEXT,
  p_org_id UUID,
  p_org_name TEXT,
  p_org_credits INTEGER DEFAULT 0,
  p_is_test_env BOOLEAN DEFAULT false,
  p_test_run_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS TABLE (
  user_id UUID,
  org_id UUID,
  email TEXT,
  org_name TEXT
) AS $$
BEGIN
  -- All operations within this function run in a single transaction
  -- If any step fails, the entire transaction is rolled back automatically

  -- 1. Create user
  INSERT INTO iam.users (
    user_id, email, password_hash, status,
    is_test_env, test_run_id, metadata
  ) VALUES (
    p_user_id, p_email, p_password_hash, 'active',
    p_is_test_env, p_test_run_id, p_metadata
  );

  -- 2. Create org
  INSERT INTO iam.orgs (
    org_id, name, credits,
    is_test_env, test_run_id
  ) VALUES (
    p_org_id, p_org_name, p_org_credits,
    p_is_test_env, p_test_run_id
  );

  -- 3. Create membership
  INSERT INTO iam.org_memberships (
    user_id, org_id, role
  ) VALUES (
    p_user_id, p_org_id, 'owner'
  );

  -- Return created tenant info
  RETURN QUERY
  SELECT p_user_id, p_org_id, p_email, p_org_name;

EXCEPTION
  WHEN OTHERS THEN
    -- PostgreSQL automatically rolls back on exception
    RAISE EXCEPTION 'Tenant creation failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION iam.create_tenant TO service_role;
```

#### 2. Add Domain Creation (Separate DB)

Since domains are in a different database (`app` schema), handle them separately:

```typescript
export async function POST(req: Request) {
  const iam = await createIamClient("service")
  const app = await createAppClient("service")

  // Step 1: Create user/org/membership atomically via DB function
  const { data, error } = await iam.rpc("create_tenant", {
    p_user_id: userId,
    p_email: email,
    p_password_hash: passwordHash,
    p_org_id: orgId,
    p_org_name: `E2E Worker ${workerIndex}`,
    p_org_credits: credits,
    p_is_test_env: true,
    p_test_run_id: runId,
    p_metadata: { workerIndex }
  })

  if (error) {
    // No cleanup needed - transaction was rolled back
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Step 2: Create domain (separate DB, so not in transaction)
  const { error: domainError } = await app.from("domains").upsert({ ... })

  if (domainError) {
    // Cleanup the successfully created tenant
    await iam.rpc("delete_tenant", { p_user_id: userId, p_org_id: orgId })
    return Response.json({ error: domainError.message }, { status: 500 })
  }

  return Response.json({ ok: true, tenant: data })
}
```

### Pros
- ✅ **True atomicity** - all-or-nothing semantics
- ✅ **No orphaned records** - automatic rollback on failure
- ✅ **Better performance** - single round trip to DB
- ✅ **Cleaner code** - business logic separated from error handling
- ✅ **Industry standard** - PostgreSQL transactions are battle-tested

### Cons
- ❌ Requires database migration
- ❌ More complex to test
- ❌ Domain creation still separate (different database)
- ❌ Requires `service_role` permissions

## Migration Path

If implementing database transactions:

1. **Create function**: Add `docs/database/functions/create-tenant.sql`
2. **Run migration**: Apply SQL via Supabase dashboard or CLI
3. **Update code**: Replace sequential inserts with `iam.rpc("create_tenant")`
4. **Test**: Verify rollback behavior with intentional failures
5. **Deploy**: Roll out to staging, then production

## Recommendation

- **For now**: Compensating cleanup is sufficient for test environments
- **For production**: Consider database transactions if:
  - High concurrency expected
  - Data consistency is critical
  - Observing orphaned records in production

## Related Files

- `/apps/web/app/api/test/bootstrap-tenant/route.ts` - E2E test tenant creation
- `/apps/web/app/api/manager/users/create/route.ts` - Production user creation
- `/docs/architecture/atomic-credit-charging.md` - Similar transaction pattern for credits

## References

- [PostgreSQL Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [Supabase RPC Functions](https://supabase.com/docs/guides/database/functions)
- [Compensating Transactions Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)
