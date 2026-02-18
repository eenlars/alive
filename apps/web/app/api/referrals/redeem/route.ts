/**
 * POST /api/referrals/redeem
 *
 * Redeems a referral code after signup. Creates referral record and awards credits.
 *
 * @see docs/features/referral-system.md (Workstream 7)
 *
 * DEPENDENCY: Workstream 5 (Database Schema)
 * This route requires the following from Workstream 5:
 * - Table: iam.referrals (with referrer_id, referred_id, status, credits_awarded, completed_at)
 * - Column: iam.users.invite_code
 * - Column: iam.users.email_verified
 *
 */

import * as Sentry from "@sentry/nextjs"
import { REFERRAL } from "@webalive/shared"
import { NextResponse } from "next/server"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { awardReferralCredits } from "@/lib/credits/add-credits"
import { ErrorCodes } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"

export const runtime = "nodejs"

// Standardized error response - all validation failures return this
// Must be a function to create a fresh Response each time (Response bodies can only be read once)
function invalidCodeResponse() {
  return createErrorResponse(ErrorCodes.REFERRAL_INVALID_CODE, 400)
}

// Check if error is a unique constraint violation (PostgreSQL error code 23505)
// This handles race conditions where two requests pass the "already referred" check
function isUniqueConstraintError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "23505" || !!error.message?.includes("duplicate") || !!error.message?.includes("unique")
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }
  const userId = user.id

  // Parse JSON with robust error handling (handles throws AND null returns)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return createErrorResponse(ErrorCodes.INVALID_JSON, 400)
  }

  const { code } = body as { code?: unknown }
  if (!code || typeof code !== "string") {
    return invalidCodeResponse()
  }

  const iam = await createIamClient("service")

  // 1. Check user is new (created within last 24h) - prevents existing user exploit
  const { data: currentUser } = await iam
    .from("users")
    .select("created_at, email_verified")
    .eq("user_id", userId)
    .single()

  if (!currentUser) {
    return invalidCodeResponse()
  }

  const userAge = Date.now() - new Date(currentUser.created_at).getTime()
  if (userAge > REFERRAL.ACCOUNT_AGE_LIMIT_MS) {
    // User account too old - silently reject (don't reveal why)
    return invalidCodeResponse()
  }

  // 2. Check if user already referred
  const { data: existingReferral } = await iam
    .from("referrals")
    .select("referral_id")
    .eq("referred_id", userId)
    .single()

  if (existingReferral) {
    return invalidCodeResponse()
  }

  // 3. Find referrer by code
  const { data: referrer } = await iam
    .from("users")
    .select("user_id, email_verified")
    .eq("invite_code", code.toUpperCase())
    .single()

  if (!referrer) {
    return invalidCodeResponse()
  }

  // 4. Prevent self-referral
  if (referrer.user_id === userId) {
    return invalidCodeResponse()
  }

  // 5. Check referred user has verified email (anti-fraud)
  if (!currentUser.email_verified) {
    // Create pending referral, will complete after verification
    const { error: pendingInsertError } = await iam.from("referrals").insert({
      referrer_id: referrer.user_id,
      referred_id: userId,
      status: "pending",
      credits_awarded: REFERRAL.CREDITS,
    })

    // Race condition: another request already created referral - return generic error
    if (isUniqueConstraintError(pendingInsertError)) {
      return invalidCodeResponse()
    }

    if (pendingInsertError) {
      console.error("Failed to create pending referral:", pendingInsertError)
      Sentry.captureException(pendingInsertError)
      return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
    }

    return NextResponse.json({
      ok: true,
      status: "pending",
      message: "Verify your email to complete referral",
    })
  }

  // 6. Create completed referral
  const { error: insertError } = await iam.from("referrals").insert({
    referrer_id: referrer.user_id,
    referred_id: userId,
    status: "completed",
    credits_awarded: REFERRAL.CREDITS,
    completed_at: new Date().toISOString(),
  })

  // Race condition: another request already created referral - return generic error
  if (isUniqueConstraintError(insertError)) {
    return invalidCodeResponse()
  }

  if (insertError) {
    console.error("Failed to create referral:", insertError)
    Sentry.captureException(insertError)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }

  // 7. Award credits to both parties using shared function
  const { referrerResult, referredResult } = await awardReferralCredits(referrer.user_id, userId, REFERRAL.CREDITS)

  // Log any credit award failures for manual reconciliation
  if (!referrerResult.success || !referredResult.success) {
    console.warn("[Referral] Partial credit award:", { referrerResult, referredResult })
  }

  return NextResponse.json({
    ok: true,
    data: { status: "completed", creditsAwarded: REFERRAL.CREDITS },
  })
}
