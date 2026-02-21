import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createCorsResponse } from "@/lib/api/responses"
import { getClientIdentifier } from "@/lib/auth/client-identifier"
import { emailCheckRateLimiter } from "@/lib/auth/rate-limiter"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes, getErrorMessage } from "@/lib/error-codes"
import { getRequestId } from "@/lib/request-id"
import { createIamClient } from "@/lib/supabase/iam"

const CheckEmailSchema = z.object({
  email: z.string().email("Invalid email format"),
})

export type CheckEmailResponse = {
  ok: boolean
  exists: boolean
  email: string
  requestId: string
}

/**
 * POST /api/auth/check-email
 *
 * Check if an email address already has an account.
 * Used by the AuthModal to determine login vs signup flow.
 *
 * @returns { ok: true, exists: boolean, email: string }
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)
  const origin = req.headers.get("origin")

  // Rate limiting to prevent email enumeration attacks
  const clientId = getClientIdentifier(req, "check-email")
  if (emailCheckRateLimiter.isRateLimited(clientId)) {
    const blockedTime = emailCheckRateLimiter.getBlockedTimeRemaining(clientId)
    const minutesRemaining = Math.ceil(blockedTime / 1000 / 60)
    console.warn(`[CheckEmail] Rate limited: ${clientId}`)
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.TOO_MANY_REQUESTS,
        message: `Too many requests. Please try again in ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}.`,
        requestId,
      },
      429,
    )
  }
  emailCheckRateLimiter.recordFailedAttempt(clientId)

  let body: unknown
  try {
    body = await req.json()
  } catch (_err) {
    // Expected: malformed JSON body
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.INVALID_JSON,
        message: getErrorMessage(ErrorCodes.INVALID_JSON),
        requestId,
      },
      400,
    )
  }

  const result = CheckEmailSchema.safeParse(body)
  if (!result.success) {
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.INVALID_REQUEST,
        message: result.error.issues[0]?.message || "Invalid email",
        requestId,
      },
      400,
    )
  }

  const { email } = result.data

  try {
    const iam = await createIamClient("service")
    const { data: user, error } = await iam.from("users").select("user_id").eq("email", email.toLowerCase()).single()

    // PGRST116 = no rows found (not an error, just means email doesn't exist)
    const exists = !error && !!user

    const response: CheckEmailResponse = {
      ok: true,
      exists,
      email: email.toLowerCase(),
      requestId,
    }

    return createCorsResponse(origin, response, 200)
  } catch (error) {
    console.error("[CheckEmail] Database error:", error)
    Sentry.captureException(error)
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to check email. Please try again.",
        requestId,
      },
      500,
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
