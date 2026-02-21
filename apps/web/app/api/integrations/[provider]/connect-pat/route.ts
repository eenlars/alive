/**
 * PAT (Personal Access Token) Connection API
 *
 * Allows users to connect to providers that support PAT tokens
 * (like GitHub) by directly providing their token.
 *
 * POST /api/integrations/[provider]/connect-pat
 * Body: { token: string }
 *
 * @error-check-disable - Internal validation functions return error strings,
 * not API responses. These are converted to proper ErrorCodes at the API boundary.
 */

import * as Sentry from "@sentry/nextjs"
import { getOAuthKeyForProvider, providerSupportsPat } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { getClientIdentifier } from "@/lib/auth/client-identifier"
import { oauthOperationRateLimiter } from "@/lib/auth/rate-limiter"
import { ErrorCodes } from "@/lib/error-codes"
import { validateProviderName } from "@/lib/integrations/validation"
import { canUserAccessIntegration } from "@/lib/integrations/visibility"
import { getOAuthInstance } from "@/lib/oauth/oauth-instances"

/**
 * Validate GitHub PAT token by making a test API call
 */
async function validateGitHubPat(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, error: "Invalid or expired token" }
      }
      if (response.status === 403) {
        return { valid: false, error: "Token lacks required permissions" }
      }
      return { valid: false, error: `GitHub API error: ${response.status}` }
    }

    const userData = await response.json()
    return { valid: true, username: userData.login }
  } catch (error) {
    console.error("[GitHub PAT] Validation failed:", error)
    Sentry.captureException(error)
    return { valid: false, error: "Failed to validate token with GitHub" }
  }
}

/**
 * POST /api/integrations/[provider]/connect-pat
 *
 * Connect using a Personal Access Token.
 *
 * Request body:
 * - token: string - The PAT to store
 *
 * Response:
 * - 200: { ok: true, message: string }
 * - 400: Invalid provider, provider doesn't support PAT, or invalid token
 * - 401: Unauthorized
 * - 403: No permission to use integration
 * - 429: Rate limited
 * - 500: Internal error
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  try {
    // 1. Validate provider
    const resolved = await params
    const validation = validateProviderName(resolved.provider)

    if (!validation.valid) {
      return createErrorResponse(ErrorCodes.INVALID_PROVIDER, 400, {
        reason: validation.error,
      })
    }

    const provider = validation.provider!

    // 2. Check if provider supports PAT
    if (!providerSupportsPat(provider)) {
      return createErrorResponse(ErrorCodes.INVALID_PROVIDER, 400, {
        reason: `${provider} does not support Personal Access Token authentication`,
      })
    }

    // 3. Authenticate user
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    // 4. Check rate limit
    const clientId = getClientIdentifier(req, `integration:${provider}:pat`)
    if (oauthOperationRateLimiter.isRateLimited(clientId)) {
      const blockedTime = oauthOperationRateLimiter.getBlockedTimeRemaining(clientId)
      const minutesRemaining = Math.ceil(blockedTime / 1000 / 60)

      console.warn(`[${provider} PAT] Rate limited:`, clientId)

      return createErrorResponse(ErrorCodes.TOO_MANY_REQUESTS, 429, {
        retryAfter: `${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""}`,
      })
    }

    // 5. Check user has permission to use this integration
    const hasAccess = await canUserAccessIntegration(user.id, provider)
    if (!hasAccess) {
      console.error(`[${provider} PAT] User ${user.id} denied access`)
      oauthOperationRateLimiter.recordFailedAttempt(clientId)
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 403, {
        reason: `No permission to use ${provider} integration`,
      })
    }

    // 6. Parse request body
    let body: { token?: string }
    try {
      body = await req.json()
    } catch (_err) {
      // Expected: malformed JSON body
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        reason: "Invalid JSON body",
      })
    }

    const { token } = body

    if (!token || typeof token !== "string") {
      oauthOperationRateLimiter.recordFailedAttempt(clientId)
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        reason: "Token is required",
      })
    }

    // Basic token format validation
    const trimmedToken = token.trim()
    if (trimmedToken.length < 10) {
      oauthOperationRateLimiter.recordFailedAttempt(clientId)
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        reason: "Token appears to be invalid",
      })
    }

    // 7. Validate the token with the provider
    let validationResult: { valid: boolean; username?: string; error?: string }

    if (provider === "github") {
      validationResult = await validateGitHubPat(trimmedToken)
    } else {
      // For future providers, add validation here
      validationResult = { valid: false, error: "Token validation not implemented for this provider" }
    }

    if (!validationResult.valid) {
      oauthOperationRateLimiter.recordFailedAttempt(clientId)
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        reason: validationResult.error || "Invalid token",
      })
    }

    // 8. Store the token using oauth-core
    const oauthKey = getOAuthKeyForProvider(provider)
    const oauthManager = getOAuthInstance(oauthKey)

    // PATs don't expire, so we store them without refresh token or expiry
    await oauthManager.saveTokens(user.id, oauthKey, {
      access_token: trimmedToken,
      token_type: "Bearer",
      // No refresh_token - PATs don't refresh
      // No expires_in - PATs don't expire (unless user revokes)
    })

    // Reset rate limit on success
    oauthOperationRateLimiter.reset(clientId)

    console.log(`[${provider} PAT] Successfully connected user ${user.id}`, {
      username: validationResult.username,
    })

    return NextResponse.json({
      ok: true,
      message: `Connected to ${provider}${validationResult.username ? ` as ${validationResult.username}` : ""}`,
      username: validationResult.username,
    })
  } catch (error) {
    console.error("[PAT Connection] Unexpected error:", error)
    Sentry.captureException(error)
    return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500)
  }
}
