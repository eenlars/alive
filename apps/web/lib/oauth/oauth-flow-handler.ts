/**
 * OAuth Flow Handler
 *
 * Manages OAuth authorization flow state machine with clear separation of concerns.
 * Handles both initiation and callback phases of OAuth 2.0 authorization code flow.
 */

import crypto from "node:crypto"
import { env } from "@webalive/env/server"
import { GoogleProvider, getProvider } from "@webalive/oauth-core"
import { getOAuthKeyForProvider } from "@webalive/shared"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import type { SessionUser } from "@/features/auth/lib/auth"
import { getClientIdentifier } from "@/lib/auth/client-identifier"
import { oauthInitiationRateLimiter, oauthOperationRateLimiter } from "@/lib/auth/rate-limiter"
import { ErrorCodes } from "@/lib/error-codes"
import { errorLogger } from "@/lib/error-logger"
import { canUserAccessIntegration } from "@/lib/integrations/visibility"
import { getOAuthInstance } from "@/lib/oauth/oauth-instances"
import { buildOAuthRedirectUri, isOAuthProviderSupported, OAUTH_PROVIDER_CONFIG, type OAuthProvider } from "./providers"

const OAUTH_STATE_COOKIE_PREFIX = "oauth_state_"
const STATE_COOKIE_MAX_AGE = 600 // 10 minutes
const STATE_TOKEN_BYTES = 32

/**
 * OAuth Flow Result Types
 */
export type OAuthFlowResult =
  | { type: "redirect"; url: string }
  | { type: "error"; code: string; status: number; details?: any }

/**
 * OAuth Flow Context
 */
export interface OAuthContext {
  provider: string
  user: SessionUser
  baseUrl: string
}

/**
 * OAuth Configuration
 */
export interface OAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string
}

/**
 * Get OAuth configuration for a provider
 *
 * Redirect URI is derived from the base URL and typed route path,
 * NOT from environment variables (to prevent misconfiguration).
 *
 * @param provider - OAuth provider key
 * @param baseUrl - Base URL for redirect URI (e.g., https://dev.sonno.tech)
 */
export function getOAuthConfig(provider: string, baseUrl?: string): OAuthConfig | null {
  if (!isOAuthProviderSupported(provider)) {
    return null
  }

  const providerKey = provider as OAuthProvider
  const config = OAUTH_PROVIDER_CONFIG[providerKey]
  const envPrefix = config.envPrefix

  const clientId = process.env[`${envPrefix}_CLIENT_ID`]
  const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`]

  if (!clientId || !clientSecret) {
    return null
  }

  // Redirect URI is derived from base URL + typed route path
  // Falls back to env var only for backward compatibility
  const redirectUri = baseUrl
    ? buildOAuthRedirectUri(baseUrl, providerKey)
    : process.env[`${envPrefix}_REDIRECT_URI`] || ""

  // Scopes from env or use defaults from typed config
  const scopes = process.env[`${envPrefix}_SCOPES`] || config.defaultScopes

  return { clientId, clientSecret, redirectUri, scopes }
}

/**
 * Check if request should be rate limited
 */
export async function checkRateLimit(
  req: NextRequest,
  provider: string,
  isCallback: boolean,
): Promise<{ limited: boolean; minutesRemaining?: number }> {
  const clientId = getClientIdentifier(req, `oauth:${provider}`)
  const rateLimiter = isCallback ? oauthOperationRateLimiter : oauthInitiationRateLimiter

  if (rateLimiter.isRateLimited(clientId)) {
    const blockedTime = rateLimiter.getBlockedTimeRemaining(clientId)
    const minutesRemaining = Math.ceil(blockedTime / 1000 / 60)

    console.warn(`[${provider} OAuth] Rate limited: ${clientId}`)
    return { limited: true, minutesRemaining }
  }

  return { limited: false }
}

/**
 * Record a failed OAuth attempt for rate limiting
 */
export function recordFailedAttempt(req: NextRequest, provider: string) {
  const clientId = getClientIdentifier(req, `oauth:${provider}`)
  oauthOperationRateLimiter.recordFailedAttempt(clientId)
}

/**
 * Reset rate limit after successful operation
 */
export function resetRateLimit(req: NextRequest, provider: string) {
  const clientId = getClientIdentifier(req, `oauth:${provider}`)
  oauthOperationRateLimiter.reset(clientId)
}

/**
 * OAuth State Management
 */
export class OAuthStateManager {
  /**
   * Generate and store CSRF state token
   */
  static async createState(provider: string): Promise<string> {
    const state = crypto.randomBytes(STATE_TOKEN_BYTES).toString("hex")
    const cookieStore = await cookies()
    const cookieName = `${OAUTH_STATE_COOKIE_PREFIX}${provider}`

    cookieStore.set(cookieName, state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STATE_COOKIE_MAX_AGE,
    })

    return state
  }

  /**
   * Validate and clear CSRF state token
   */
  static async validateState(provider: string, receivedState: string | null): Promise<boolean> {
    if (!receivedState) return false

    const cookieStore = await cookies()
    const cookieName = `${OAUTH_STATE_COOKIE_PREFIX}${provider}`
    const savedState = cookieStore.get(cookieName)?.value

    // Clear cookie immediately (prevent replay attacks)
    cookieStore.set(cookieName, "", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    })

    if (!savedState || savedState !== receivedState) {
      console.error(`[${provider} OAuth] State mismatch:`, {
        savedState: savedState ? "present" : "missing",
        receivedState: receivedState ? "present" : "missing",
      })
      return false
    }

    return true
  }
}

/**
 * OAuth Authorization Flow - Initiate
 *
 * Starts the OAuth flow by redirecting user to provider's authorization page
 */
export async function initiateOAuthFlow(context: OAuthContext, config: OAuthConfig): Promise<OAuthFlowResult> {
  const { provider, user } = context

  // Check user has permission to use this integration
  const hasAccess = await canUserAccessIntegration(user.id, provider)
  if (!hasAccess) {
    console.error(`[${provider} OAuth] User ${user.id} denied access to ${provider}`)
    return {
      type: "error",
      code: ErrorCodes.UNAUTHORIZED,
      status: 403,
      details: { reason: `No permission to use ${provider} integration` },
    }
  }

  // Generate CSRF state
  const state = await OAuthStateManager.createState(provider)

  // Build authorization URL
  // Use oauthKey to get the actual OAuth provider (e.g., 'gmail' -> 'google')
  const oauthKey = getOAuthKeyForProvider(provider)
  const oauthProvider = getProvider(oauthKey)
  if (!oauthProvider.getAuthUrl) {
    return {
      type: "error",
      code: ErrorCodes.INTEGRATION_ERROR,
      status: 500,
      details: { reason: `Provider ${provider} does not support OAuth` },
    }
  }

  // Google requires prompt=consent to guarantee refresh tokens on re-authorization
  // Without this, Google only returns refresh_token on FIRST auth, causing failures later
  // See: https://developers.google.com/identity/protocols/oauth2/web-server#offline
  let authUrl: string
  if (oauthKey === "google" && oauthProvider instanceof GoogleProvider) {
    // Google getAuthUrl signature: (clientId, redirectUri, scope, state?, pkce?, options?)
    // Pass undefined for pkce (not using PKCE), then GoogleAuthOptions
    authUrl = oauthProvider.getAuthUrl(config.clientId, config.redirectUri, config.scopes, state, undefined, {
      forceConsent: true,
    })
  } else {
    authUrl = oauthProvider.getAuthUrl(config.clientId, config.redirectUri, config.scopes, state)
  }

  console.log(`[${provider} OAuth] Initiating flow for user ${user.id}`, {
    redirectUri: config.redirectUri,
    scopeCount: config.scopes.split(" ").length,
    forceConsent: oauthKey === "google",
  })

  return {
    type: "redirect",
    url: authUrl,
  }
}

/**
 * OAuth Authorization Flow - Handle Callback
 *
 * Processes the OAuth callback, exchanges code for tokens
 */
export async function handleOAuthCallback(
  context: OAuthContext,
  code: string,
  state: string | null,
  req: NextRequest,
): Promise<OAuthFlowResult> {
  const { provider, user, baseUrl } = context

  // Validate CSRF state
  const isValidState = await OAuthStateManager.validateState(provider, state)
  if (!isValidState) {
    recordFailedAttempt(req, provider)
    return {
      type: "redirect",
      url: `${baseUrl}/oauth/callback?integration=${provider}&status=error&message=Invalid+state`,
    }
  }

  // Double-check permissions (defense in depth)
  const hasAccess = await canUserAccessIntegration(user.id, provider)
  if (!hasAccess) {
    console.error(`[${provider} OAuth] Callback denied for user ${user.id}`)
    recordFailedAttempt(req, provider)
    return {
      type: "redirect",
      url: `${baseUrl}/oauth/callback?integration=${provider}&status=error&message=${encodeURIComponent("Access denied")}`,
    }
  }

  // CRITICAL: Build redirect URI BEFORE try block so it's accessible in catch for logging
  // This must match exactly what was used during authorization or Google will reject with "Bad Request"
  const redirectUri = buildOAuthRedirectUri(baseUrl, provider as OAuthProvider)

  try {
    // Exchange code for tokens
    // Use oauthKey to get the actual OAuth provider (e.g., 'gmail' -> 'google')
    const oauthKey = getOAuthKeyForProvider(provider)
    const oauthManager = getOAuthInstance(oauthKey)

    await oauthManager.handleCallback(
      user.id, // instanceId (for env-based OAuth, same as userId)
      user.id, // authenticatingUserId
      oauthKey, // Use oauthKey for token storage
      code,
      redirectUri, // Pass redirect URI to ensure it matches authorization
    )

    console.log(`[${provider} OAuth] Successfully connected user ${user.id}`)
    resetRateLimit(req, provider)

    return {
      type: "redirect",
      url: `${baseUrl}/oauth/callback?integration=${provider}&status=success`,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Centralized error logging with full context for debugging
    errorLogger.oauth(`OAuth callback failed for ${provider}`, {
      provider,
      errorMessage,
      redirectUri,
      baseUrl,
      userId: user.id,
      stack: error instanceof Error ? error.stack : undefined,
    })

    recordFailedAttempt(req, provider)

    // Security: Don't expose internal errors in production, but show in dev
    const isDev = process.env.NODE_ENV === "development"
    const sanitizedMessage = isDev
      ? `Connection failed: ${errorMessage}`
      : "Connection failed. Please try again or contact support."

    return {
      type: "redirect",
      url: `${baseUrl}/oauth/callback?integration=${provider}&status=error&message=${encodeURIComponent(sanitizedMessage)}`,
    }
  }
}

/**
 * Handle OAuth provider error response
 */
export function handleProviderError(
  provider: string,
  error: string,
  errorDescription: string | null,
  baseUrl: string,
): OAuthFlowResult {
  const description = errorDescription || error
  console.error(`[${provider} OAuth] Provider returned error:`, description)

  // Security: Don't expose provider error details
  const sanitizedMessage = `${provider} authorization failed. Please try again.`

  return {
    type: "redirect",
    url: `${baseUrl}/oauth/callback?integration=${provider}&status=error&message=${encodeURIComponent(sanitizedMessage)}`,
  }
}
