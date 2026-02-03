import { env } from "@webalive/env/server"
import { SignJWT } from "jose"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { verifySessionToken } from "@/features/auth/lib/jwt"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
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
 * 3. preview-guard validates the token from query param
 *
 * Security:
 * - Tokens are short-lived (5 minutes) to limit exposure
 * - Tokens are single-purpose (preview only)
 * - User must have valid session to generate token
 */

const PREVIEW_TOKEN_SECRET = new TextEncoder().encode(env.JWT_SECRET || "INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION")

// Preview tokens expire in 5 minutes
const PREVIEW_TOKEN_EXPIRY = "5m"

export interface PreviewTokenPayload {
  type: "preview"
  userId: string
  iat: number
  exp: number
}

/**
 * Create a short-lived preview token
 */
export async function createPreviewToken(userId: string): Promise<string> {
  return await new SignJWT({ type: "preview", userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(PREVIEW_TOKEN_EXPIRY)
    .sign(PREVIEW_TOKEN_SECRET)
}

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
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    const payload = await verifySessionToken(sessionCookie.value)
    if (!payload) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    const previewToken = await createPreviewToken(payload.userId)

    return NextResponse.json({ ok: true, token: previewToken })
  } catch (error) {
    console.error("[preview-token] Error:", error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }
}
