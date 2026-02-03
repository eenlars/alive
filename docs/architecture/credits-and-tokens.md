# Credits & Model-Based Pricing Guide

**Status**: ✅ Current
**Last Updated**: November 28, 2025

## Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│  CREDITS (Our Currency)                                      │
│  ├─ Conversion: 1 USD = 10 credits (1 credit = $0.10)       │
│  ├─ Storage: Supabase iam.orgs.credits (PostgreSQL)         │
│  ├─ No discount applied                                      │
│  └─ Example: User has 20 credits = $2.00 balance            │
│                                                              │
│  MODEL PRICING (Anthropic per MTok)                          │
│  ├─ Opus 4.5:   $5 input,  $25 output                       │
│  ├─ Sonnet 4.5: $3 input,  $15 output (≤200K tokens)        │
│  │              $6 input,  $22.50 output (>200K tokens)     │
│  └─ Haiku 4.5:  $1 input,  $5 output                        │
│                                                              │
│  CHARGE FLOW                                                 │
│  1. Claude returns: { input_tokens: 1000, output_tokens: 500 }
│  2. Calculate USD: (1000 × $3/MTok) + (500 × $15/MTok)      │
│                    = $0.003 + $0.0075 = $0.0105             │
│  3. Convert to credits: $0.0105 × 10 = 0.105 credits        │
│  4. Atomic deduction via Supabase RPC                        │
└─────────────────────────────────────────────────────────────┘
```

## Architecture Overview

### The Credit System

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Credit Flow                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Claude API Response                                                  │
│  { input_tokens: 1000, output_tokens: 500, model: "claude-sonnet" }  │
│            │                                                          │
│            ▼                                                          │
│  ┌─────────────────────────────────────┐                             │
│  │  calculateCreditsToCharge()         │                             │
│  │  (lib/models/model-pricing.ts)      │                             │
│  │                                     │                             │
│  │  1. Look up model pricing           │                             │
│  │  2. Calculate USD cost              │                             │
│  │  3. Convert USD → credits           │                             │
│  └─────────────────────────────────────┘                             │
│            │                                                          │
│            ▼ 0.105 credits                                           │
│  ┌─────────────────────────────────────┐                             │
│  │  chargeCreditsDirectly()            │                             │
│  │  (lib/credits/supabase-credits.ts)  │                             │
│  │                                     │                             │
│  │  Atomic RPC: deduct_credits()       │                             │
│  └─────────────────────────────────────┘                             │
│            │                                                          │
│            ▼                                                          │
│  ┌─────────────────────────────────────┐                             │
│  │  Supabase iam.orgs.credits          │                             │
│  │  19.895 credits remaining           │                             │
│  └─────────────────────────────────────┘                             │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `lib/models/model-pricing.ts` | Model pricing config, USD/credit calculation |
| `lib/credits/supabase-credits.ts` | Atomic credit deduction via Supabase RPC |
| `lib/tokens.ts` | Re-exports credit functions |
| `lib/stream/ndjson-stream-handler.ts` | Charges credits on assistant messages |

## Model Pricing

### Current Rates (per Million Tokens)

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| **Opus 4.5** | $5 | $25 | Most intelligent |
| **Sonnet 4.5** | $3 / $6 | $15 / $22.50 | Tiered at 200K tokens |
| **Haiku 4.5** | $1 | $5 | Fastest, cheapest |

**Important**: Output tokens cost **5x** more than input tokens (same model).

### Sonnet Tiered Pricing

Sonnet has tiered pricing based on total prompt tokens:
- **≤200K tokens**: $3 input, $15 output
- **>200K tokens**: $6 input, $22.50 output

**Current implementation**: Assumes under 200K threshold (most requests).
**TODO**: Track cumulative prompt tokens per conversation for accurate tier detection.

## Credit Calculation

### Formula

```typescript
// From lib/models/model-pricing.ts

// 1. Calculate USD cost
const inputCost = inputTokens * (inputPricePerMTok / 1_000_000)
const outputCost = outputTokens * (outputPricePerMTok / 1_000_000)
const usdCost = inputCost + outputCost

// 2. Convert to credits (1 USD = 10 credits)
const credits = usdCost * 10
```

### Examples

**Typical Haiku message** (2000 input, 500 output):
```
Input:  2000 × ($1 / 1,000,000) = $0.002
Output: 500 × ($5 / 1,000,000)  = $0.0025
Total USD: $0.0045
Credits:   0.045 credits (less than 1 cent!)
```

**Typical Sonnet message** (2000 input, 500 output):
```
Input:  2000 × ($3 / 1,000,000)  = $0.006
Output: 500 × ($15 / 1,000,000) = $0.0075
Total USD: $0.0135
Credits:   0.135 credits
```

**Typical Opus message** (2000 input, 500 output):
```
Input:  2000 × ($5 / 1,000,000)  = $0.01
Output: 500 × ($25 / 1,000,000) = $0.0125
Total USD: $0.0225
Credits:   0.225 credits
```

### Cost Comparison

| Operation | Haiku | Sonnet | Opus |
|-----------|-------|--------|------|
| 1M input tokens | 10 credits | 30 credits | 50 credits |
| 1M output tokens | 50 credits | 150 credits | 250 credits |
| Typical message | ~0.05 credits | ~0.14 credits | ~0.23 credits |

## Implementation Details

### Credit Charging Flow

```typescript
// In lib/stream/ndjson-stream-handler.ts

async function chargeCreditsForMessage(
  message: StreamMessage,
  workspace: string,
  requestId: string,
  model: ClaudeModel,
) {
  const usage = message.data.content.message.usage

  // Calculate credits based on model-specific pricing
  const creditsToCharge = calculateCreditsToCharge(
    model,
    usage.input_tokens,
    usage.output_tokens
  )

  // Atomic deduction via Supabase RPC
  const newBalance = await chargeCreditsDirectly(workspace, creditsToCharge)

  return { success: newBalance !== null, newBalance }
}
```

### Atomic Deduction

Credits are deducted atomically using a PostgreSQL function:

```sql
-- Atomic: check and update in single operation
UPDATE iam.orgs
SET credits = credits - p_amount
WHERE org_id = p_org_id
  AND credits >= p_amount  -- Prevents negative balance
RETURNING credits;
```

This prevents race conditions where concurrent requests could cause negative balances.
See [atomic-credit-charging.md](./atomic-credit-charging.md) for full details.

### Model Selection

- **Credit users**: Forced to use `DEFAULT_MODEL` (cost management)
- **API key users**: Can choose any model
- **Exception**: Admin users can use any model with credits

```typescript
// In app/api/claude/stream/route.ts
const effectiveModel = tokenSource === "workspace" && !isUnrestrictedUser
  ? DEFAULT_MODEL
  : isValidClaudeModel(requestedModel) ? requestedModel : DEFAULT_MODEL
```

## API Reference

### Get Credits Balance

```typescript
import { getOrgCredits } from "@/lib/tokens"

const balance = await getOrgCredits("example.com")
// Returns: 19.895 (credits)
```

### Charge Credits

```typescript
import { chargeCreditsDirectly } from "@/lib/tokens"

// For model-based pricing (new way)
const newBalance = await chargeCreditsDirectly("example.com", 0.105)
// Returns: new balance or null if insufficient
```

### Calculate Credits

```typescript
import { calculateCreditsToCharge } from "@/lib/models/model-pricing"

const credits = calculateCreditsToCharge(
  "claude-sonnet-4-5-20250514",
  1000,  // input tokens
  500    // output tokens
)
// Returns: 0.105 credits
```

## Configuration

### Constants

```typescript
// lib/models/model-pricing.ts
export const CREDITS_PER_USD = 10  // 1 USD = 10 credits

export const MODEL_PRICING = {
  "claude-opus-4-5-20250514": {
    inputPerMTok: 5,
    outputPerMTok: 25,
  },
  "claude-sonnet-4-5-20250514": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    tierThreshold: 200_000,
    inputPerMTokOverThreshold: 6,
    outputPerMTokOverThreshold: 22.5,
  },
  "claude-haiku-4-5-20250514": {
    inputPerMTok: 1,
    outputPerMTok: 5,
  },
}
```

### Updating Prices

1. Edit `MODEL_PRICING` in `lib/models/model-pricing.ts`
2. Update tests in `lib/models/__tests__/model-pricing.test.ts`
3. Run tests: `bun run test model-pricing`

## Migration from Old System

### What Changed

| Aspect | Old System | New System |
|--------|------------|------------|
| Conversion | 100 LLM tokens = 1 credit | 1 USD = 10 credits |
| Discount | 25% of cost charged | No discount |
| Model pricing | Same for all models | Per-model pricing |
| Input vs Output | Same price | Output 5x more expensive |
| Function | `chargeTokensFromCredits()` | `chargeCreditsDirectly()` |

### Backward Compatibility

The old `chargeTokensFromCredits()` function still exists for legacy code but uses the old flat-rate pricing with discount. New code should use `chargeCreditsDirectly()` with model-based pricing.

## See Also

- [Atomic Credit Charging](./atomic-credit-charging.md) - Race condition prevention
- [Model Pricing Implementation](./model-based-pricing-plan.md) - Implementation details
