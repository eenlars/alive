/**
 * OAuth Warning Types
 *
 * Shared types for OAuth token warnings across frontend and backend.
 * Used when OAuth tokens fail to refresh or are revoked.
 *
 * Flow:
 * 1. fetchOAuthTokens() returns OAuthFetchResult with warnings
 * 2. Stream handler injects warnings as OAuthWarningContent
 * 3. Chat UI displays toast with action button
 *
 * @example
 * ```typescript
 * // Backend: Fetch tokens and collect warnings
 * const { tokens, warnings } = await fetchOAuthTokens(userId)
 *
 * // Stream: Inject warning into NDJSON stream
 * if (warnings.length > 0) {
 *   const warningContent: OAuthWarningContent = {
 *     category: "oauth",
 *     provider: warnings[0].provider,
 *     message: warnings[0].message,
 *     action: "Reconnect",
 *     actionUrl: "/settings?tab=integrations"
 *   }
 * }
 *
 * // Frontend: Display warning toast
 * toast(warning.message, { action: warning.action })
 * ```
 */

import type { OAuthMcpProviderKey, ProviderTokenMap } from "./mcp-providers.js"

/**
 * Warning category for routing/styling
 */
export type OAuthWarningCategory = "oauth" | "general"

/**
 * OAuth warning from token fetch operation
 * Returned by fetchOAuthTokens when a token refresh fails
 */
export interface OAuthWarning {
  /** Provider that failed (e.g., "linear", "stripe") */
  provider: OAuthMcpProviderKey
  /** Human-readable error message */
  message: string
  /** Whether user needs to re-authenticate */
  needsReauth: boolean
}

/**
 * Warning content for stream messages
 * Sent via bridge_warning synthetic message type
 */
export interface OAuthWarningContent {
  /** Warning category for routing */
  category: OAuthWarningCategory
  /** Provider that failed (optional for general warnings) */
  provider?: OAuthMcpProviderKey
  /** Human-readable message to display */
  message: string
  /** Action button text (e.g., "Reconnect") */
  action?: string
  /** URL for action button */
  actionUrl?: string
}

/**
 * Result from fetchOAuthTokens including warnings
 */
export interface OAuthFetchResult {
  /** Successfully fetched tokens (provider key → access token) */
  tokens: ProviderTokenMap
  /** Warnings for failed token fetches */
  warnings: OAuthWarning[]
}

/**
 * Capitalize provider key for display
 * @example "linear" -> "Linear", "stripe" -> "Stripe"
 */
export function formatProviderName(provider: OAuthMcpProviderKey): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}
