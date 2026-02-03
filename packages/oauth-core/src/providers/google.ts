/**
 * Google OAuth Provider
 *
 * Implements OAuth 2.0 flow for Google APIs (Gmail, etc.)
 * Docs: https://developers.google.com/identity/protocols/oauth2
 *
 * Key differences from other providers:
 * - Requires access_type: 'offline' to get refresh tokens
 * - Requires prompt: 'consent' to force refresh token on re-auth
 * - Supports token refresh (unlike GitHub OAuth Apps)
 * - Supports PKCE for public clients (learned from n8n)
 */

import type { OAuthProviderCore, OAuthRefreshable, OAuthRevocable, PKCEOptions, TokenExchangeOptions } from "./base"
import type { OAuthTokens } from "../types"
import { fetchWithRetry } from "../fetch-with-retry"

/**
 * Google-specific OAuth options
 */
export interface GoogleAuthOptions {
  /** Force consent screen to get new refresh token (default: false) */
  forceConsent?: boolean
  /** Include granted scopes in response (default: true) */
  includeGrantedScopes?: boolean
  /** Login hint - pre-fill email in consent screen */
  loginHint?: string
}

/**
 * Google OAuth token response
 */
export interface GoogleTokenResponse extends OAuthTokens {
  /** ID token (JWT) with user info - only if openid scope requested */
  id_token?: string
}

export class GoogleProvider implements OAuthProviderCore, OAuthRefreshable, OAuthRevocable {
  name = "google"

  /**
   * Default scopes for Gmail full access
   * Use getAuthUrl with custom scope for different access levels
   */
  static readonly GMAIL_FULL_SCOPES = [
    "https://mail.google.com/", // Full Gmail access
    "https://www.googleapis.com/auth/gmail.modify", // Read/write/send (no delete)
    "https://www.googleapis.com/auth/userinfo.profile", // Basic profile
    "https://www.googleapis.com/auth/userinfo.email", // Email address
  ].join(" ")

  /**
   * Read-only Gmail scopes (safer for initial testing)
   */
  static readonly GMAIL_READONLY_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ")

  /**
   * Exchanges authorization code for Google access + refresh tokens
   *
   * IMPORTANT: Only returns refresh_token on FIRST authorization
   * or when prompt=consent was used in getAuthUrl
   *
   * Supports PKCE for public clients (no client_secret required)
   */
  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri?: string,
    options?: TokenExchangeOptions,
  ): Promise<GoogleTokenResponse> {
    const params = new URLSearchParams({
      client_id: clientId,
      code,
      grant_type: "authorization_code",
    })

    // PKCE flow: use code_verifier instead of client_secret
    if (options?.code_verifier) {
      params.append("code_verifier", options.code_verifier)
    }

    // Add client_secret only if provided (confidential clients)
    if (clientSecret) {
      params.append("client_secret", clientSecret)
    }

    if (redirectUri) {
      params.append("redirect_uri", redirectUri)
    }

    // Additional body params (from n8n pattern)
    if (options?.additionalBodyParams) {
      for (const [key, value] of Object.entries(options.additionalBodyParams)) {
        params.append(key, value)
      }
    }

    const res = await fetchWithRetry(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
      { label: "Google" },
    )

    const data = await res.json()

    if (!res.ok || data.error) {
      // Log detailed error info for debugging (this is the critical place where errors are hidden)
      console.error("[Google OAuth] Token exchange failed:", {
        status: res.status,
        statusText: res.statusText,
        error: data.error,
        errorDescription: data.error_description,
        // Log redirect_uri for debugging mismatch issues (most common cause of "Bad Request")
        redirectUriUsed: redirectUri || "(not provided)",
        hint:
          data.error === "invalid_grant" || res.status === 400
            ? "This usually means redirect_uri mismatch. Check that the URI matches Google Cloud Console exactly."
            : undefined,
      })
      throw new Error(`Google OAuth failed: ${data.error_description || data.error || res.statusText}`)
    }

    // Warn if no refresh token received (indicates prompt=consent was not used)
    if (!data.refresh_token) {
      console.warn("[Google OAuth] No refresh_token received - user may need to re-authorize with prompt=consent")
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token, // Only on first auth or prompt=consent
      expires_in: data.expires_in, // Usually 3600 (1 hour)
      scope: data.scope,
      token_type: data.token_type || "Bearer",
      id_token: data.id_token, // JWT with user info (if openid scope)
    }
  }

  /**
   * Refreshes an expired access token using the refresh token
   *
   * Google access tokens expire after 1 hour, refresh tokens don't expire
   * (unless user revokes access or 6 months of inactivity)
   */
  async refreshToken(refreshToken: string, clientId: string, clientSecret: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })

    const res = await fetchWithRetry(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
      { label: "Google" },
    )

    const data = await res.json()

    if (!res.ok || data.error) {
      // Provide specific guidance for common errors
      const errorMsg = data.error_description || data.error || res.statusText
      if (data.error === "invalid_grant") {
        throw new Error(
          `Google token refresh failed: ${errorMsg}. The refresh token may have been revoked or expired. User must re-authenticate.`,
        )
      }
      throw new Error(`Google token refresh failed: ${errorMsg}`)
    }

    return {
      access_token: data.access_token,
      // Note: Google does NOT return a new refresh_token on refresh
      // Keep using the original refresh_token
      expires_in: data.expires_in,
      scope: data.scope,
      token_type: data.token_type || "Bearer",
    }
  }

  /**
   * Revokes a Google access or refresh token
   *
   * Can revoke either access_token or refresh_token
   * Revoking refresh_token also invalidates associated access_tokens
   */
  async revokeToken(token: string, _clientId: string, _clientSecret: string): Promise<void> {
    // Google token revocation doesn't need client credentials
    const res = await fetchWithRetry(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
      { label: "Google" },
    )

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(`Google token revocation failed: ${data.error_description || data.error || res.statusText}`)
    }
  }

  /**
   * Generates Google authorization URL
   *
   * @param clientId - Google OAuth Client ID (from Cloud Console)
   * @param redirectUri - Callback URL (must match Cloud Console config)
   * @param scope - Space-separated scopes (use GMAIL_FULL_SCOPES for email)
   * @param state - Random state for CSRF protection
   * @param pkce - PKCE challenge for public clients (optional)
   * @param options - Google-specific options
   * @returns Authorization URL to redirect user to
   *
   * @example
   * // Full Gmail access with PKCE
   * const pkce = generatePKCEChallenge()
   * const url = provider.getAuthUrl(
   *   clientId,
   *   'https://example.com/callback',
   *   GoogleProvider.GMAIL_FULL_SCOPES,
   *   crypto.randomUUID(),
   *   pkce,
   *   { forceConsent: true }
   * )
   */
  getAuthUrl(
    clientId: string,
    redirectUri: string,
    scope: string,
    state?: string,
    pkce?: PKCEOptions,
    options?: GoogleAuthOptions,
  ): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      access_type: "offline", // CRITICAL: Required for refresh tokens
    })

    if (state) {
      params.append("state", state)
    }

    // PKCE support for public clients (learned from n8n)
    if (pkce) {
      params.append("code_challenge", pkce.code_challenge)
      params.append("code_challenge_method", pkce.code_challenge_method)
    }

    // Force consent to always get refresh token (even on re-auth)
    if (options?.forceConsent) {
      params.append("prompt", "consent")
    }

    // Include previously granted scopes
    if (options?.includeGrantedScopes !== false) {
      params.append("include_granted_scopes", "true")
    }

    // Pre-fill email in consent screen
    if (options?.loginHint) {
      params.append("login_hint", options.loginHint)
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  /**
   * Gets basic user info from Google
   * Useful for getting email after OAuth flow
   *
   * @param accessToken - Valid access token
   * @returns User info (email, name, picture, etc.)
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const res = await fetchWithRetry(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      { label: "Google" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Failed to get Google user info: ${res.status} ${error || res.statusText}`)
    }

    return res.json()
  }
}

/**
 * Google user info response
 */
export interface GoogleUserInfo {
  id: string
  email: string
  verified_email: boolean
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  locale?: string
}
