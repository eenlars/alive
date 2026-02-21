/**
 * POST /api/referrals/complete-pending
 *
 * Webhook endpoint to complete pending referrals after email verification.
 * Called by auth provider webhook or internal system - NOT user-facing.
 *
 * Authentication: INTERNAL_WEBHOOK_SECRET in request body
 *
 * @see docs/features/referral-system.md (Workstream 11)
 *
 * DEPENDENCY: Workstream 5 (Database Schema)
 * This route requires the following from Workstream 5:
 * - Table: iam.referrals (with referral_id, referrer_id, referred_id, credits_awarded, status columns)
 *
 */

import * as Sentry from "@sentry/nextjs"
import { createDedupeCache } from "@webalive/shared"
import { NextResponse } from "next/server"
import { structuredErrorResponse } from "@/lib/api/responses"
import { awardReferralCredits } from "@/lib/credits/add-credits"
import { ErrorCodes } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"

export const runtime = "nodejs"

// Dedupe cache: prevent duplicate credit awards from webhook retries
// TTL of 1 minute - enough to handle retries, short enough to allow legitimate retries
export const referralDedupeCache = createDedupeCache({ ttlMs: 60 * 1000, maxSize: 1000 })

export async function POST(req: Request) {
  // Parse JSON with robust error handling (handles throws AND null returns)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return structuredErrorResponse(ErrorCodes.INVALID_JSON, { status: 400 })
  }

  const { userId, secret } = body as { userId?: unknown; secret?: unknown }

  // Verify internal secret (webhook auth)
  if (secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
    return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
  }

  if (!userId || typeof userId !== "string") {
    return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, { status: 400, details: { field: "userId" } })
  }

  // Dedupe: prevent duplicate processing of the same userId
  if (referralDedupeCache.check(userId)) {
    console.log(`[Referral] Ignoring duplicate complete-pending request for user ${userId}`)
    return NextResponse.json({
      ok: true,
      deduplicated: true,
      message: "Request already being processed",
    })
  }

  const iam = await createIamClient("service")

  // Find pending referral for this user
  const { data: pendingReferral } = await iam
    .from("referrals")
    .select("referral_id, referrer_id, referred_id, credits_awarded")
    .eq("referred_id", userId)
    .eq("status", "pending")
    .single()

  if (!pendingReferral) {
    // 200 with ok: false - no pending referral is not an error
    return structuredErrorResponse(ErrorCodes.REFERRAL_NOT_FOUND, { status: 200 })
  }

  // IMPORTANT: Award credits FIRST, then mark completed
  // This prevents marking referral as "completed" when credits failed
  const { referrerResult, referredResult } = await awardReferralCredits(
    pendingReferral.referrer_id,
    userId,
    pendingReferral.credits_awarded,
  )

  // Log any credit award failures for manual reconciliation
  if (!referrerResult.success || !referredResult.success) {
    console.warn("[Referral] Partial credit award on complete-pending:", {
      referralId: pendingReferral.referral_id,
      referrerResult,
      referredResult,
    })
  }

  // Only mark as completed if at least one credit award succeeded
  // If both failed, keep pending for retry
  if (!referrerResult.success && !referredResult.success) {
    console.error("[Referral] Both credit awards failed - keeping referral pending:", {
      referralId: pendingReferral.referral_id,
    })
    Sentry.captureMessage(
      `[Referral] Both credit awards failed - referral ${pendingReferral.referral_id} kept pending`,
      "error",
    )
    return structuredErrorResponse(ErrorCodes.REFERRAL_CREDIT_FAILED, { status: 500 })
  }

  // Update to completed (at least one credit was awarded)
  const { error: updateError } = await iam
    .from("referrals")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("referral_id", pendingReferral.referral_id)

  if (updateError) {
    // Credits were awarded but status update failed - log for manual fix
    console.error("[Referral] Credits awarded but status update failed:", {
      referralId: pendingReferral.referral_id,
      updateError,
      referrerResult,
      referredResult,
    })
    Sentry.captureException(updateError)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    data: {
      referralId: pendingReferral.referral_id,
      creditsAwarded: pendingReferral.credits_awarded,
    },
  })
}
