/**
 * OAuth Token Fetcher
 *
 * Fetches all OAuth tokens for MCP providers in parallel.
 * Uses the registry from @webalive/shared as the single source of truth.
 */

import {
  formatProviderName,
  OAUTH_MCP_PROVIDERS,
  type OAuthFetchResult,
  type OAuthMcpProviderKey,
  type OAuthWarning,
  type ProviderTokenMap,
} from "@webalive/shared"
import { getOAuthInstance } from "./oauth-instances"

interface Logger {
  log: (message: string) => void
}

/**
 * Fetches OAuth tokens for all registered MCP providers.
 * Only returns tokens for providers where the user has an active connection.
 * Also returns warnings for providers that need reconnection.
 *
 * @param userId - The user ID to fetch tokens for
 * @param logger - Optional logger for debugging
 * @returns Object with tokens and warnings
 *
 * @example
 * ```typescript
 * const { tokens, warnings } = await fetchOAuthTokens(user.id, logger)
 * // tokens: { stripe: "sk_...", linear: "lin_..." } - only connected providers
 * // warnings: [{ provider: "linear", message: "...", needsReauth: true }]
 * ```
 */
export async function fetchOAuthTokens(userId: string, logger?: Logger): Promise<OAuthFetchResult> {
  const tokens: ProviderTokenMap = {}
  const warnings: OAuthWarning[] = []

  // Fetch all tokens in parallel for performance
  const results = await Promise.allSettled(
    Object.entries(OAUTH_MCP_PROVIDERS).map(async ([key, config]) => {
      const providerKey = key as OAuthMcpProviderKey
      try {
        const oauth = getOAuthInstance(config.oauthKey)
        const token = await oauth.getAccessToken(userId, config.oauthKey)
        if (token) {
          return { providerKey, token, warning: null }
        }
        return { providerKey, token: null, warning: null }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        // Distinguish between expected "not connected" vs actionable errors
        if (errorMessage.includes("not connected to")) {
          // User simply hasn't connected this provider - this is normal
          return { providerKey, token: null, warning: null }
        }

        // Token refresh failures and other errors should be logged and warned
        // These indicate the user WAS connected but something went wrong
        let warning: OAuthWarning | null = null

        const displayName = formatProviderName(providerKey)

        if (errorMessage.includes("revoked") || errorMessage.includes("invalid_grant")) {
          logger?.log(`⚠️ ${providerKey} OAuth error: ${errorMessage}`)
          logger?.log(`   User needs to reconnect ${providerKey} in Settings > Integrations`)
          warning = {
            provider: providerKey,
            message: `Your ${displayName} connection has expired. Please reconnect in Settings > Integrations.`,
            needsReauth: true,
          }
        } else if (errorMessage.includes("refresh") || errorMessage.includes("expired")) {
          logger?.log(`⚠️ ${providerKey} OAuth error: ${errorMessage}`)
          warning = {
            provider: providerKey,
            message: `Your ${displayName} token refresh failed. Please reconnect in Settings > Integrations.`,
            needsReauth: true,
          }
        } else {
          // Log unexpected errors for debugging
          logger?.log(`${providerKey} OAuth fetch failed: ${errorMessage}`)
        }

        return { providerKey, token: null, warning }
      }
    }),
  )

  // Collect successful token fetches and warnings
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      const { providerKey, token, warning } = result.value
      if (token) {
        tokens[providerKey] = token
        logger?.log(`User has ${providerKey} OAuth connection`)
      }
      if (warning) {
        warnings.push(warning)
      }
    }
  }

  return { tokens, warnings }
}

/**
 * Get the set of connected provider keys from tokens object
 *
 * @param tokens - Provider token map
 * @returns Set of connected provider keys
 */
export function getConnectedProviders(tokens: ProviderTokenMap): Set<OAuthMcpProviderKey> {
  return new Set(
    Object.entries(tokens)
      .filter(([, token]) => !!token)
      .map(([key]) => key as OAuthMcpProviderKey),
  )
}

// Re-export types for convenience
export type { ProviderTokenMap, OAuthMcpProviderKey, OAuthWarning, OAuthFetchResult }
