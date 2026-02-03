/**
 * Credits Service - Workspace Credit Balance Management
 *
 * ARCHITECTURE:
 * - Credits stored in Supabase iam.orgs.credits (PostgreSQL)
 * - Domains map to orgs via app.domains.org_id
 * - Flow: domain → org_id → credits
 *
 * TERMINOLOGY:
 * - CREDITS: Our currency (stored in Supabase, shown to users)
 * - LLM TOKENS: What Claude API returns (input_tokens, output_tokens)
 * - Conversion: 1 credit = 100 LLM tokens (used only at charge time)
 *
 * All operations are atomic and safe for concurrent access.
 */

// Re-export Supabase credit functions
export {
  calculateLLMTokenCost,
  chargeCreditsDirectly,
  chargeTokensFromCredits,
  ensureSufficientCredits,
  getAllOrganizationCredits,
  getOrgCredits,
  hasEnoughCredits,
  type LLMTokenUsage,
  updateOrgCredits,
  WORKSPACE_CREDIT_DISCOUNT,
} from "./credits/supabase-credits"

/**
 * Source of API key being used for request
 * - workspace: Using organization credits (charged to org)
 * - user_provided: Using user's own Claude API key (not charged)
 */
export type TokenSource = "workspace" | "user_provided"

// ============================================================================
// LEGACY: addCredits() function removed - use updateOrgCredits() from Supabase
// All JSON-based credit operations migrated to Supabase (2025-11-16)
// ============================================================================
