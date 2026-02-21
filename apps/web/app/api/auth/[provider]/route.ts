/**
 * OAuth Route Handler
 *
 * Clean implementation with separation of concerns.
 * Handles OAuth 2.0 authorization code flow for multiple providers.
 */

import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { AuthenticationError, requireSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { validateProviderName } from "@/lib/integrations/validation"
import {
  checkRateLimit,
  getOAuthConfig,
  handleOAuthCallback,
  handleProviderError,
  initiateOAuthFlow,
  type OAuthFlowResult,
} from "@/lib/oauth/oauth-flow-handler"
import { getRequestUrls } from "@/lib/request-url"

/**
 * Parse and validate OAuth request parameters
 */
interface OAuthRequestParams {
  provider: string
  code: string | null
  state: string | null
  error: string | null
  errorDescription: string | null
}

type ParseResult = OAuthRequestParams | { error: NextResponse }

function isErrorResult(result: ParseResult): result is { error: NextResponse } {
  return "error" in result && result.error instanceof NextResponse
}

async function parseOAuthRequest(req: NextRequest, params: Promise<{ provider: string }>): Promise<ParseResult> {
  const { fullUrl } = getRequestUrls(req)
  const { searchParams } = new URL(fullUrl)
  const resolved = await params

  // Validate provider name
  const validation = validateProviderName(resolved.provider)
  if (!validation.valid) {
    console.error("[OAuth] Invalid provider rejected:", {
      attempted: resolved.provider,
      reason: validation.error,
    })
    return {
      error: structuredErrorResponse(ErrorCodes.INVALID_PROVIDER, {
        status: 400,
        details: { reason: validation.error },
      }),
    }
  }

  return {
    provider: validation.provider!,
    code: searchParams.get("code"),
    state: searchParams.get("state"),
    error: searchParams.get("error"),
    errorDescription: searchParams.get("error_description"),
  }
}

/**
 * Convert OAuth flow result to HTTP response
 */
function resultToResponse(result: OAuthFlowResult): NextResponse {
  switch (result.type) {
    case "redirect":
      return NextResponse.redirect(new URL(result.url))

    case "error":
      return structuredErrorResponse(result.code, { status: result.status, details: result.details })

    default: {
      // Type exhaustion check
      const _exhaustive: never = result
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }
  }
}

/**
 * GET /api/auth/[provider]
 *
 * Handles both OAuth initiation and callback:
 * - No code param: Initiates OAuth flow (redirects to provider)
 * - With code param: Handles callback (exchanges code for tokens)
 *
 * Flow:
 * 1. Parse and validate request
 * 2. Authenticate user
 * 3. Check rate limiting
 * 4. Handle provider errors
 * 5. Route to appropriate handler (initiate or callback)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  try {
    // 1. Parse and validate request
    const parsed = await parseOAuthRequest(req, params)
    if (isErrorResult(parsed)) {
      return parsed.error
    }

    const { provider, code, state, error, errorDescription } = parsed
    const { baseUrl } = getRequestUrls(req)

    // 2. Require authentication
    const user = await requireSessionUser()

    // 3. Check rate limiting
    const rateLimit = await checkRateLimit(req, provider, !!code)
    if (rateLimit.limited) {
      const message = `Too many requests. Try again in ${rateLimit.minutesRemaining} minute${
        rateLimit.minutesRemaining !== 1 ? "s" : ""
      }.`
      return NextResponse.redirect(
        new URL(`/oauth/callback?integration=${provider}&status=error&message=${encodeURIComponent(message)}`, baseUrl),
      )
    }

    // 4. Handle provider errors
    if (error) {
      const result = handleProviderError(provider, error, errorDescription, baseUrl)
      return resultToResponse(result)
    }

    // 5. Route to appropriate handler
    const context = { provider, user, baseUrl }

    // OAuth Callback Flow (has authorization code)
    if (code) {
      const result = await handleOAuthCallback(context, code, state, req)
      return resultToResponse(result)
    }

    // OAuth Initiation Flow (no code, start authorization)
    // Pass baseUrl to derive redirect URI from typed route path
    const config = getOAuthConfig(provider, baseUrl)
    if (!config) {
      Sentry.captureMessage(`[${provider} OAuth] Missing configuration`, "error")
      console.error(`[${provider} OAuth] Missing configuration`)
      const sanitizedMessage = `${provider} integration is not available. Please contact your administrator.`
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?integration=${provider}&status=error&message=${encodeURIComponent(sanitizedMessage)}`,
          baseUrl,
        ),
      )
    }

    const result = await initiateOAuthFlow(context, config)
    return resultToResponse(result)
  } catch (error) {
    // Handle authentication errors
    if (error instanceof AuthenticationError) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    // Log unexpected errors (but don't expose details)
    Sentry.captureException(error)
    console.error("[OAuth] Unexpected error:", error)
    return structuredErrorResponse(ErrorCodes.INTEGRATION_ERROR, { status: 500 })
  }
}
