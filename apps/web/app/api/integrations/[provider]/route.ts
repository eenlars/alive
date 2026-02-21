/**
 * Integration Management API
 *
 * Clean implementation with DRY principle.
 * Handles connection status checks, disconnection, and PAT-based connections for OAuth providers.
 *
 * @error-check-disable - Internal validation functions return error strings,
 * not API responses. These are converted to proper ErrorCodes at the API boundary.
 */

import * as Sentry from "@sentry/nextjs"
import { getOAuthKeyForProvider, providerSupportsPat } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { getClientIdentifier } from "@/lib/auth/client-identifier"
import { oauthOperationRateLimiter } from "@/lib/auth/rate-limiter"
import { ErrorCodes } from "@/lib/error-codes"
import { validateProviderName } from "@/lib/integrations/validation"
import { canUserAccessIntegration } from "@/lib/integrations/visibility"
import { getOAuthInstance } from "@/lib/oauth/oauth-instances"

/**
 * Common request validation and rate limiting
 *
 * DRY: Shared validation logic for both GET and DELETE endpoints
 */
async function validateIntegrationRequest(
  req: NextRequest,
  params: Promise<{ provider: string }>,
): Promise<{ ok: true; provider: string; user: { id: string } } | { ok: false; response: NextResponse }> {
  // 1. Validate provider
  const resolved = await params
  const validation = validateProviderName(resolved.provider)

  if (!validation.valid) {
    console.error("[Integration] Invalid provider:", {
      attempted: resolved.provider,
      reason: validation.error,
    })
    return {
      ok: false,
      response: structuredErrorResponse(ErrorCodes.INVALID_PROVIDER, {
        status: 400,
        details: { reason: validation.error },
      }),
    }
  }

  const provider = validation.provider!

  // 2. Authenticate user
  const user = await getSessionUser()
  if (!user) {
    return {
      ok: false,
      response: structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 }),
    }
  }

  // 3. Check rate limit
  const clientId = getClientIdentifier(req, `integration:${provider}`)
  if (oauthOperationRateLimiter.isRateLimited(clientId)) {
    const blockedTime = oauthOperationRateLimiter.getBlockedTimeRemaining(clientId)
    const minutesRemaining = Math.ceil(blockedTime / 1000 / 60)

    console.warn(`[${provider} Integration] Rate limited:`, clientId)

    return {
      ok: false,
      response: structuredErrorResponse(ErrorCodes.TOO_MANY_REQUESTS, {
        status: 429,
        details: { retryAfter: `${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""}` },
      }),
    }
  }

  return { ok: true, provider, user }
}

/**
 * GET /api/integrations/[provider]
 *
 * Check if user is connected to a provider.
 *
 * Response:
 * - 200: { connected: boolean, provider: string }
 * - 400: Invalid provider
 * - 401: Unauthorized
 * - 429: Rate limited
 * - 500: Internal error
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  // Common validation
  const validation = await validateIntegrationRequest(req, params)
  if (!validation.ok) {
    return validation.response
  }

  const { provider, user } = validation

  try {
    // Map MCP provider key to OAuth key (e.g., "gmail" -> "google")
    const oauthKey = getOAuthKeyForProvider(provider)
    const oauthManager = getOAuthInstance(oauthKey)
    const isConnected = await oauthManager.isConnected(user.id, oauthKey)

    console.log(`[${provider} Integration] Status check - connected: ${isConnected} (oauthKey: ${oauthKey})`)

    return NextResponse.json({
      connected: isConnected,
      provider,
    })
  } catch (error) {
    console.error(`[${provider} Integration] Status check failed:`, error)
    Sentry.captureException(error)

    // Security: Don't expose internal error details
    return structuredErrorResponse(ErrorCodes.INTEGRATION_ERROR, {
      status: 500,
      details: { provider },
    })
  }
}

/**
 * DELETE /api/integrations/[provider]
 *
 * Disconnect user from a provider.
 * Attempts graceful revocation with provider, falls back to local disconnect.
 *
 * Response:
 * - 200: { ok: true, message: string }
 * - 400: Not connected or invalid provider
 * - 401: Unauthorized
 * - 429: Rate limited
 * - 500: Internal error
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  // Common validation
  const validation = await validateIntegrationRequest(req, params)
  if (!validation.ok) {
    return validation.response
  }

  const { provider, user } = validation
  const clientId = getClientIdentifier(req, `integration:${provider}`)

  try {
    // Map MCP provider key to OAuth key (e.g., "gmail" -> "google")
    const oauthKey = getOAuthKeyForProvider(provider)
    const oauthManager = getOAuthInstance(oauthKey)

    // Verify user is connected
    const isConnected = await oauthManager.isConnected(user.id, oauthKey)
    if (!isConnected) {
      // Record invalid attempt
      oauthOperationRateLimiter.recordFailedAttempt(clientId)

      return structuredErrorResponse(ErrorCodes.INTEGRATION_NOT_CONNECTED, {
        status: 400,
        details: { provider },
      })
    }

    // Attempt graceful revocation
    await revokeTokenGracefully(oauthManager, user.id, oauthKey)

    // Success - reset rate limit
    oauthOperationRateLimiter.reset(clientId)

    console.log(`[${provider} Integration] Successfully disconnected user:`, user.id)

    return NextResponse.json({
      ok: true,
      message: `Disconnected from ${provider}`,
    })
  } catch (error) {
    console.error(`[${provider} Integration] Disconnect failed:`, error)
    Sentry.captureException(error)

    // Security: Don't expose internal error details
    return structuredErrorResponse(ErrorCodes.INTEGRATION_ERROR, {
      status: 500,
      details: { provider },
    })
  }
}

/**
 * Attempt to revoke token with provider, fall back to local disconnect
 *
 * Graceful handling: If provider API is down or revocation fails,
 * we still disconnect locally to ensure user can disconnect.
 */
async function revokeTokenGracefully(
  oauthManager: ReturnType<typeof getOAuthInstance>,
  userId: string,
  provider: string,
): Promise<void> {
  try {
    // Try to revoke with provider
    await oauthManager.revoke(
      userId, // instanceId
      userId, // authenticatingUserId
      provider,
    )
    console.log(`[${provider} Integration] Token revoked with provider`)
  } catch (error) {
    // Provider might be down, still disconnect locally
    console.warn(`[${provider} Integration] Token revocation failed, disconnecting locally:`, error)
    await oauthManager.disconnect(userId, provider)
  }
}

/**
 * Validate a GitHub PAT by calling the GitHub API
 *
 * @param token - The PAT to validate
 * @returns Object with validation result and optional user info
 */
async function validateGitHubPat(token: string): Promise<{
  valid: boolean
  username?: string
  scopes?: string
  error?: string
}> {
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
        return { valid: false, error: "Invalid token" }
      }
      return { valid: false, error: `GitHub API error: ${response.status}` }
    }

    const user = await response.json()
    const scopes = response.headers.get("x-oauth-scopes") || ""

    return {
      valid: true,
      username: user.login,
      scopes,
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Failed to validate token",
    }
  }
}

/**
 * POST /api/integrations/[provider]
 *
 * Connect user to a provider using a Personal Access Token (PAT).
 * Only available for providers that support PAT authentication.
 *
 * Request body:
 * - token: The Personal Access Token
 *
 * Response:
 * - 200: { ok: true, message: string, username?: string }
 * - 400: Invalid provider, provider doesn't support PAT, or invalid token
 * - 401: Unauthorized
 * - 403: User doesn't have access to this integration
 * - 429: Rate limited
 * - 500: Internal error
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  // Common validation
  const validation = await validateIntegrationRequest(req, params)
  if (!validation.ok) {
    return validation.response
  }

  const { provider, user } = validation
  const clientId = getClientIdentifier(req, `integration:${provider}`)

  // Check if provider supports PAT
  if (!providerSupportsPat(provider)) {
    return structuredErrorResponse(ErrorCodes.INVALID_PROVIDER, {
      status: 400,
      details: { reason: `${provider} does not support Personal Access Token authentication. Use OAuth instead.` },
    })
  }

  // Check user has access to this integration
  const hasAccess = await canUserAccessIntegration(user.id, provider)
  if (!hasAccess) {
    console.error(`[${provider} Integration] User ${user.id} denied access`)
    return structuredErrorResponse(ErrorCodes.FORBIDDEN, {
      status: 403,
      details: { reason: `You don't have access to the ${provider} integration` },
    })
  }

  // Parse request body
  let token: string
  try {
    const body = await req.json()
    token = body.token

    if (!token || typeof token !== "string") {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { reason: "Token is required" },
      })
    }

    // Basic validation: GitHub classic PATs start with "ghp_", fine-grained with "github_pat_"
    const isValidFormat = token.startsWith("ghp_") || token.startsWith("github_pat_")
    if (!isValidFormat) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: {
          reason:
            "Invalid token format. GitHub PATs should start with 'ghp_' (classic) or 'github_pat_' (fine-grained)",
        },
      })
    }
  } catch {
    return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
      status: 400,
      details: { reason: "Invalid request body" },
    })
  }

  try {
    // Validate the token with GitHub API
    const tokenValidation = await validateGitHubPat(token)

    if (!tokenValidation.valid) {
      oauthOperationRateLimiter.recordFailedAttempt(clientId)
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { reason: tokenValidation.error || "Invalid token" },
      })
    }

    // Store the token using OAuth manager
    // PATs don't expire, so we don't set expires_in
    const oauthKey = getOAuthKeyForProvider(provider)
    const oauthManager = getOAuthInstance(oauthKey)
    await oauthManager.saveTokens(user.id, oauthKey, {
      access_token: token,
      token_type: "Bearer",
      scope: tokenValidation.scopes,
      // No refresh_token or expires_in for PATs
    })

    // Reset rate limit on success
    oauthOperationRateLimiter.reset(clientId)

    console.log(`[${provider} Integration] Successfully connected via PAT:`, {
      userId: `${user.id.slice(0, 8)}...`,
      username: tokenValidation.username,
      scopes: tokenValidation.scopes,
    })

    return NextResponse.json({
      ok: true,
      message: `Connected to ${provider} as ${tokenValidation.username}`,
      username: tokenValidation.username,
    })
  } catch (error) {
    console.error(`[${provider} Integration] PAT connection failed:`, error)
    Sentry.captureException(error)

    return structuredErrorResponse(ErrorCodes.INTEGRATION_ERROR, {
      status: 500,
      details: { provider },
    })
  }
}
