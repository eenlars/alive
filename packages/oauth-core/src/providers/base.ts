/**
 * Base OAuth Provider Interfaces
 *
 * Split interfaces for better interface segregation
 *
 * Improvements learned from n8n:
 * - PKCE support for public clients (RFC 7636)
 * - Flexible authentication methods (header vs body)
 * - Dynamic client registration support
 */

import type { OAuthTokens } from "../types"

/**
 * PKCE options for authorization and token exchange
 */
export interface PKCEOptions {
  code_challenge: string
  code_challenge_method: "S256" | "plain"
  code_verifier?: string // Only needed for token exchange
}

/**
 * Extended exchange options (learned from n8n's ClientOAuth2Options)
 */
export interface TokenExchangeOptions {
  /** How to send client credentials: header (Basic auth) or body */
  authentication?: "header" | "body"
  /** PKCE code verifier for public clients */
  code_verifier?: string
  /** Additional body parameters */
  additionalBodyParams?: Record<string, string>
}

/**
 * Core OAuth functionality that ALL providers must implement
 */
export interface OAuthProviderCore {
  /** Provider name (e.g., "github", "google") */
  name: string

  /**
   * Exchanges an authorization code for access tokens
   *
   * @param code - Authorization code from OAuth callback
   * @param clientId - OAuth app client ID
   * @param clientSecret - OAuth app client secret (optional for PKCE public clients)
   * @param redirectUri - Optional redirect URI (must match OAuth app config)
   * @param options - Extended options for PKCE and auth method
   * @returns OAuth tokens (access_token, refresh_token, etc.)
   */
  exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri?: string,
    options?: TokenExchangeOptions,
  ): Promise<OAuthTokens>

  /**
   * Gets the authorization URL for the OAuth flow
   *
   * @param clientId - OAuth app client ID
   * @param redirectUri - Redirect URI
   * @param scope - Space-separated scopes
   * @param state - CSRF protection state parameter
   * @param pkce - Optional PKCE challenge for public clients
   * @returns Full authorization URL
   */
  getAuthUrl(clientId: string, redirectUri: string, scope: string, state?: string, pkce?: PKCEOptions): string
}

/**
 * Token refresh capability (not all providers support this)
 */
export interface OAuthRefreshable {
  /**
   * Refreshes an expired access token using a refresh token
   *
   * @param refreshToken - Valid refresh token
   * @param clientId - OAuth app client ID
   * @param clientSecret - OAuth app client secret
   * @returns New OAuth tokens
   */
  refreshToken(refreshToken: string, clientId: string, clientSecret: string): Promise<OAuthTokens>
}

/**
 * Token revocation capability (not all providers support this)
 */
export interface OAuthRevocable {
  /**
   * Revokes an access token (logout)
   *
   * @param token - Access token to revoke
   * @param clientId - OAuth app client ID
   * @param clientSecret - OAuth app client secret
   */
  revokeToken(token: string, clientId: string, clientSecret: string): Promise<void>
}

/**
 * Complete OAuth provider with all capabilities
 * (Maintained for backward compatibility checking)
 */
export type OAuthProvider = OAuthProviderCore & Partial<OAuthRefreshable & OAuthRevocable>

/**
 * Type guards to check provider capabilities at runtime
 */
export function isRefreshable(provider: OAuthProviderCore): provider is OAuthProviderCore & OAuthRefreshable {
  return "refreshToken" in provider && typeof provider.refreshToken === "function"
}

export function isRevocable(provider: OAuthProviderCore): provider is OAuthProviderCore & OAuthRevocable {
  return "revokeToken" in provider && typeof provider.revokeToken === "function"
}
