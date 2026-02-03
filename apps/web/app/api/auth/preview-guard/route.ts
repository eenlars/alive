import { env } from "@webalive/env/server"
import { jwtVerify } from "jose"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { verifySessionToken } from "@/features/auth/lib/jwt"
import { COOKIE_NAMES } from "@/lib/auth/cookies"

/**
 * Preview Guard - Authentication endpoint for Caddy forward_auth
 *
 * This endpoint is called by Caddy's forward_auth directive to verify
 * that requests to preview subdomains are authenticated.
 *
 * Authentication methods (checked in order):
 * 1. URL query parameter: ?preview_token=xxx (for iframe requests - bypasses 3rd party cookie blocking)
 * 2. Preview session cookie: preview_session (set after first token validation)
 * 3. Main session cookie (for direct browser requests)
 *
 * When a preview_token is validated, we set a short-lived preview_session cookie
 * so subsequent requests (JS assets, etc.) are also authenticated.
 *
 * Used in Caddyfile:
 *   forward_auth localhost:8998 {
 *     uri /api/auth/preview-guard?{query}
 *     copy_headers Cookie X-Preview-Set-Cookie
 *   }
 *
 * Returns:
 *   - 200: User is authenticated (has valid JWT session or preview token)
 *   - 401: User is not authenticated or token invalid/expired
 */

const PREVIEW_TOKEN_SECRET = new TextEncoder().encode(env.JWT_SECRET || "INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION")
const PREVIEW_SESSION_COOKIE = "preview_session"
const PREVIEW_SESSION_MAX_AGE = 5 * 60 // 5 minutes (matches preview token expiry)

/**
 * Verify a short-lived preview token and extract userId
 */
async function verifyPreviewToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, PREVIEW_TOKEN_SECRET, {
      algorithms: ["HS256"],
    })
    // Verify it's a preview token and return userId
    if (payload.type === "preview" && typeof payload.userId === "string") {
      return payload.userId
    }
    return null
  } catch {
    return null
  }
}

/**
 * Verify preview session cookie (simple signed value)
 */
async function verifyPreviewSession(value: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(value, PREVIEW_TOKEN_SECRET, {
      algorithms: ["HS256"],
    })
    return payload.type === "preview_session" && typeof payload.userId === "string"
  } catch {
    return false
  }
}

/**
 * Create a preview session cookie value (signed JWT)
 */
async function createPreviewSessionValue(userId: string): Promise<string> {
  const { SignJWT } = await import("jose")
  return new SignJWT({ type: "preview_session", userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PREVIEW_SESSION_MAX_AGE}s`)
    .sign(PREVIEW_TOKEN_SECRET)
}

export async function GET(request: NextRequest) {
  try {
    const jar = await cookies()

    // Method 1: Check for preview token in query param (for iframe requests)
    const previewToken = request.nextUrl.searchParams.get("preview_token")
    if (previewToken) {
      const userId = await verifyPreviewToken(previewToken)
      if (userId) {
        // Valid token - create session cookie for subsequent requests
        const sessionValue = await createPreviewSessionValue(userId)
        const response = new NextResponse("OK", { status: 200 })
        // Set cookie via header that Caddy will copy to the response
        // Using X-Preview-Set-Cookie header which Caddy will convert to Set-Cookie
        response.headers.set(
          "X-Preview-Set-Cookie",
          `${PREVIEW_SESSION_COOKIE}=${sessionValue}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${PREVIEW_SESSION_MAX_AGE}`,
        )
        return response
      }
      // Token invalid/expired - fall through to other checks
    }

    // Method 2: Check preview session cookie (set by previous token validation)
    const previewSessionCookie = jar.get(PREVIEW_SESSION_COOKIE)
    if (previewSessionCookie?.value) {
      const isValid = await verifyPreviewSession(previewSessionCookie.value)
      if (isValid) {
        return new NextResponse("OK", { status: 200 })
      }
    }

    // Method 3: Check main session cookie (for direct browser requests)
    const sessionCookie = jar.get(COOKIE_NAMES.SESSION)
    if (sessionCookie?.value) {
      const payload = await verifySessionToken(sessionCookie.value)
      if (payload) {
        return new NextResponse("OK", { status: 200 })
      }
    }

    return new NextResponse("Unauthorized", { status: 401 })
  } catch (error) {
    console.error("[preview-guard] Error:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

/**
 * Support HEAD requests (Caddy may use HEAD for auth checks)
 */
export async function HEAD(request: NextRequest) {
  return GET(request)
}
