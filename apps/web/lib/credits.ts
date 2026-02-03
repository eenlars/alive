/**
 * Credit System - Currency Conversion Utilities
 *
 * ARCHITECTURE:
 * - Credits are stored in Supabase (iam.orgs.credits) - primary currency
 * - LLM tokens are from Claude API responses
 * - Conversion only happens when charging (in chargeTokensFromCredits)
 *
 * TERMINOLOGY:
 * - CREDITS: Our primary currency (stored and displayed)
 * - LLM TOKENS: What Claude API uses (input_tokens, output_tokens)
 *
 * Conversion Ratio: 100 LLM tokens = 1 credit
 *
 * Example:
 * - User has 200 credits in Supabase
 * - Claude API uses 500 LLM tokens
 * - Convert: 500 tokens ÷ 100 = 5 credits
 * - Charge with discount: 5 × 0.25 = 1.25 credits
 * - New balance: 200 - 1.25 = 198.75 credits
 */

export const LLM_TOKENS_PER_CREDIT = 100

/**
 * Convert LLM tokens to user-facing credits
 * @param llmTokens - Number of LLM tokens
 * @returns Credits (rounded to 2 decimals) for UI display
 */
export function llmTokensToCredits(llmTokens: number): number {
  return Math.round((llmTokens / LLM_TOKENS_PER_CREDIT) * 100) / 100
}

/**
 * Convert user-facing credits to LLM tokens
 * @param credits - Number of credits
 * @returns LLM tokens
 */
export function creditsToLLMTokens(credits: number): number {
  return Math.round(credits * LLM_TOKENS_PER_CREDIT)
}
