/**
 * Linear OAuth Provider
 *
 * Implements OAuth 2.0 flow for Linear
 * Docs: https://developers.linear.app/docs/oauth/authentication
 *
 * Linear supports:
 * - Token refresh (unlike GitHub OAuth Apps)
 * - Token revocation
 * - PKCE for public clients
 */

import { fetchWithRetry } from "../fetch-with-retry"
import type { GraphQLError, OAuthTokens } from "../types"
import type { OAuthProviderCore, OAuthRefreshable, OAuthRevocable, PKCEOptions, TokenExchangeOptions } from "./base"

export const LINEAR_SCOPES = ["read", "write", "issues:create"] as const

export class LinearProvider implements OAuthProviderCore, OAuthRefreshable, OAuthRevocable {
  name = "linear"

  /**
   * Exchanges authorization code for Linear access token
   * Supports PKCE for public clients
   */
  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri?: string,
    options?: TokenExchangeOptions,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      code,
      client_id: clientId,
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

    // Additional body params support (n8n pattern)
    if (options?.additionalBodyParams) {
      for (const [key, value] of Object.entries(options.additionalBodyParams)) {
        params.append(key, value)
      }
    }

    const res = await fetchWithRetry(
      "https://api.linear.app/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
      },
      { label: "Linear" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Linear OAuth failed: ${res.status} ${error}`)
    }

    const data = await res.json()

    if (data.error) {
      throw new Error(`Linear OAuth error: ${data.error_description || data.error}`)
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      scope: data.scope,
      token_type: data.token_type || "Bearer",
    }
  }

  /**
   * Refreshes an expired Linear access token
   *
   * Linear supports token refresh (unlike GitHub OAuth Apps)
   */
  async refreshToken(refreshToken: string, clientId: string, clientSecret: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    })

    const res = await fetchWithRetry(
      "https://api.linear.app/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
      },
      { label: "Linear" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Linear token refresh failed: ${res.status} ${error}`)
    }

    const data = await res.json()

    if (data.error) {
      throw new Error(`Linear refresh error: ${data.error_description || data.error}`)
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // Reuse if not provided
      expires_in: data.expires_in,
      scope: data.scope,
      token_type: data.token_type || "Bearer",
    }
  }

  /**
   * Revokes a Linear access token
   */
  async revokeToken(token: string, clientId: string, clientSecret: string): Promise<void> {
    const params = new URLSearchParams({
      access_token: token,
      client_id: clientId,
      client_secret: clientSecret,
    })

    const res = await fetchWithRetry(
      "https://api.linear.app/oauth/revoke",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
      { label: "Linear" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Linear token revocation failed: ${res.status} ${error}`)
    }
  }

  /**
   * Generates Linear authorization URL
   *
   * @param clientId - Linear OAuth App Client ID
   * @param redirectUri - Callback URL (must match Linear app config)
   * @param scope - Comma-separated scopes (e.g., "read,write,issues:create")
   * @param state - Random state for CSRF protection
   * @param pkce - PKCE challenge for public clients (optional)
   * @returns Authorization URL to redirect user to
   */
  getAuthUrl(clientId: string, redirectUri: string, scope: string, state?: string, pkce?: PKCEOptions): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope, // Linear uses comma-separated scopes
    })

    if (state) {
      params.append("state", state)
    }

    // PKCE support for public clients
    if (pkce) {
      params.append("code_challenge", pkce.code_challenge)
      params.append("code_challenge_method", pkce.code_challenge_method)
    }

    return `https://linear.app/oauth/authorize?${params.toString()}`
  }

  /**
   * Gets the authenticated user's info from Linear
   * Useful for verifying the connection works
   */
  async getUserInfo(accessToken: string): Promise<{
    id: string
    email: string
    name: string
  }> {
    const query = `
      query Me {
        viewer {
          id
          email
          name
        }
      }
    `

    const res = await fetchWithRetry(
      "https://api.linear.app/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query }),
      },
      { label: "Linear" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Linear API failed: ${res.status} ${error}`)
    }

    const data = await res.json()

    if (data.errors) {
      const errorDetails =
        data.errors?.map((e: GraphQLError) => e?.message || "Unknown error").join(", ") || "Unknown error"
      throw new Error(`Linear GraphQL error: ${errorDetails}. This may indicate missing scopes or an invalid token.`)
    }

    return data.data.viewer
  }
}
