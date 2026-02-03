/**
 * Credit Awarding Functions for Referral System
 *
 * Awards credits to users' primary organizations using atomic RPC operations.
 * Mirrors the deduct_credits pattern from docs/architecture/atomic-credit-charging.md.
 *
 * @see docs/features/referral-system.md
 *
 * DEPENDENCY: Workstream 5 (Database Schema)
 * This module requires the following from Workstream 5:
 * - RPC: iam.add_credits(p_org_id, p_amount)
 *
 */

import { REFERRAL } from "@webalive/shared"
import { createIamClient } from "@/lib/supabase/iam"

export interface AwardCreditsResult {
  success: boolean
  orgId?: string
  newBalance?: number
  error?: string
}

/**
 * Awards credits to a user's primary org using the atomic add_credits RPC.
 *
 * Each RPC call is atomic at the row level - the UPDATE + balance return happens
 * in a single database operation with row-level locking.
 *
 * @param userId - The user ID to award credits to
 * @param amount - The number of credits to award
 * @returns Result object with success status and new balance
 */
export async function awardCreditsToUserPrimaryOrg(userId: string, amount: number): Promise<AwardCreditsResult> {
  const iam = await createIamClient("service")

  // Find user's primary org (first org membership by creation date)
  const { data: membership } = await iam
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single()

  if (!membership) {
    console.warn(`[Referral] User ${userId} has no org - credits not awarded`)
    return { success: false, error: "no_org" }
  }

  // Atomic credit addition via RPC
  const { data: newBalance, error } = await iam.rpc("add_credits", {
    p_org_id: membership.org_id,
    p_amount: amount,
  })

  if (error) {
    console.error(`[Referral] Failed to add credits to org ${membership.org_id}:`, error)
    return { success: false, error: "credit_failed" }
  }

  console.log(`[Referral] Awarded ${amount} credits to org ${membership.org_id}, new balance: ${newBalance}`)
  return { success: true, orgId: membership.org_id, newBalance: newBalance as number }
}

/**
 * Awards credits to both referrer and referred user's primary orgs.
 *
 * ATOMICITY NOTE:
 * - Each individual add_credits RPC call IS atomic (row-level locking in PostgreSQL)
 * - The two calls together are NOT wrapped in a transaction
 *
 * This is acceptable for MVP because:
 * 1. add_credits uses UPDATE...RETURNING - atomic at the row level
 * 2. Credit additions don't have the negative-balance risk that deductions have
 * 3. If one fails, the referral record shows expected amount for manual reconciliation
 * 4. Failures are logged with full context for support tickets
 *
 * @param referrerId - User ID of the referrer
 * @param referredId - User ID of the referred user
 * @param amount - Credits to award (defaults to REFERRAL.CREDITS)
 * @returns Results for both referrer and referred credit awards
 */
export async function awardReferralCredits(
  referrerId: string,
  referredId: string,
  amount: number = REFERRAL.CREDITS,
): Promise<{ referrerResult: AwardCreditsResult; referredResult: AwardCreditsResult }> {
  const [referrerResult, referredResult] = await Promise.all([
    awardCreditsToUserPrimaryOrg(referrerId, amount),
    awardCreditsToUserPrimaryOrg(referredId, amount),
  ])

  // Log summary for debugging partial failures
  if (!referrerResult.success || !referredResult.success) {
    console.error("[Referral] Partial credit award:", {
      referrer: { userId: referrerId, ...referrerResult },
      referred: { userId: referredId, ...referredResult },
      amount,
    })
  }

  return { referrerResult, referredResult }
}
