/**
 * Claude Model Pricing Configuration
 *
 * Prices per million tokens (MTok) in USD
 * Last updated: 2026-02-05
 *
 * Credit conversion: 1 USD = 10 credits
 *
 * Pricing source: Anthropic API pricing (excludes prompt caching)
 * - Opus 4.6: $5 input, $25 output per MTok
 * - Sonnet 4.5: $3/$6 input (≤200K/>200K), $15/$22.50 output per MTok
 * - Haiku 4.5: $1 input, $5 output per MTok
 */

import type { ClaudeModel } from "./claude-models"
import { CLAUDE_MODELS } from "./claude-models"

/**
 * Credit conversion rate
 * 1 USD = 10 credits, so 1 credit = $0.10 USD
 */
export const CREDITS_PER_USD = 10

/**
 * Pricing configuration for a model
 */
export interface ModelPricing {
  /** Input price per MTok in USD */
  inputPerMTok: number
  /** Output price per MTok in USD */
  outputPerMTok: number
  /** For tiered pricing: threshold in tokens (e.g., 200K for Sonnet) */
  tierThreshold?: number
  /** Input price per MTok when over threshold */
  inputPerMTokOverThreshold?: number
  /** Output price per MTok when over threshold */
  outputPerMTokOverThreshold?: number
}

/**
 * Model pricing configuration
 * All prices in USD per million tokens (MTok)
 */
export const MODEL_PRICING: Record<ClaudeModel, ModelPricing> = {
  [CLAUDE_MODELS.OPUS_4_6]: {
    inputPerMTok: 5,
    outputPerMTok: 25,
  },
  [CLAUDE_MODELS.SONNET_4_5]: {
    inputPerMTok: 3,
    outputPerMTok: 15,
    tierThreshold: 200_000,
    inputPerMTokOverThreshold: 6,
    outputPerMTokOverThreshold: 22.5,
  },
  [CLAUDE_MODELS.HAIKU_4_5]: {
    inputPerMTok: 1,
    outputPerMTok: 5,
  },
}

/**
 * Default pricing fallback (uses Haiku as cheapest option)
 */
const DEFAULT_PRICING = MODEL_PRICING[CLAUDE_MODELS.HAIKU_4_5]

/**
 * Calculate actual USD cost for token usage
 *
 * @param model - The Claude model used
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param totalPromptTokens - Cumulative prompt tokens for tier calculation (Sonnet only)
 * @returns Cost in USD
 */
export function calculateUSDCost(
  model: ClaudeModel,
  inputTokens: number,
  outputTokens: number,
  totalPromptTokens?: number,
): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) {
    console.warn(`[Model Pricing] Unknown model: ${model}, using Haiku pricing as fallback`)
    return calculateUSDCostWithPricing(DEFAULT_PRICING, inputTokens, outputTokens)
  }

  return calculateUSDCostWithPricing(pricing, inputTokens, outputTokens, totalPromptTokens)
}

/**
 * Internal helper to calculate USD cost with specific pricing
 */
function calculateUSDCostWithPricing(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
  totalPromptTokens?: number,
): number {
  // Check if we're in the higher tier (Sonnet-specific)
  const isOverThreshold =
    pricing.tierThreshold !== undefined && totalPromptTokens !== undefined && totalPromptTokens > pricing.tierThreshold

  const inputPricePerMTok = isOverThreshold
    ? (pricing.inputPerMTokOverThreshold ?? pricing.inputPerMTok)
    : pricing.inputPerMTok

  const outputPricePerMTok = isOverThreshold
    ? (pricing.outputPerMTokOverThreshold ?? pricing.outputPerMTok)
    : pricing.outputPerMTok

  // Convert to actual cost: tokens * (price per MTok / 1_000_000)
  const inputCost = inputTokens * (inputPricePerMTok / 1_000_000)
  const outputCost = outputTokens * (outputPricePerMTok / 1_000_000)

  return inputCost + outputCost
}

/**
 * Convert USD cost to credits
 *
 * 1 USD = 10 credits
 *
 * @param usdCost - Cost in USD
 * @returns Credits to charge (rounded to 2 decimal places)
 */
export function usdToCredits(usdCost: number): number {
  return Math.round(usdCost * CREDITS_PER_USD * 100) / 100
}

/**
 * Convert credits to USD
 *
 * @param credits - Number of credits
 * @returns USD value
 */
export function creditsToUSD(credits: number): number {
  return credits / CREDITS_PER_USD
}

/**
 * Calculate credits to charge for token usage
 *
 * Convenience function that combines calculateUSDCost and usdToCredits
 *
 * @param model - The Claude model used
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param totalPromptTokens - Cumulative prompt tokens for tier calculation (Sonnet only)
 * @returns Credits to charge
 */
export function calculateCreditsToCharge(
  model: ClaudeModel,
  inputTokens: number,
  outputTokens: number,
  totalPromptTokens?: number,
): number {
  const usdCost = calculateUSDCost(model, inputTokens, outputTokens, totalPromptTokens)
  return usdToCredits(usdCost)
}

/**
 * Get pricing info for a model (for display purposes)
 */
export function getModelPricingInfo(model: ClaudeModel): ModelPricing | null {
  return MODEL_PRICING[model] ?? null
}
