/**
 * POST /api/referrals/send-invite
 *
 * Sends a referral invitation email via Loops.so.
 * Rate limited to 10 emails per day per user.
 *
 * @see docs/features/referral-system.md (Workstream 8)
 *
 * DEPENDENCY: Workstream 5 (Database Schema)
 * This route requires the following from Workstream 5:
 * - Table: iam.email_invites (sender_id, email, sent_at)
 * - Column: iam.users.invite_code, iam.users.display_name
 *
 */

import * as Sentry from "@sentry/nextjs"
import { REFERRAL } from "@webalive/shared"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { sendReferralInvite } from "@/lib/email/send-referral-invite"
import { ErrorCodes } from "@/lib/error-codes"
import { buildInviteLink } from "@/lib/referral"
import { createIamClient } from "@/lib/supabase/iam"

export const runtime = "nodejs"

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

  const { email } = body as { email?: unknown }
  const emailResult = z.string().email().safeParse(email)
  if (!emailResult.success) {
    return createErrorResponse(ErrorCodes.VALIDATION_ERROR, 400, { field: "email" })
  }
  const validEmail = emailResult.data

  const iam = await createIamClient("service")

  // Check rate limit (emails sent in last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await iam
    .from("email_invites")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", userId)
    .gte("sent_at", oneDayAgo)

  if ((count ?? 0) >= REFERRAL.EMAIL_DAILY_LIMIT) {
    return createErrorResponse(ErrorCodes.TOO_MANY_REQUESTS, 429, {
      retryAfter: "24 hours",
    })
  }

  // Check if already sent to this email
  const { data: existing } = await iam
    .from("email_invites")
    .select("id")
    .eq("sender_id", userId)
    .eq("email", validEmail.toLowerCase())
    .single()

  if (existing) {
    return createErrorResponse(ErrorCodes.REFERRAL_ALREADY_INVITED, 400, { email: validEmail })
  }

  // Get sender info
  const { data: sender } = await iam.from("users").select("display_name, invite_code").eq("user_id", userId).single()

  if (!sender?.invite_code) {
    return createErrorResponse(ErrorCodes.VALIDATION_ERROR, 400, { field: "invite_code" })
  }

  // Send email
  // NOTE: No automatic retry - if Loops.so fails, the user sees an error and can retry manually.
  // The email_invites record is only created AFTER successful send, so failed sends can be retried.
  //
  // FUTURE IMPROVEMENT: Add to a queue (Inngest, QStash) for automatic retry with exponential backoff.
  // This would prevent silent loss if Loops.so has transient failures.
  try {
    await sendReferralInvite({
      to: validEmail,
      senderName: sender.display_name || "Someone",
      inviteLink: buildInviteLink(sender.invite_code),
    })
  } catch (error) {
    console.error("Failed to send invite email:", error)
    Sentry.captureException(error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }

  // Record sent email (only after successful send)
  await iam.from("email_invites").insert({
    sender_id: userId,
    email: validEmail.toLowerCase(),
  })

  return NextResponse.json({ ok: true })
}
