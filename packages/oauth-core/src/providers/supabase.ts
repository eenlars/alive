/**
 * Supabase OAuth Provider
 *
 * Implements OAuth 2.0 flow for Supabase Management API
 * Docs: https://supabase.com/docs/guides/platform/oauth-apps/build-a-supabase-integration
 *
 * Supabase OAuth provides:
 * - Full Management API access on behalf of user
 * - Access to all user's organizations and projects
 * - Ability to run SQL queries via /v1/projects/{ref}/database/query
 * - Token refresh support
 * - PKCE support (recommended)
 *
 * Note: Supabase OAuth doesn't use granular scopes - it grants full Management API access
 */

import { fetchWithRetry } from "../fetch-with-retry"
import type { OAuthTokens } from "../types"
import type { OAuthProviderCore, OAuthRefreshable, OAuthRevocable, PKCEOptions, TokenExchangeOptions } from "./base"

/**
 * Supabase-specific OAuth options
 */
export interface SupabaseAuthOptions {
  /** Pre-select an organization during authorization */
  organizationSlug?: string
}

/**
 * Supabase project info
 */
export interface SupabaseProject {
  id: string
  organization_id: string
  name: string
  region: string
  created_at: string
  database?: {
    host: string
    version: string
  }
}

/**
 * Supabase organization info
 */
export interface SupabaseOrganization {
  id: string
  name: string
  slug: string
  billing_email?: string
}

export class SupabaseProvider implements OAuthProviderCore, OAuthRefreshable, OAuthRevocable {
  name = "supabase"

  private static readonly BASE_URL = "https://api.supabase.com"
  private static readonly AUTH_URL = "https://api.supabase.com/v1/oauth/authorize"
  private static readonly TOKEN_URL = "https://api.supabase.com/v1/oauth/token"

  /**
   * Exchanges authorization code for Supabase access + refresh tokens
   *
   * Uses Basic auth with client_id:client_secret as recommended by Supabase
   */
  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri?: string,
    options?: TokenExchangeOptions,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
    })

    if (redirectUri) {
      params.append("redirect_uri", redirectUri)
    }

    // PKCE flow: add code_verifier
    if (options?.code_verifier) {
      params.append("code_verifier", options.code_verifier)
    }

    // Supabase uses Basic auth for token exchange
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

    const res = await fetchWithRetry(
      SupabaseProvider.TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
        body: params.toString(),
      },
      { label: "Supabase" },
    )

    const data = await res.json()

    if (!res.ok || data.error) {
      console.error("[Supabase OAuth] Token exchange failed:", {
        status: res.status,
        error: data.error,
        errorDescription: data.error_description,
        redirectUri: redirectUri || "(not provided)",
      })
      throw new Error(`Supabase OAuth failed: ${data.error_description || data.error || res.statusText}`)
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
   * Refreshes an expired access token
   */
  async refreshToken(refreshToken: string, clientId: string, clientSecret: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

    const res = await fetchWithRetry(
      SupabaseProvider.TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
        body: params.toString(),
      },
      { label: "Supabase" },
    )

    const data = await res.json()

    if (!res.ok || data.error) {
      const errorMsg = data.error_description || data.error || res.statusText
      if (data.error === "invalid_grant") {
        throw new Error(
          `Supabase token refresh failed: ${errorMsg}. The refresh token may have been revoked. User must re-authenticate.`,
        )
      }
      throw new Error(`Supabase token refresh failed: ${errorMsg}`)
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
   * Revokes a Supabase token
   *
   * Note: Check if Supabase supports token revocation endpoint
   * For now, we'll attempt the standard OAuth revocation
   */
  async revokeToken(token: string, clientId: string, clientSecret: string): Promise<void> {
    const params = new URLSearchParams({
      token,
      token_type_hint: "access_token",
    })

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

    const res = await fetchWithRetry(
      `${SupabaseProvider.BASE_URL}/v1/oauth/revoke`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: params.toString(),
      },
      { label: "Supabase" },
    )

    // If revocation endpoint doesn't exist (404), consider it successful
    // The token will expire naturally
    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => ({}))
      throw new Error(`Supabase token revocation failed: ${data.error_description || data.error || res.statusText}`)
    }
  }

  /**
   * Generates Supabase authorization URL
   *
   * @param clientId - Supabase OAuth App Client ID
   * @param redirectUri - Callback URL (must match OAuth app config)
   * @param scope - Not used by Supabase (grants full Management API access)
   * @param state - Random state for CSRF protection
   * @param pkce - PKCE challenge (recommended by Supabase)
   * @param options - Supabase-specific options
   */
  getAuthUrl(
    clientId: string,
    redirectUri: string,
    _scope: string, // Supabase doesn't use scopes
    state?: string,
    pkce?: PKCEOptions,
    options?: SupabaseAuthOptions,
  ): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
    })

    if (state) {
      params.append("state", state)
    }

    // PKCE is recommended by Supabase
    if (pkce) {
      params.append("code_challenge", pkce.code_challenge)
      params.append("code_challenge_method", pkce.code_challenge_method)
    }

    // Pre-select organization
    if (options?.organizationSlug) {
      params.append("organization_slug", options.organizationSlug)
    }

    return `${SupabaseProvider.AUTH_URL}?${params.toString()}`
  }

  /**
   * Lists all projects accessible to the user
   */
  async listProjects(accessToken: string): Promise<SupabaseProject[]> {
    const res = await fetchWithRetry(
      `${SupabaseProvider.BASE_URL}/v1/projects`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
      { label: "Supabase" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Failed to list Supabase projects: ${res.status} ${error || res.statusText}`)
    }

    return res.json()
  }

  /**
   * Lists all organizations accessible to the user
   */
  async listOrganizations(accessToken: string): Promise<SupabaseOrganization[]> {
    const res = await fetchWithRetry(
      `${SupabaseProvider.BASE_URL}/v1/organizations`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
      { label: "Supabase" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Failed to list Supabase organizations: ${res.status} ${error || res.statusText}`)
    }

    return res.json()
  }

  /**
   * Runs a SQL query on a Supabase project
   *
   * @param accessToken - Valid access token
   * @param projectRef - Project reference (from project URL)
   * @param query - SQL query to execute
   * @param readOnly - If true, only SELECT queries are allowed
   */
  async runQuery(
    accessToken: string,
    projectRef: string,
    query: string,
    readOnly = false,
  ): Promise<{ result: unknown[] }> {
    const res = await fetchWithRetry(
      `${SupabaseProvider.BASE_URL}/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query,
          read_only: readOnly,
        }),
      },
      { label: "Supabase" },
    )

    if (!res.ok) {
      const error = await res.json().catch(() => res.text())
      const errorMsg = typeof error === "object" ? JSON.stringify(error) : error
      throw new Error(`Supabase query failed: ${res.status} ${errorMsg}`)
    }

    return res.json()
  }

  /**
   * Gets a specific project's details
   */
  async getProject(accessToken: string, projectRef: string): Promise<SupabaseProject> {
    const res = await fetchWithRetry(
      `${SupabaseProvider.BASE_URL}/v1/projects/${projectRef}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
      { label: "Supabase" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Failed to get Supabase project: ${res.status} ${error || res.statusText}`)
    }

    return res.json()
  }

  /**
   * Gets API keys for a project
   */
  async getApiKeys(accessToken: string, projectRef: string): Promise<Array<{ name: string; api_key: string }>> {
    const res = await fetchWithRetry(
      `${SupabaseProvider.BASE_URL}/v1/projects/${projectRef}/api-keys`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
      { label: "Supabase" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Failed to get Supabase API keys: ${res.status} ${error || res.statusText}`)
    }

    return res.json()
  }
}
