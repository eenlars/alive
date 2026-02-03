# Model-Based Pricing Implementation

**Status**: ✅ Implemented
**Date**: November 28, 2025

> **Main documentation**: See [credits-and-tokens.md](./credits-and-tokens.md) for full details.

## Summary

Replaced the flat-rate token pricing with model-specific pricing based on Anthropic's rates.

### Key Changes

| Aspect | Before | After |
|--------|--------|-------|
| Conversion | 100 tokens = 1 credit | 1 USD = 10 credits |
| Discount | 25% charged (75% subsidy) | No discount |
| Model pricing | Same for all | Per-model rates |
| Input vs Output | Same price | Output 5x more |

### Pricing (per MTok)

| Model | Input | Output |
|-------|-------|--------|
| Opus 4.5 | $5 | $25 |
| Sonnet 4.5 | $3 / $6 | $15 / $22.50 |
| Haiku 4.5 | $1 | $5 |

## Files Changed

| File | Change |
|------|--------|
| `apps/web/lib/models/model-pricing.ts` | **NEW** - Pricing config, calculation functions |
| `apps/web/lib/models/__tests__/model-pricing.test.ts` | **NEW** - 36 tests |
| `apps/web/lib/stream/ndjson-stream-handler.ts` | Uses `calculateCreditsToCharge()` |
| `apps/web/app/api/claude/stream/route.ts` | Passes model to stream handler |
| `apps/web/lib/credits/supabase-credits.ts` | Added `chargeCreditsDirectly()` |
| `apps/web/lib/tokens.ts` | Exports new function |

## Key Functions

```typescript
// Calculate credits for usage
import { calculateCreditsToCharge } from "@/lib/models/model-pricing"

const credits = calculateCreditsToCharge(
  "claude-sonnet-4-5-20250514",
  1000,  // input tokens
  500    // output tokens
)
// Returns: 0.105 credits

// Charge credits atomically
import { chargeCreditsDirectly } from "@/lib/tokens"

const newBalance = await chargeCreditsDirectly("example.com", credits)
```

## TODOs

- [ ] Track cumulative prompt tokens for Sonnet tier pricing (>200K threshold)
- [ ] Update UI to show model-specific costs
- [ ] Monitor billing accuracy in production
