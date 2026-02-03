/**
 * Model Pricing Tests
 *
 * Tests the USD cost calculation and credit conversion for Claude models.
 *
 * Pricing (per MTok):
 * - Opus 4.5: $5 input, $25 output
 * - Sonnet 4.5: $3/$6 input (≤200K/>200K), $15/$22.50 output
 * - Haiku 4.5: $1 input, $5 output
 *
 * Credit conversion: 1 USD = 10 credits
 */

import { describe, expect, test } from "vitest"
import { CLAUDE_MODELS } from "../claude-models"
import {
  CREDITS_PER_USD,
  calculateCreditsToCharge,
  calculateUSDCost,
  creditsToUSD,
  getModelPricingInfo,
  MODEL_PRICING,
  usdToCredits,
} from "../model-pricing"

describe("Model Pricing Configuration", () => {
  test("CREDITS_PER_USD should be 10", () => {
    expect(CREDITS_PER_USD).toBe(10)
  })

  test("should have pricing for all models", () => {
    expect(MODEL_PRICING[CLAUDE_MODELS.OPUS_4_5]).toBeDefined()
    expect(MODEL_PRICING[CLAUDE_MODELS.SONNET_4_5]).toBeDefined()
    expect(MODEL_PRICING[CLAUDE_MODELS.HAIKU_4_5]).toBeDefined()
  })

  test("Opus pricing should match Anthropic rates", () => {
    const opus = MODEL_PRICING[CLAUDE_MODELS.OPUS_4_5]
    expect(opus.inputPerMTok).toBe(5)
    expect(opus.outputPerMTok).toBe(25)
  })

  test("Sonnet pricing should match Anthropic rates with tiers", () => {
    const sonnet = MODEL_PRICING[CLAUDE_MODELS.SONNET_4_5]
    expect(sonnet.inputPerMTok).toBe(3)
    expect(sonnet.outputPerMTok).toBe(15)
    expect(sonnet.tierThreshold).toBe(200_000)
    expect(sonnet.inputPerMTokOverThreshold).toBe(6)
    expect(sonnet.outputPerMTokOverThreshold).toBe(22.5)
  })

  test("Haiku pricing should match Anthropic rates", () => {
    const haiku = MODEL_PRICING[CLAUDE_MODELS.HAIKU_4_5]
    expect(haiku.inputPerMTok).toBe(1)
    expect(haiku.outputPerMTok).toBe(5)
  })
})

describe("usdToCredits()", () => {
  test("should convert $1 to 10 credits", () => {
    expect(usdToCredits(1)).toBe(10)
  })

  test("should convert $0.10 to 1 credit", () => {
    expect(usdToCredits(0.1)).toBe(1)
  })

  test("should convert $0.001 to 0.01 credits", () => {
    expect(usdToCredits(0.001)).toBe(0.01)
  })

  test("should round to 2 decimal places", () => {
    expect(usdToCredits(0.12345)).toBe(1.23)
  })

  test("should handle zero", () => {
    expect(usdToCredits(0)).toBe(0)
  })
})

describe("creditsToUSD()", () => {
  test("should convert 10 credits to $1", () => {
    expect(creditsToUSD(10)).toBe(1)
  })

  test("should convert 1 credit to $0.10", () => {
    expect(creditsToUSD(1)).toBe(0.1)
  })

  test("should handle fractional credits", () => {
    expect(creditsToUSD(0.5)).toBe(0.05)
  })
})

describe("calculateUSDCost()", () => {
  describe("Haiku 4.5", () => {
    const model = CLAUDE_MODELS.HAIKU_4_5

    test("should calculate cost for 1M input tokens", () => {
      // 1M input tokens at $1/MTok = $1
      const cost = calculateUSDCost(model, 1_000_000, 0)
      expect(cost).toBe(1)
    })

    test("should calculate cost for 1M output tokens", () => {
      // 1M output tokens at $5/MTok = $5
      const cost = calculateUSDCost(model, 0, 1_000_000)
      expect(cost).toBe(5)
    })

    test("should calculate combined input/output cost", () => {
      // 1000 input at $1/MTok = $0.001
      // 1000 output at $5/MTok = $0.005
      // Total = $0.006
      const cost = calculateUSDCost(model, 1000, 1000)
      expect(cost).toBe(0.006)
    })

    test("should calculate typical message cost", () => {
      // Typical message: 500 input, 200 output
      // 500 input at $1/MTok = $0.0005
      // 200 output at $5/MTok = $0.001
      // Total = $0.0015
      const cost = calculateUSDCost(model, 500, 200)
      expect(cost).toBe(0.0015)
    })
  })

  describe("Sonnet 4.5", () => {
    const model = CLAUDE_MODELS.SONNET_4_5

    test("should use standard tier when under 200K prompt tokens", () => {
      // 1000 input at $3/MTok = $0.003
      // 1000 output at $15/MTok = $0.015
      // Total = $0.018
      const cost = calculateUSDCost(model, 1000, 1000, 50_000)
      expect(cost).toBeCloseTo(0.018, 10)
    })

    test("should use standard tier when totalPromptTokens not provided", () => {
      // 1000 input at $3/MTok = $0.003
      // 1000 output at $15/MTok = $0.015
      const cost = calculateUSDCost(model, 1000, 1000)
      expect(cost).toBeCloseTo(0.018, 10)
    })

    test("should use higher tier when over 200K prompt tokens", () => {
      // 1000 input at $6/MTok = $0.006
      // 1000 output at $22.5/MTok = $0.0225
      // Total = $0.0285
      const cost = calculateUSDCost(model, 1000, 1000, 250_000)
      expect(cost).toBeCloseTo(0.0285, 10)
    })

    test("should use standard tier at exactly 200K", () => {
      // At exactly 200K, should still use standard tier
      const cost = calculateUSDCost(model, 1000, 1000, 200_000)
      expect(cost).toBeCloseTo(0.018, 10)
    })

    test("should use higher tier at 200K + 1", () => {
      const cost = calculateUSDCost(model, 1000, 1000, 200_001)
      expect(cost).toBeCloseTo(0.0285, 10)
    })
  })

  describe("Opus 4.5", () => {
    const model = CLAUDE_MODELS.OPUS_4_5

    test("should calculate cost for 1M input tokens", () => {
      // 1M input tokens at $5/MTok = $5
      const cost = calculateUSDCost(model, 1_000_000, 0)
      expect(cost).toBe(5)
    })

    test("should calculate cost for 1M output tokens", () => {
      // 1M output tokens at $25/MTok = $25
      const cost = calculateUSDCost(model, 0, 1_000_000)
      expect(cost).toBe(25)
    })

    test("should calculate typical message cost", () => {
      // 500 input at $5/MTok = $0.0025
      // 200 output at $25/MTok = $0.005
      // Total = $0.0075
      const cost = calculateUSDCost(model, 500, 200)
      expect(cost).toBe(0.0075)
    })
  })

  describe("Unknown model fallback", () => {
    test("should use Haiku pricing for unknown model", () => {
      // @ts-expect-error Testing with invalid model
      const cost = calculateUSDCost("unknown-model", 1000, 1000)
      // Should match Haiku: 1000 * $1/MTok + 1000 * $5/MTok = $0.006
      expect(cost).toBe(0.006)
    })
  })
})

describe("calculateCreditsToCharge()", () => {
  test("should convert Haiku usage to credits", () => {
    // 1000 input + 1000 output = $0.006 USD
    // $0.006 * 10 = 0.06 credits
    const credits = calculateCreditsToCharge(CLAUDE_MODELS.HAIKU_4_5, 1000, 1000)
    expect(credits).toBe(0.06)
  })

  test("should convert Sonnet usage to credits", () => {
    // 1000 input + 1000 output (under threshold) = $0.018 USD
    // $0.018 * 10 = 0.18 credits
    const credits = calculateCreditsToCharge(CLAUDE_MODELS.SONNET_4_5, 1000, 1000)
    expect(credits).toBe(0.18)
  })

  test("should convert Opus usage to credits", () => {
    // 1000 input + 1000 output = $0.03 USD
    // $0.03 * 10 = 0.3 credits
    const credits = calculateCreditsToCharge(CLAUDE_MODELS.OPUS_4_5, 1000, 1000)
    expect(credits).toBe(0.3)
  })

  test("should handle Sonnet tiered pricing", () => {
    // Over 200K threshold
    // 1000 input at $6/MTok + 1000 output at $22.5/MTok = $0.0285
    // $0.0285 * 10 = 0.29 credits (rounded)
    const credits = calculateCreditsToCharge(CLAUDE_MODELS.SONNET_4_5, 1000, 1000, 250_000)
    expect(credits).toBe(0.29)
  })

  test("real-world example: typical chat message with Haiku", () => {
    // Typical: 2000 input (system + context), 500 output
    // 2000 * $1/MTok = $0.002
    // 500 * $5/MTok = $0.0025
    // Total = $0.0045 USD = 0.05 credits (rounded)
    const credits = calculateCreditsToCharge(CLAUDE_MODELS.HAIKU_4_5, 2000, 500)
    expect(credits).toBe(0.05)
  })
})

describe("getModelPricingInfo()", () => {
  test("should return pricing for valid model", () => {
    const pricing = getModelPricingInfo(CLAUDE_MODELS.HAIKU_4_5)
    expect(pricing).not.toBeNull()
    expect(pricing?.inputPerMTok).toBe(1)
  })

  test("should return null for invalid model", () => {
    // @ts-expect-error Testing with invalid model
    const pricing = getModelPricingInfo("invalid-model")
    expect(pricing).toBeNull()
  })
})

describe("Cost comparison across models", () => {
  // Same usage across all models to compare costs
  const INPUT_TOKENS = 5000
  const OUTPUT_TOKENS = 1000

  test("Opus should be most expensive", () => {
    const opusCost = calculateUSDCost(CLAUDE_MODELS.OPUS_4_5, INPUT_TOKENS, OUTPUT_TOKENS)
    const sonnetCost = calculateUSDCost(CLAUDE_MODELS.SONNET_4_5, INPUT_TOKENS, OUTPUT_TOKENS)
    const haikuCost = calculateUSDCost(CLAUDE_MODELS.HAIKU_4_5, INPUT_TOKENS, OUTPUT_TOKENS)

    expect(opusCost).toBeGreaterThan(sonnetCost)
    expect(sonnetCost).toBeGreaterThan(haikuCost)
  })

  test("Opus is 5x Haiku for input, 5x for output", () => {
    const opusInput = calculateUSDCost(CLAUDE_MODELS.OPUS_4_5, 1_000_000, 0)
    const haikuInput = calculateUSDCost(CLAUDE_MODELS.HAIKU_4_5, 1_000_000, 0)
    expect(opusInput / haikuInput).toBe(5)

    const opusOutput = calculateUSDCost(CLAUDE_MODELS.OPUS_4_5, 0, 1_000_000)
    const haikuOutput = calculateUSDCost(CLAUDE_MODELS.HAIKU_4_5, 0, 1_000_000)
    expect(opusOutput / haikuOutput).toBe(5)
  })

  test("Output tokens cost 5x input tokens (same model)", () => {
    // For Haiku: $1 input vs $5 output = 5x
    const haikuInput = calculateUSDCost(CLAUDE_MODELS.HAIKU_4_5, 1_000_000, 0)
    const haikuOutput = calculateUSDCost(CLAUDE_MODELS.HAIKU_4_5, 0, 1_000_000)
    expect(haikuOutput / haikuInput).toBe(5)

    // For Opus: $5 input vs $25 output = 5x
    const opusInput = calculateUSDCost(CLAUDE_MODELS.OPUS_4_5, 1_000_000, 0)
    const opusOutput = calculateUSDCost(CLAUDE_MODELS.OPUS_4_5, 0, 1_000_000)
    expect(opusOutput / opusInput).toBe(5)

    // For Sonnet (standard tier): $3 input vs $15 output = 5x
    const sonnetInput = calculateUSDCost(CLAUDE_MODELS.SONNET_4_5, 1_000_000, 0)
    const sonnetOutput = calculateUSDCost(CLAUDE_MODELS.SONNET_4_5, 0, 1_000_000)
    expect(sonnetOutput / sonnetInput).toBe(5)
  })
})
