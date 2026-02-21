import * as Sentry from "@sentry/nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { verifySessionToken } from "@/features/auth/lib/jwt"
import { structuredErrorResponse } from "@/lib/api/responses"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { createPreviewToken } from "@/lib/auth/preview-token"
import { ErrorCodes } from "@/lib/error-codes"

/**
 * Preview Token Generation Endpoint
 *
 * Generates short-lived tokens for iframe preview authentication.
 * This bypasses third-party cookie blocking in modern browsers.
 *
 * Flow:
 * 1. Sandbox component fetches token from this endpoint (with session cookie)
 * 2. Token is appended to iframe src as query param
 * 3. Go preview-proxy validates the token from query param
 *
 * Security:
 * - Tokens are short-lived (5 minutes) to limit exposure
 * - Tokens are single-purpose (preview only)
 * - User must have valid session to generate token
 */

/**
 * POST /api/auth/preview-token
 *
 * Generates a short-lived preview token for iframe authentication.
 * Requires valid session cookie.
 */
export async function POST() {
  try {
    const jar = await cookies()
    const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

    if (!sessionCookie?.value) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const payload = await verifySessionToken(sessionCookie.value)
    if (!payload) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const previewToken = await createPreviewToken(payload.userId)

    return NextResponse.json({ ok: true, token: previewToken })
  } catch (error) {
    console.error("[preview-token] Error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
