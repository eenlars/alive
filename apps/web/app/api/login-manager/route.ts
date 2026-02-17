import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSessionToken, SESSION_SCOPES } from "@/features/auth/lib/jwt"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { COOKIE_NAMES, getSessionCookieOptions } from "@/lib/auth/cookies"
import { managerLoginRateLimiter } from "@/lib/auth/rate-limiter"
import { timingSafeCompare } from "@/lib/auth/timing-safe"
import { addCorsHeaders } from "@/lib/cors-utils"
import { env } from "@/lib/env"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

const ManagerLoginSchema = z.object({
  passcode: z.string().min(1).max(1000), // Max length to prevent DOS
})

/**
 * Get client identifier for rate limiting
 * Uses IP address or a fallback identifier
 */
function getClientIdentifier(req: NextRequest): string {
  // Try to get real IP from headers (considering proxies/CDN)
  const forwardedFor = req.headers.get("x-forwarded-for")
  const realIp = req.headers.get("x-real-ip")
  const ip = forwardedFor?.split(",")[0] || realIp || req.headers.get("host") || "unknown"

  return `manager-login:${ip}`
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")
  const host = req.headers.get("host") || undefined
  const clientId = getClientIdentifier(req)

  // Rate limiting check
  if (managerLoginRateLimiter.isRateLimited(clientId)) {
    const blockedTime = managerLoginRateLimiter.getBlockedTimeRemaining(clientId)
    const minutesRemaining = Math.ceil(blockedTime / 1000 / 60)

    console.warn(`[Manager Login] Rate limited: ${clientId}`)

    return createCorsErrorResponse(origin, ErrorCodes.TOO_MANY_REQUESTS, 429, {
      requestId,
      details: {
        retryAfter: `${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""}`,
      },
    })
  }

  // Parse and validate request body
  const body = await req.json().catch(error => {
    Sentry.captureException(error)
    return {}
  })
  const result = ManagerLoginSchema.safeParse(body)

  if (!result.success) {
    return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, {
      requestId,
      details: { issues: result.error.issues },
    })
  }

  const { passcode } = result.data

  // Local development mode - accept test passcode
  if (env.STREAM_ENV === "local" && passcode === "test") {
    console.log("[Manager Login] Test mode authentication")

    // Create JWT session token (same as regular users, but with manager role)
    const sessionToken = await createSessionToken({
      userId: "manager",
      email: "manager@system",
      name: "Manager",
      scopes: [SESSION_SCOPES.MANAGER_ACCESS],
      orgIds: [],
      orgRoles: {},
    })

    const res = createCorsSuccessResponse(origin, { requestId })
    res.cookies.set(COOKIE_NAMES.MANAGER_SESSION, sessionToken, getSessionCookieOptions(host))
    return res
  }

  // Verify passcode using timing-safe comparison
  const isValid = env.ALIVE_PASSCODE && timingSafeCompare(passcode, env.ALIVE_PASSCODE)

  if (!isValid) {
    console.warn(`[Manager Login] Invalid passcode attempt from ${clientId}`)

    // Record failed attempt for rate limiting
    managerLoginRateLimiter.recordFailedAttempt(clientId)

    return createCorsErrorResponse(origin, ErrorCodes.INVALID_CREDENTIALS, 401, { requestId })
  }

  console.log(`[Manager Login] Successfully authenticated: ${clientId}`)

  // Reset rate limiter on successful login
  managerLoginRateLimiter.reset(clientId)

  // Create JWT session token (same as regular users, but with manager role)
  const sessionToken = await createSessionToken({
    userId: "manager",
    email: "manager@system",
    name: "Manager",
    scopes: [SESSION_SCOPES.MANAGER_ACCESS],
    orgIds: [],
    orgRoles: {},
  })

  // Set manager session cookie with JWT token
  const res = createCorsSuccessResponse(origin, { requestId })
  res.cookies.set(COOKIE_NAMES.MANAGER_SESSION, sessionToken, getSessionCookieOptions(host))
  return res
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
