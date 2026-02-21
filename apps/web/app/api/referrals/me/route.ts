/**
 * GET /api/referrals/me
 *
 * Returns the authenticated user's invite code and referral stats.
 * Generates invite code on first call using atomic RPC.
 *
 * @see docs/features/referral-system.md (Workstream 6)
 *
 * DEPENDENCY: Workstream 5 (Database Schema)
 * This route requires the following from Workstream 5:
 * - RPC: iam.get_or_create_invite_code(p_user_id, p_new_code)
 * - Table: iam.referrals (with referrer_id, status, credits_awarded columns)
 * - Column: iam.users.invite_code
 *
 */

import * as Sentry from "@sentry/nextjs"
import { generateInviteCode } from "@webalive/shared"
import { NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { buildInviteLink } from "@/lib/referral"
import { createIamClient } from "@/lib/supabase/iam"

// Node.js runtime required for crypto module (used by generateInviteCode)
export const runtime = "nodejs"

export async function GET() {
  // 1. Authenticate user
  const user = await getSessionUser()
  if (!user) {
    return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
  }
  const userId = user.id

  const iam = await createIamClient("service")

  // 2. Generate a candidate invite code (deterministic from userId)
  const candidateCode = generateInviteCode(userId)

  // 3. Use atomic RPC to get existing code or set this one
  // This is race-safe - the DB function handles concurrent requests
  // See Workstream 5 (SQL schema) for the RPC implementation
  const { data: inviteCode, error: rpcError } = await iam.rpc("get_or_create_invite_code", {
    p_user_id: userId,
    p_new_code: candidateCode,
  })

  if (rpcError) {
    console.error("[Referral] Failed to get/create invite code:", rpcError)
    Sentry.captureException(rpcError)
    return structuredErrorResponse(ErrorCodes.QUERY_FAILED, { status: 500 })
  }

  if (!inviteCode) {
    return structuredErrorResponse(ErrorCodes.USER_NOT_FOUND, { status: 404 })
  }

  // 4. Get referral stats - count of completed referrals
  // Table: iam.referrals (from Workstream 5)
  const { count: totalReferrals } = await iam
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_id", userId)
    .eq("status", "completed")

  // 5. Get total credits earned from referrals
  const { data: creditsData } = await iam
    .from("referrals")
    .select("credits_awarded")
    .eq("referrer_id", userId)
    .eq("status", "completed")

  const creditsEarned =
    creditsData?.reduce((sum: number, r: { credits_awarded: number }) => sum + (r.credits_awarded ?? 0), 0) ?? 0

  // 6. Return response
  return NextResponse.json({
    ok: true,
    data: {
      inviteCode: String(inviteCode),
      inviteLink: buildInviteLink(String(inviteCode)),
      stats: {
        totalReferrals: totalReferrals ?? 0,
        creditsEarned,
      },
    },
  })
}
