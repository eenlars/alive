/**
 * Stripe Connect OAuth Provider
 *
 * Implements OAuth 2.0 flow for Stripe Connect
 * Docs: https://docs.stripe.com/connect/oauth-reference
 *
 * Note: Stripe uses API secret key as client_secret for authentication
 * Stripe Connect supports token refresh but not PKCE
 */

import type { OAuthProviderCore, OAuthRefreshable, OAuthRevocable, PKCEOptions, TokenExchangeOptions } from "./base"
import type { OAuthTokens } from "../types"
import { fetchWithRetry } from "../fetch-with-retry"

export const STRIPE_SCOPES = ["read_write", "read_only"] as const

/**
 * Extended token response from Stripe Connect
 * Includes additional Stripe-specific fields
 */
export interface StripeTokenResponse extends OAuthTokens {
  /** Connected Stripe account ID (acct_xxx) */
  stripe_user_id?: string
  /** Whether this is a live or test mode token */
  livemode?: boolean
  /** Stripe publishable key (if applicable) */
  stripe_publishable_key?: string
}

export class StripeProvider implements OAuthProviderCore, OAuthRefreshable, OAuthRevocable {
  name = "stripe"

  /**
   * Generates Stripe Connect authorization URL
   *
   * @param clientId - Stripe Connect Client ID (ca_xxx from Connect settings)
   * @param redirectUri - Callback URL (must match Stripe app config)
   * @param scope - Scope: "read_write" (default) or "read_only"
   * @param state - Random state for CSRF protection
   * @param _pkce - Not supported by Stripe Connect (ignored)
   * @returns Authorization URL to redirect user to
   */
  getAuthUrl(clientId: string, redirectUri: string, scope: string, state?: string, _pkce?: PKCEOptions): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scope || "read_write",
    })

    if (state) {
      params.append("state", state)
    }

    return `https://connect.stripe.com/oauth/authorize?${params.toString()}`
  }

  /**
   * Exchanges authorization code for Stripe Connect access token
   *
   * Note: Stripe uses the API secret key as client_secret for authentication
   */
  async exchangeCode(
    code: string,
    _clientId: string,
    clientSecret: string,
    _redirectUri?: string,
    options?: TokenExchangeOptions,
  ): Promise<StripeTokenResponse> {
    const params = new URLSearchParams({
      code,
      grant_type: "authorization_code",
    })

    // Additional body params support (n8n pattern)
    if (options?.additionalBodyParams) {
      for (const [key, value] of Object.entries(options.additionalBodyParams)) {
        params.append(key, value)
      }
    }

    const res = await fetchWithRetry(
      "https://connect.stripe.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          // Stripe uses API key as Basic Auth or in body
          Authorization: `Bearer ${clientSecret}`,
        },
        body: params.toString(),
      },
      { label: "Stripe" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Stripe OAuth failed: ${res.status} ${error}`)
    }

    const data = await res.json()

    if (data.error) {
      throw new Error(`Stripe OAuth error: ${data.error_description || data.error}`)
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      scope: data.scope,
      token_type: data.token_type || "Bearer",
      stripe_user_id: data.stripe_user_id,
      livemode: data.livemode,
      stripe_publishable_key: data.stripe_publishable_key,
      // Stripe Connect tokens don't expire by default, but we include expires_in if provided
      expires_in: data.expires_in,
    }
  }

  /**
   * Refreshes a Stripe Connect access token
   *
   * Stripe supports token refresh for connected accounts
   */
  async refreshToken(refreshToken: string, _clientId: string, clientSecret: string): Promise<StripeTokenResponse> {
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })

    const res = await fetchWithRetry(
      "https://connect.stripe.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: `Bearer ${clientSecret}`,
        },
        body: params.toString(),
      },
      { label: "Stripe" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Stripe token refresh failed: ${res.status} ${error}`)
    }

    const data = await res.json()

    if (data.error) {
      throw new Error(`Stripe refresh error: ${data.error_description || data.error}`)
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // Reuse if not provided
      scope: data.scope,
      token_type: data.token_type || "Bearer",
      stripe_user_id: data.stripe_user_id,
      livemode: data.livemode,
      stripe_publishable_key: data.stripe_publishable_key,
      expires_in: data.expires_in,
    }
  }

  /**
   * Revokes a Stripe Connect access token (deauthorizes the connected account)
   *
   * POST to /oauth/deauthorize to disconnect the connected account
   */
  async revokeToken(_token: string, clientId: string, clientSecret: string, stripeUserId?: string): Promise<void> {
    if (!stripeUserId) {
      console.warn("[Stripe OAuth] No stripe_user_id provided for revocation, skipping API call")
      return
    }

    const params = new URLSearchParams({
      client_id: clientId,
      stripe_user_id: stripeUserId,
    })

    const res = await fetchWithRetry(
      "https://connect.stripe.com/oauth/deauthorize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${clientSecret}`,
        },
        body: params.toString(),
      },
      { label: "Stripe" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Stripe token revocation failed: ${res.status} ${error}`)
    }

    const data = await res.json()

    if (data.error) {
      throw new Error(`Stripe deauthorize error: ${data.error_description || data.error}`)
    }
  }

  /**
   * Gets the connected Stripe account info
   * Useful for verifying the connection works and getting account details
   */
  async getAccountInfo(accessToken: string): Promise<{
    id: string
    email?: string
    business_name?: string
    charges_enabled: boolean
    payouts_enabled: boolean
  }> {
    const res = await fetchWithRetry(
      "https://api.stripe.com/v1/account",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      { label: "Stripe" },
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Stripe API failed: ${res.status} ${error}`)
    }

    const data = await res.json()

    return {
      id: data.id,
      email: data.email,
      business_name: data.business_profile?.name || data.settings?.dashboard?.display_name,
      charges_enabled: data.charges_enabled,
      payouts_enabled: data.payouts_enabled,
    }
  }
}
