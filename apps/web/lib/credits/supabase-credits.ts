/**
 * Supabase Credit System - Organization-based credit management
 *
 * ARCHITECTURE:
 * - Credits are stored in iam.orgs.credits (PostgreSQL)
 * - Domains map to orgs via app.domains.org_id
 * - Flow: domain → org_id (via domains table) → credits (via orgs table)
 *
 * TERMINOLOGY:
 * - CREDITS: Our currency (stored in DB, shown to users)
 * - LLM TOKENS: What Claude API returns (input_tokens, output_tokens)
 * - Conversion: 1 credit = 100 LLM tokens (used only at charge time)
 */

import * as Sentry from "@sentry/nextjs"
import { llmTokensToCredits } from "@/lib/credits"
import { createServiceAppClient, createServiceIamClient } from "@/lib/supabase/service"

// Always use direct service role clients (no cookies needed for service operations)
// This allows the credit system to work in both request contexts (API routes)
// and non-request contexts (automation executor, background jobs)

function getIamClient() {
  return createServiceIamClient()
}

function getAppClient() {
  return createServiceAppClient()
}

/**
 * Update organization credits in database
 * DRY refactor: Consolidates duplicate update logic from chargeTokensFromCredits/updateOrgCredits
 *
 * @param orgId - Organization ID
 * @param newCredits - New credit balance to set
 * @returns true if successful, false otherwise
 */
async function updateCreditsInDatabase(orgId: string, newCredits: number): Promise<boolean> {
  const iam = getIamClient()
  const { error } = await iam
    .from("orgs")
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)

  if (error) {
    console.error("[Supabase Credits] Failed to update credits:", error)
    Sentry.captureException(error)
    return false
  }

  return true
}

/**
 * Workspace credit discount multiplier (0.0 to 1.0)
 * Determines what percentage of actual LLM tokens users are charged in credits
 */
export const WORKSPACE_CREDIT_DISCOUNT = 0.25

/**
 * LLM Token Usage data from Claude API response
 * These are the actual tokens consumed by the Claude API
 */
export interface LLMTokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

/**
 * Calculate LLM token cost from Claude API usage object
 *
 * Returns total LLM tokens consumed.
 * Cost = input_tokens + output_tokens
 * (Cache tokens are not counted as they're usually cheaper/free)
 *
 * @param usage - LLM usage object from Claude API response
 * @returns Total LLM tokens consumed
 */
export function calculateLLMTokenCost(usage: LLMTokenUsage): number {
  return usage.input_tokens + usage.output_tokens
}

/**
 * In-memory cache for domain → org_id mapping with TTL
 * Reduces database queries from 2 to 1 for repeat requests
 */
interface CacheEntry {
  orgId: string
  expiresAt: number
}

const domainOrgCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Get org ID for a domain with caching
 * Cache entries expire after 5 minutes to ensure fresh data
 *
 * @param domain - Domain identifier
 * @returns Org ID or null if domain not found
 */
async function getOrgIdForDomain(domain: string): Promise<string | null> {
  // Check cache first
  const cached = domainOrgCache.get(domain)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.orgId
  }

  // Cache miss or expired - query database
  const app = getAppClient()
  const { data, error } = await app.from("domains").select("org_id").eq("hostname", domain).single()

  if (error || !data || !data.org_id) {
    console.error(`[Supabase Credits] Domain not found: ${domain}`, error)
    Sentry.captureException(error ?? new Error(`[Supabase Credits] Domain lookup failed for: ${domain}`))
    // Remove from cache if domain no longer exists
    domainOrgCache.delete(domain)
    return null
  }

  // Cache the result with TTL
  domainOrgCache.set(domain, {
    orgId: data.org_id,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return data.org_id
}

/**
 * Get organization's credit balance via domain lookup
 *
 * @param domain - Domain identifier (e.g., "demo.sonno.tech")
 * @returns Current credit balance, or null if domain/org not found
 */
export async function getOrgCredits(domain: string): Promise<number | null> {
  // Step 1: Get org ID from domain
  const orgId = await getOrgIdForDomain(domain)
  if (!orgId) {
    return null
  }

  // Step 2: Get credits from org
  const iam = getIamClient()
  const { data, error } = await iam.from("orgs").select("credits").eq("org_id", orgId).single()

  if (error || !data) {
    console.error(`[Supabase Credits] Org not found: ${orgId}`, error)
    Sentry.captureException(error ?? new Error(`[Supabase Credits] Org not found: ${orgId}`))
    return null
  }

  return data.credits ?? 0
}

/**
 * Check if domain has enough credits for a request
 *
 * @param domain - Domain identifier
 * @param requiredCredits - Number of credits required
 * @returns true if enough credits, false otherwise
 */
export async function hasEnoughCredits(domain: string, requiredCredits: number): Promise<boolean> {
  const current = await getOrgCredits(domain)

  if (current === null) {
    return false
  }

  return current >= requiredCredits
}

/**
 * Charge credits to organization balance based on LLM tokens used
 *
 * This is the ONLY place where LLM tokens are converted to credits.
 * All other operations work with credits directly.
 *
 * ATOMIC OPERATION: Uses Supabase RPC to perform atomic deduction.
 * Prevents race conditions and negative balances.
 *
 * @param domain - Domain identifier
 * @param llmTokensUsed - Number of LLM tokens actually used by Claude API
 * @returns New credit balance, or null if operation failed (insufficient credits or error)
 */
export async function chargeTokensFromCredits(domain: string, llmTokensUsed: number): Promise<number | null> {
  if (llmTokensUsed < 0) {
    console.error("[Supabase Credits] Cannot charge negative amount:", llmTokensUsed)
    return null
  }

  // Step 1: Get org ID from domain
  const orgId = await getOrgIdForDomain(domain)
  if (!orgId) {
    console.error("[Supabase Credits] Domain not found:", domain)
    return null
  }

  // Step 2: Calculate charge amount
  const creditsUsed = llmTokensToCredits(llmTokensUsed)
  const chargedCredits = Math.floor(creditsUsed * WORKSPACE_CREDIT_DISCOUNT * 100) / 100

  // Step 3: Atomic deduction using Supabase RPC
  // This prevents race conditions by performing the check and update atomically in the database
  const iam = getIamClient()
  const { data, error } = await iam.rpc("deduct_credits", {
    p_org_id: orgId,
    p_amount: chargedCredits,
  })

  if (error) {
    console.error("[Supabase Credits] Failed to deduct credits:", {
      domain,
      orgId,
      chargedCredits,
      error: error.message,
    })
    Sentry.captureException(error)
    return null
  }

  // data will be null if insufficient credits (WHERE clause failed)
  if (data === null) {
    console.error("[Supabase Credits] Insufficient balance:", {
      domain,
      orgId,
      requested: chargedCredits,
      actualTokensUsed: llmTokensUsed,
    })
    return null
  }

  // Supabase RPC returns numeric values as unknown, verify it's a number
  if (typeof data !== "number") {
    console.error("[Supabase Credits] Unexpected return type from deduct_credits:", typeof data)
    return null
  }

  const newBalance = data

  console.log("[Supabase Credits] Charged credits:", {
    domain,
    orgId,
    actualTokensUsed: llmTokensUsed,
    creditsUsed,
    chargedCredits,
    discountSaved: creditsUsed - chargedCredits,
    newBalance,
  })

  return newBalance
}

/**
 * Charge credits directly to organization balance (model-based pricing)
 *
 * Use this function when credits have already been calculated based on
 * model-specific pricing (via calculateCreditsToCharge from model-pricing.ts).
 *
 * NO DISCOUNT APPLIED - credits charged exactly as provided.
 *
 * ATOMIC OPERATION: Uses Supabase RPC to perform atomic deduction.
 * Prevents race conditions and negative balances.
 *
 * @param domain - Domain identifier
 * @param creditsToCharge - Credits to deduct (already calculated from USD cost)
 * @returns New credit balance, or null if operation failed (insufficient credits or error)
 */
export async function chargeCreditsDirectly(domain: string, creditsToCharge: number): Promise<number | null> {
  if (creditsToCharge < 0) {
    console.error("[Supabase Credits] Cannot charge negative amount:", creditsToCharge)
    return null
  }

  if (creditsToCharge === 0) {
    // No charge needed, just return current balance
    return await getOrgCredits(domain)
  }

  // Step 1: Get org ID from domain
  const orgId = await getOrgIdForDomain(domain)
  if (!orgId) {
    console.error("[Supabase Credits] Domain not found:", domain)
    return null
  }

  // Step 2: Atomic deduction using Supabase RPC
  // This prevents race conditions by performing the check and update atomically in the database
  const iam = getIamClient()
  const { data, error } = await iam.rpc("deduct_credits", {
    p_org_id: orgId,
    p_amount: creditsToCharge,
  })

  if (error) {
    console.error("[Supabase Credits] Failed to deduct credits:", {
      domain,
      orgId,
      creditsToCharge,
      error: error.message,
    })
    Sentry.captureException(error)
    return null
  }

  // data will be null if insufficient credits (WHERE clause failed)
  if (data === null) {
    console.error("[Supabase Credits] Insufficient balance:", {
      domain,
      orgId,
      requested: creditsToCharge,
    })
    return null
  }

  // Supabase RPC returns numeric values as unknown, verify it's a number
  if (typeof data !== "number") {
    console.error("[Supabase Credits] Unexpected return type from deduct_credits:", typeof data)
    return null
  }

  const newBalance = data

  console.log("[Supabase Credits] Charged credits (model-based):", {
    domain,
    orgId,
    creditsCharged: creditsToCharge,
    newBalance,
  })

  return newBalance
}

/**
 * Verify domain has credits available for API call
 *
 * @param domain - Domain identifier
 * @throws Error if workspace not found or insufficient balance
 */
export async function ensureSufficientCredits(domain: string): Promise<void> {
  const balance = await getOrgCredits(domain)

  if (balance === null) {
    throw new Error("Domain not found")
  }

  if (balance <= 0) {
    throw new Error(`Insufficient credits (balance: ${balance}, needs: >= 1)`)
  }
}

/**
 * Update organization credits directly (admin operation)
 *
 * @param domain - Domain identifier
 * @param newCredits - New credit balance to set
 * @returns true if successful, false otherwise
 */
export async function updateOrgCredits(domain: string, newCredits: number): Promise<boolean> {
  try {
    const orgId = await getOrgIdForDomain(domain)
    if (!orgId) {
      console.error("[Supabase Credits] Domain not found:", domain)
      return false
    }

    const success = await updateCreditsInDatabase(orgId, newCredits)
    if (success) {
      console.log(`[Supabase Credits] Updated org ${orgId} credits to ${newCredits}`)
    }
    return success
  } catch (error) {
    console.error("[Supabase Credits] Error updating credits:", error)
    Sentry.captureException(error)
    return false
  }
}

/**
 * Get all organizations with their domains and credits (admin operation)
 *
 * @returns Map of domain → credits
 */
export async function getAllOrganizationCredits(): Promise<Map<string, number>> {
  const creditsMap = new Map<string, number>()

  try {
    const app = getAppClient()
    const iam = getIamClient()

    // Get all domains with their org IDs
    const { data: domains, error: domainsError } = await app.from("domains").select("hostname, org_id")

    if (domainsError || !domains) {
      console.error("[Supabase Credits] Failed to fetch domains:", domainsError)
      return creditsMap
    }

    // Get all orgs with their credits
    const { data: orgs, error: orgsError } = await iam.from("orgs").select("org_id, credits")

    if (orgsError || !orgs) {
      console.error("[Supabase Credits] Failed to fetch orgs:", orgsError)
      return creditsMap
    }

    // Create org_id → credits map
    const orgCreditsMap = new Map<string, number>(
      orgs.map((org: { org_id: string; credits: number | null }) => [org.org_id, org.credits ?? 0]),
    )

    // Map domains to credits
    for (const domain of domains) {
      if (domain.org_id) {
        const credits = orgCreditsMap.get(domain.org_id) ?? 0
        creditsMap.set(domain.hostname, credits)
      }
    }

    return creditsMap
  } catch (error) {
    console.error("[Supabase Credits] Error fetching organization credits:", error)
    Sentry.captureException(error)
    return creditsMap
  }
}
