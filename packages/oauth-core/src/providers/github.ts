/**
 * GitHub OAuth Provider
 *
 * Implements OAuth 2.0 flow for GitHub
 * Docs: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps
 *
 * Note: GitHub OAuth Apps don't support PKCE or token refresh.
 * For those features, use GitHub Apps instead.
 */

import type { OAuthProviderCore, OAuthRevocable, PKCEOptions, TokenExchangeOptions } from "./base"
import type { OAuthTokens } from "../types"
import { fetchWithRetry } from "../fetch-with-retry"

export class GitHubProvider implements OAuthProviderCore, OAuthRevocable {
  name = "github"

  /**
   * Exchanges authorization code for GitHub access token
   *
   * Note: GitHub OAuth Apps don't support PKCE - use GitHub Apps for that
   */
  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri?: string,
    options?: TokenExchangeOptions,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    })

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
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
      },
      { label: "GitHub" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`GitHub OAuth failed: ${res.status} ${error || res.statusText}`)
    }

    const data = await res.json()

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`)
    }

    return {
      access_token: data.access_token,
      scope: data.scope,
      token_type: data.token_type || "Bearer",
    }
  }

  /**
   * Revokes a GitHub access token
   *
   * Note: GitHub doesn't support token refresh for OAuth Apps (only GitHub Apps)
   */
  async revokeToken(token: string, clientId: string, clientSecret: string): Promise<void> {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

    const res = await fetchWithRetry(
      `https://api.github.com/applications/${clientId}/token`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({ access_token: token }),
      },
      { label: "GitHub" },
    )

    if (!res.ok && res.status !== 204) {
      const error = await res.text()
      throw new Error(`GitHub token revocation failed: ${res.status} ${error || res.statusText}`)
    }
  }

  /**
   * Generates GitHub authorization URL
   *
   * @param clientId - GitHub OAuth App Client ID
   * @param redirectUri - Callback URL (must match GitHub app config)
   * @param scope - Space-separated scopes (e.g., "repo user")
   * @param state - Random state for CSRF protection
   * @param _pkce - Not supported by GitHub OAuth Apps (ignored)
   * @returns Authorization URL to redirect user to
   */
  getAuthUrl(clientId: string, redirectUri: string, scope: string, state?: string, _pkce?: PKCEOptions): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
    })

    if (state) {
      params.append("state", state)
    }

    return `https://github.com/login/oauth/authorize?${params.toString()}`
  }
}
