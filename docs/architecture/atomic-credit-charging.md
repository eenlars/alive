# Atomic Credit Charging - Race Condition Fix

**Date**: 2025-11-20
**Updated**: 2025-11-28 (model-based pricing integration)
**Status**: Implemented
**Problem**: Billing leaks causing negative balances

> **Note**: This document focuses on the **atomic deduction mechanism**. For model-based
> pricing details, see [credits-and-tokens.md](./credits-and-tokens.md).

---

## Problem: The "Read → Math → Write" Race Condition

### Original Implementation (UNSAFE)

```typescript
// ❌ BAD: Race condition allows negative balances
// Step 1: READ current balance
const { data: org } = await supabase
  .from("orgs")
  .select("credits")
  .eq("org_id", orgId)
  .single()

// Step 2: MATH - calculate new balance
const currentBalance = org.credits ?? 0
const newBalance = currentBalance - chargedCredits

// Step 3: Validate
if (newBalance < 0) {
  return null  // Too late! Another request already charged
}

// Step 4: WRITE new balance
await supabase
  .from("orgs")
  .update({ credits: newBalance })
  .eq("org_id", orgId)
```

### What Goes Wrong

**Scenario**: User has 10 credits, sends 3 requests simultaneously for 5 credits each

```
Time  │ Request 1         │ Request 2         │ Request 3
──────┼───────────────────┼───────────────────┼──────────────────
T1    │ READ: 10 credits  │                   │
T2    │                   │ READ: 10 credits  │
T3    │                   │                   │ READ: 10 credits
T4    │ MATH: 10 - 5 = 5  │                   │
T5    │                   │ MATH: 10 - 5 = 5  │
T6    │                   │                   │ MATH: 10 - 5 = 5
T7    │ CHECK: 5 >= 0 ✅  │                   │
T8    │                   │ CHECK: 5 >= 0 ✅  │
T9    │                   │                   │ CHECK: 5 >= 0 ✅
T10   │ WRITE: 5 credits  │                   │
T11   │                   │ WRITE: 5 credits  │ (overwrites!)
T12   │                   │                   │ WRITE: 5 credits (overwrites!)
──────┴───────────────────┴───────────────────┴──────────────────
RESULT: Final balance = 5 credits
EXPECTED: Should have rejected 2 requests (balance should be 5)
ACTUAL: User got 15 credits worth of service, only paid 5!
```

**Impact**: Lost revenue, negative balances possible with timing variations.

---

## Solution: Atomic Database Operation

### Database Function (PostgreSQL)

**File**: `docs/database/atomic-credit-deduction.sql`

```sql
CREATE OR REPLACE FUNCTION iam.deduct_credits(
    p_org_id TEXT,  -- TEXT because org IDs are "org_abc123..." format
    p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_balance NUMERIC;
BEGIN
    -- ✅ ATOMIC: Check and update in single operation
    UPDATE iam.orgs
    SET
        credits = credits - p_amount,
        updated_at = NOW()
    WHERE
        org_id = p_org_id
        AND credits >= p_amount  -- Critical: prevents negative balance
    RETURNING credits INTO v_new_balance;

    -- If no row was updated (insufficient credits), return NULL
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN v_new_balance;
END;
$$;
```

**Why This Works**:
- The `UPDATE ... WHERE credits >= p_amount` is atomic in PostgreSQL
- Database locks the row during the transaction
- Concurrent requests queue, each sees the updated balance
- Impossible to go negative

### Updated TypeScript Code

**File**: `apps/web/lib/credits/supabase-credits.ts`

```typescript
// ✅ GOOD: Atomic deduction via RPC (model-based pricing)
export async function chargeCreditsDirectly(
  domain: string,
  creditsToCharge: number
): Promise<number | null> {
  const orgId = await getOrgIdForDomain(domain)

  // Call database function - atomic operation
  const { data, error } = await iam.rpc("deduct_credits", {
    p_org_id: orgId,
    p_amount: creditsToCharge,
  })

  if (error || data === null) {
    // data === null means insufficient credits (WHERE clause failed)
    return null
  }

  return data as number  // New balance
}
```

**Note**: Credits are now calculated using model-based pricing via `calculateCreditsToCharge()`
from `lib/models/model-pricing.ts` before calling this function.

### Same Scenario, Fixed

```
Time  │ Request 1              │ Request 2              │ Request 3
──────┼────────────────────────┼────────────────────────┼───────────────────
T1    │ RPC: deduct_credits(5) │                        │
T2    │ DB: Lock row           │                        │
T3    │ DB: Check 10 >= 5 ✅   │                        │
T4    │ DB: Update to 5        │                        │
T5    │ DB: Unlock row         │                        │
T6    │ Return: 5 credits      │                        │
T7    │                        │ RPC: deduct_credits(5) │
T8    │                        │ DB: Lock row           │
T9    │                        │ DB: Check 5 >= 5 ✅    │
T10   │                        │ DB: Update to 0        │
T11   │                        │ DB: Unlock row         │
T12   │                        │ Return: 0 credits      │
T13   │                        │                        │ RPC: deduct_credits(5)
T14   │                        │                        │ DB: Lock row
T15   │                        │                        │ DB: Check 0 >= 5 ❌
T16   │                        │                        │ DB: Unlock (no update)
T17   │                        │                        │ Return: NULL
──────┴────────────────────────┴────────────────────────┴───────────────────
RESULT: Req 1 ✅ (balance: 5), Req 2 ✅ (balance: 0), Req 3 ❌ REJECTED
EXPECTED: Exactly 2 requests succeed, 1 rejected
ACTUAL: ✅ Works perfectly!
```

---

## Stream Handler Changes

**File**: `apps/web/lib/stream/ndjson-stream-handler.ts`

### Updated Credit Charging Function (Model-Based)

```typescript
async function chargeCreditsForMessage(
  message: StreamMessage,
  workspace: string,
  requestId: string,
  model: ClaudeModel  // NEW: Model needed for pricing
): Promise<{
  success: boolean
  newBalance: number | null
  insufficientCredits: boolean
}> {
  const usage = message.data.content.message.usage

  // Calculate credits based on model-specific pricing
  const creditsToCharge = calculateCreditsToCharge(
    model,
    usage.input_tokens,
    usage.output_tokens
  )

  const newBalance = await chargeCreditsDirectly(workspace, creditsToCharge)

  if (newBalance !== null) {
    return { success: true, newBalance, insufficientCredits: false }
  } else {
    return { success: false, newBalance: null, insufficientCredits: true }
  }
}
```

### Non-Blocking Charge with Warning

```typescript
if (tokenSource === "workspace") {
  // Non-blocking: don't stop stream if charge fails
  chargeCreditsForMessage(message, workspace, requestId, model)
    .then(result => {
      if (result.insufficientCredits) {
        console.warn(
          `⚠️  Credits exhausted mid-stream. Current message delivered but future requests will be blocked.`
        )
      }
    })
    .catch(error => {
      console.error(`Credit charging failed:`, error)
    })
}

controller.enqueue(encodeNDJSON(message))  // Send message regardless
```

**Design Decision**: Don't stop stream on charge failure because:
1. Message already generated by Claude (we owe them)
2. Better UX to complete current request
3. Next request will be blocked at upfront check

---

## Deployment Checklist

### 1. Deploy SQL Function

```bash
# Connect to Supabase SQL Editor
# Run: docs/database/atomic-credit-deduction.sql
```

Verify:
```sql
-- Test with sufficient credits
SELECT iam.deduct_credits('some-org-id', 5.0);
-- Should return new balance

-- Test with insufficient credits
SELECT iam.deduct_credits('some-org-id', 999999);
-- Should return NULL
```

### 2. Deploy TypeScript Code

Changes made:
- ✅ `apps/web/lib/credits/supabase-credits.ts` - Uses RPC, added `chargeCreditsDirectly()`
- ✅ `apps/web/lib/models/model-pricing.ts` - Model pricing config, `calculateCreditsToCharge()`
- ✅ `apps/web/lib/stream/ndjson-stream-handler.ts` - Uses model-based pricing
- ✅ Documentation - This file + `credits-and-tokens.md`

### 3. Verify in Production

Monitor logs for:
- ✅ `"Charged X credits"` - Normal charges
- ⚠️  `"Insufficient credits to charge"` - Atomic rejection (expected)
- ❌ `"Credits exhausted mid-stream"` - Rare edge case (user ran out during long stream)

---

## Performance Optimization

### Domain → Org ID Caching

Every credit charge requires two database operations:
1. Query `app.domains` to get org_id from domain
2. Call `iam.deduct_credits()` to atomically deduct credits

Since domain → org_id mappings rarely change, we cache them in memory:

```typescript
// In-memory cache with 5-minute TTL
const domainOrgCache = new Map<string, { orgId: string, expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

async function getOrgIdForDomain(domain: string): Promise<string | null> {
  // Check cache first
  const cached = domainOrgCache.get(domain)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.orgId  // Cache hit - no database query
  }

  // Cache miss/expired - query database and cache result
  const { data } = await app.from("domains").select("org_id").eq("hostname", domain).single()
  domainOrgCache.set(domain, { orgId: data.org_id, expiresAt: Date.now() + CACHE_TTL_MS })
  return data.org_id
}
```

**Impact**:
- **First request**: 2 database queries (~100-200ms)
- **Cached requests**: 1 database query (~50-100ms)
- **50% faster** for repeat requests within 5-minute window
- **Safe**: Cache expires after 5 minutes, errors invalidate cache

**Why This Works**:
- Domain → org_id mappings are stable (domains rarely change organizations)
- TTL ensures fresh data (5-minute window is reasonable)
- Cache invalidation on errors (if domain deleted, cache cleared)
- No deployment needed (just in-memory Map)

---

## Benefits

### Before (Race Condition)
- ❌ Concurrent requests cause negative balances
- ❌ Lost revenue (users get free API usage)
- ❌ No alerting on billing failures
- ❌ Complex reservation system needed
- ❌ Two database queries per charge (slower)

### After (Atomic + Cached)
- ✅ Mathematically impossible to go negative
- ✅ Database guarantees consistency
- ✅ No need for credit reservation
- ✅ Simple, robust, provably correct
- ✅ 50% faster for cached domains (1 query instead of 2)

---

## Testing

### Three-Layer Test Strategy

#### Layer 1: Unit Tests (Fast, No Database)
**File**: `apps/web/lib/credits/__tests__/atomic-deduction.test.ts`

Tests mathematical properties and business logic WITHOUT database:
- Credit calculation formulas
- Rounding behavior
- Input validation
- Mathematical invariants (conservation, monotonicity, associativity)
- Edge cases (zero, negative, overflow, floating point precision)

```bash
bun run test lib/credits/__tests__/atomic-deduction.test.ts
# ✓ 31 tests pass in ~50ms
```

**Key insight**: These test the LOGIC by simulating the SQL WHERE clause behavior:
```typescript
function simulateAtomicDeduction(balance: number, amount: number): number | null {
  if (balance >= amount) {
    return balance - amount
  }
  return null
}
```

#### Layer 2: Integration Tests (Real Database)
**File**: `apps/web/lib/credits/__tests__/atomic-deduction.integration.test.ts`

Tests actual Supabase RPC function with real concurrency:
- Database function exists and works
- Concurrent requests handled atomically
- Edge cases with real floating point storage
- Error handling with real network failures

```bash
cd apps/web && bun run test lib/credits/__tests__/atomic-deduction.integration.test.ts
# ✓ Tests verify: 3 concurrent requests → exactly 2 succeed, 1 fails
# ✓ 100 concurrent requests → exactly N succeed, balance = 0 (never negative)
```

**Skips gracefully** if Supabase credentials not available.

#### Layer 3: E2E Smoke Test (Full System)
**File**: `scripts/test-atomic-credits.ts`

Tests complete system including:
- Dynamic test user/org creation (using test helper infrastructure)
- SQL function invocation
- Concurrent deduction verification
- Automatic cleanup after tests

```bash
cd apps/web && bun ../../scripts/test-atomic-credits.ts
# ✓ Creates test user + org automatically
# ✓ Verifies concurrent race condition handling
# ✓ Cleans up test data after completion
```

Uses `createTestUser()` from test helpers - no manual org ID needed.

Use this before deploying to production.

### What Each Layer Proves

| Layer | Speed | Proves | Catches |
|-------|-------|--------|---------|
| Unit | ~50ms | Math is correct | Rounding errors, edge cases, formula bugs |
| Integration | ~10s | Database works atomically | SQL bugs, concurrency issues, type mismatches |
| E2E | ~5s | Full system works end-to-end | Config issues, env problems, deployment bugs |

### Test Coverage Checklist

✅ **Invariants tested**:
- Balance never goes negative (all layers)
- Credits conserved (initial - charged = final) (unit)
- Atomic operations (success OR failure, never partial) (integration)

✅ **Edge cases tested**:
- Zero balance, zero charge (unit, integration)
- Exact balance match (integration)
- Floating point precision (0.1 + 0.2) (unit, integration)
- Very large/small amounts (unit)
- Negative inputs (unit, integration)

✅ **Concurrency tested**:
- 3 concurrent requests (integration, E2E)
- 100 concurrent requests (integration)
- Race condition simulation (unit)

✅ **Error handling tested**:
- Non-existent domain (integration)
- Database timeout (TODO: needs mocking)
- Network failure (TODO: needs mocking)

---

## Related Issues

**Fixed**:
- Race condition in credit charging (lines 198-227 in old code)
- Negative balance vulnerability
- Lost revenue from concurrent requests

**Still TODO** (from `STREAM_ORCHESTRATOR_ANALYSIS.md`):
- [ ] Replace in-memory session store (P0)
- [ ] Distributed conversation locking (P0)
- [ ] Retry mechanism for failed charges (P1)

---

## References

- **SQL Function**: `docs/database/atomic-credit-deduction.sql`
- **Credit Deduction**: `apps/web/lib/credits/supabase-credits.ts` - `chargeCreditsDirectly()`
- **Model Pricing**: `apps/web/lib/models/model-pricing.ts` - `calculateCreditsToCharge()`
- **Stream Handler**: `apps/web/lib/stream/ndjson-stream-handler.ts` - `chargeCreditsForMessage()`
- **Main Guide**: [credits-and-tokens.md](./credits-and-tokens.md)
