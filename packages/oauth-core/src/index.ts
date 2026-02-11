/**
 * OAuth Core - Secure Multi-Tenant OAuth System
 *
 * Main entry point and public API
 */

import { oauthAudit } from "./audit"
import { isRefreshable, isRevocable } from "./providers/base"
import { getProvider } from "./providers/index"
import { createRefreshLockManager, type IRefreshLockManager } from "./refresh-lock"
import { LockboxAdapter, type LockboxAdapterConfig } from "./storage"
import {
  OAUTH_TOKENS_NAMESPACE,
  type OAuthManagerConfig,
  type OAuthTokens,
  type ProviderConfig,
  USER_ENV_KEYS_NAMESPACE,
} from "./types"

export class OAuthManager {
  private storage: LockboxAdapter
  private config: OAuthManagerConfig
  private lockManager: IRefreshLockManager

  // Token expiry buffer to prevent edge cases where token expires during request
  private static readonly TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

  constructor(config?: OAuthManagerConfig) {
    // If no config provided, use defaults for backwards compatibility
    this.config = config || {
      provider: "default",
      instanceId: "default",
      namespace: OAUTH_TOKENS_NAMESPACE,
      environment: process.env.NODE_ENV || "production",
      defaultTtlSeconds: undefined,
    }

    // Create storage adapter with instance configuration
    const storageConfig: LockboxAdapterConfig = {
      instanceId: this.config.instanceId,
      defaultTtlSeconds: this.config.defaultTtlSeconds,
    }
    this.storage = new LockboxAdapter(storageConfig)

    // Use injected lock manager or create one from config/defaults
    this.lockManager = this.config.lockManager || createRefreshLockManager(this.config.lockManagerConfig)
  }

  /**
   * Get the lock manager instance (useful for testing/monitoring)
   * @returns The refresh lock manager instance
   */
  getLockManager(): IRefreshLockManager {
    return this.lockManager
  }

  /**
   * Get the current instance configuration
   * @returns The OAuth manager configuration
   */
  getConfig(): OAuthManagerConfig {
    return this.config
  }

  /**
   * Get the instance ID for this OAuth manager
   * @returns The instance identifier
   */
  getInstanceId(): string {
    return this.config.instanceId
  }

  // ------------------------------------------------------------------
  // TENANT CONFIGURATION (Provider Credentials)
  // ------------------------------------------------------------------

  /**
   * Stores OAuth app credentials for a tenant
   *
   * @param tenantUserId - Tenant owner's user ID
   * @param provider - Provider name (e.g., "github")
   * @param config - Client ID, secret, and optional redirect URI
   *
   * @example
   * await oauth.setProviderConfig('tenant-123', 'github', {
   *   client_id: 'Iv1.abc123',
   *   client_secret: 'secret_xyz',
   *   redirect_uri: 'https://myapp.com/auth/callback'
   * });
   */
  async setProviderConfig(tenantUserId: string, provider: string, config: ProviderConfig): Promise<void> {
    // Verify provider exists
    getProvider(provider)

    await this.storage.save(tenantUserId, "provider_config", `${provider}_client_id`, config.client_id)

    await this.storage.save(tenantUserId, "provider_config", `${provider}_client_secret`, config.client_secret)

    if (config.redirect_uri) {
      await this.storage.save(tenantUserId, "provider_config", `${provider}_redirect_uri`, config.redirect_uri)
    }
  }

  /**
   * Retrieves OAuth app credentials for a tenant
   *
   * @param tenantUserId - Tenant owner's user ID
   * @param provider - Provider name
   * @returns Provider config or null if not configured
   */
  async getProviderConfig(tenantUserId: string, provider: string): Promise<ProviderConfig | null> {
    const [clientId, clientSecret, redirectUri] = await Promise.all([
      this.storage.get(tenantUserId, "provider_config", `${provider}_client_id`),
      this.storage.get(tenantUserId, "provider_config", `${provider}_client_secret`),
      this.storage.get(tenantUserId, "provider_config", `${provider}_redirect_uri`),
    ])

    if (!clientId || !clientSecret) {
      return null
    }

    return {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri || undefined,
    }
  }

  /**
   * Deletes OAuth app credentials for a tenant
   *
   * @param tenantUserId - Tenant owner's user ID
   * @param provider - Provider name
   */
  async deleteProviderConfig(tenantUserId: string, provider: string): Promise<void> {
    const names = [`${provider}_client_id`, `${provider}_client_secret`, `${provider}_redirect_uri`]

    await Promise.all(names.map(name => this.storage.delete(tenantUserId, "provider_config", name)))
  }

  // ------------------------------------------------------------------
  // USER AUTHENTICATION FLOW
  // ------------------------------------------------------------------

  /**
   * Handles OAuth callback - exchanges code for tokens and stores them
   *
   * @param tenantUserId - Tenant owner (who owns the OAuth app)
   * @param authenticatingUserId - End user who is authenticating
   * @param provider - Provider name (e.g., "github")
   * @param code - Authorization code from OAuth callback
   * @returns Result with success status and token scopes
   *
   * @example
   * // In your /auth/callback route
   * const result = await oauth.handleCallback(
   *   'tenant-123',
   *   'user-456',
   *   'github',
   *   req.query.code
   * );
   */
  async handleCallback(
    tenantUserId: string,
    authenticatingUserId: string,
    provider: string,
    code: string,
    /** Override redirect URI - MUST match the URI used during authorization */
    redirectUriOverride?: string,
    /** PKCE code_verifier - required if PKCE was used during authorization */
    codeVerifier?: string,
  ): Promise<{ success: boolean; scopes?: string }> {
    // Start audit trail
    const correlationId = oauthAudit.authInitiated(provider, authenticatingUserId, tenantUserId)

    try {
      // 1. Get OAuth app credentials - try database first, then env vars
      let config = await this.getProviderConfig(tenantUserId, provider)

      // Fall back to environment variables for system-wide OAuth apps
      if (!config) {
        const envClientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`]
        const envClientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]
        const envRedirectUri = process.env[`${provider.toUpperCase()}_REDIRECT_URI`]

        if (envClientId && envClientSecret) {
          config = {
            client_id: envClientId,
            client_secret: envClientSecret,
            // Use override redirect URI (from request context) or fall back to env var
            redirect_uri: redirectUriOverride || envRedirectUri || undefined,
          }
        }
      }

      // If config exists but no redirect URI, use override
      if (config && redirectUriOverride && !config.redirect_uri) {
        config.redirect_uri = redirectUriOverride
      } else if (config && redirectUriOverride && config.redirect_uri !== redirectUriOverride) {
        // Override takes precedence - this happens when app.sonno.tech calls but env has different domain
        config.redirect_uri = redirectUriOverride
      }

      if (!config) {
        const error = `OAuth not configured for '${provider}'. Set environment variables or configure in database.`
        oauthAudit.authFailed(provider, error, { userId: authenticatingUserId, tenantId: tenantUserId, correlationId })
        throw new Error(error)
      }

      // 2. Get provider instance and exchange code for tokens
      const oauthProvider = getProvider(provider)
      const tokens = await oauthProvider.exchangeCode(
        code,
        config.client_id,
        config.client_secret,
        config.redirect_uri,
        {
          code_verifier: codeVerifier,
        },
      )

      // 3. Try to get user email for debugging (Google-specific)
      let userEmail: string | undefined
      if (provider === "google" && "getUserInfo" in oauthProvider) {
        try {
          const userInfo = await (oauthProvider as any).getUserInfo(tokens.access_token)
          userEmail = userInfo?.email
        } catch (e) {
          // Non-critical, just log
          console.warn(`[OAuth] Failed to fetch user email for ${provider}:`, e)
        }
      }

      // 4. Store tokens for the authenticating user (with email if available)
      await this.saveTokens(authenticatingUserId, provider, tokens, userEmail)

      // Audit: auth completed
      oauthAudit.authCompleted(provider, authenticatingUserId, {
        tenantId: tenantUserId,
        correlationId,
        hasRefreshToken: !!tokens.refresh_token,
      })

      return { success: true, scopes: tokens.scope }
    } catch (error) {
      // Audit: auth failed (if not already logged above)
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (!errorMessage.includes("OAuth not configured")) {
        oauthAudit.authFailed(provider, errorMessage, {
          userId: authenticatingUserId,
          tenantId: tenantUserId,
          correlationId,
        })
      }
      throw error
    }
  }

  /**
   * Gets a user's access token for a provider (with transparent auto-refresh)
   *
   * @param userId - User ID
   * @param provider - Provider name
   * @returns Valid access token
   * @throws Error if user not connected to provider or refresh fails
   *
   * @example
   * const token = await oauth.getAccessToken('user-456', 'linear');
   * // Use with Linear API
   * fetch('https://api.linear.app/graphql', {
   *   headers: { Authorization: `Bearer ${token}` }
   * });
   */
  async getAccessToken(userId: string, provider: string): Promise<string> {
    // Read encrypted JSON blob
    const tokenBlob = await this.storage.get(userId, OAUTH_TOKENS_NAMESPACE, provider)

    if (!tokenBlob) {
      throw new Error(`User ${userId} is not connected to '${provider}'`)
    }

    // Parse token data
    let tokenData: {
      access_token: string
      refresh_token: string | null
      expires_at: string | null
      scope?: string | null
      token_type?: string
    }

    try {
      tokenData = JSON.parse(tokenBlob)
    } catch (error) {
      throw new Error(
        `Failed to parse token data for '${provider}': ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }

    // Check if token needs refresh
    // Note: expires_at now stores "should refresh at" time (already includes buffer)
    const now = Date.now()

    if (tokenData.expires_at) {
      const shouldRefreshAt = new Date(tokenData.expires_at).getTime()

      if (now >= shouldRefreshAt) {
        // Token expired or expiring soon - attempt refresh
        if (!tokenData.refresh_token) {
          throw new Error(
            `Access token for '${provider}' has expired and no refresh token is available. User must re-authenticate.`,
          )
        }

        // Get provider instance to refresh token
        const oauthProvider = getProvider(provider)

        // Use type guard to check refresh capability
        if (!isRefreshable(oauthProvider)) {
          throw new Error(`Provider '${provider}' does not support token refresh. User must re-authenticate.`)
        }

        // Get provider config (client credentials)
        // Note: For system-wide OAuth apps, we'd use env vars here instead
        // For now, assume we have LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET in env
        const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`]
        const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]

        if (!clientId || !clientSecret) {
          throw new Error(
            `Missing OAuth credentials for '${provider}'. Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET.`,
          )
        }

        // Use lock manager to prevent concurrent refresh attempts
        const lockKey = `${userId}:${provider}`

        // Audit: token refresh started
        const correlationId = oauthAudit.tokenRefreshStarted(provider, userId)

        try {
          const newAccessToken = await this.lockManager.withLock(lockKey, async () => {
            // Double-check if token is still expired (another request might have refreshed it)
            const recentTokenBlob = await this.storage.get(userId, OAUTH_TOKENS_NAMESPACE, provider)
            if (recentTokenBlob) {
              try {
                const recentTokenData = JSON.parse(recentTokenBlob)
                if (recentTokenData.expires_at) {
                  const shouldRefreshAt = new Date(recentTokenData.expires_at).getTime()
                  if (Date.now() < shouldRefreshAt) {
                    // Token was refreshed by another request, use it
                    return recentTokenData.access_token
                  }
                }
              } catch {
                // Corrupted token blob - ignore and proceed with refresh
              }
            }

            // Proceed with refresh (we already checked it's refreshable above)
            const newTokens = await oauthProvider.refreshToken(tokenData.refresh_token!, clientId, clientSecret)

            // CRITICAL: Preserve the original refresh token if provider doesn't return a new one
            // Google OAuth does NOT return a new refresh_token on refresh - we must keep the original
            const refreshTokenToStore = newTokens.refresh_token || tokenData.refresh_token || undefined

            // Save the new tokens atomically, preserving refresh token
            await this.saveTokens(userId, provider, {
              ...newTokens,
              refresh_token: refreshTokenToStore,
            })

            // Return the new access token
            return newTokens.access_token
          })

          // Audit: token refresh completed
          oauthAudit.tokenRefreshCompleted(provider, userId, correlationId)

          return newAccessToken
        } catch (error) {
          // Audit: token refresh failed
          const errorMessage = error instanceof Error ? error.message : String(error)
          oauthAudit.tokenRefreshFailed(provider, userId, errorMessage, correlationId)

          throw new Error(`Token refresh failed for '${provider}': ${errorMessage}. User may need to re-authenticate.`)
        }
      }
    }

    // Token is still valid, return it
    return tokenData.access_token
  }

  /**
   * Calculates safe expiry timestamp with buffer
   * Pattern from OpenClaw: subtract buffer and ensure minimum floor
   */
  private static coerceExpiresAt(expiresInSeconds: number, now: number = Date.now()): number {
    // Subtract 5-minute buffer to refresh before actual expiry
    const value = now + Math.max(0, Math.floor(expiresInSeconds)) * 1000 - OAuthManager.TOKEN_EXPIRY_BUFFER_MS
    // Ensure at least 30 seconds from now (safety floor)
    return Math.max(value, now + 30_000)
  }

  /**
   * Saves OAuth tokens for a user (Atomic JSON Blob Pattern)
   *
   * @param userId - User ID
   * @param provider - Provider name
   * @param tokens - OAuth tokens to store
   * @param email - Optional user email for debugging
   */
  async saveTokens(userId: string, provider: string, tokens: OAuthTokens, email?: string): Promise<void> {
    const now = Date.now()

    // Calculate expiry timestamp with buffer (OpenClaw pattern)
    // This stores the time when we SHOULD refresh, not when token actually expires
    const expiresAt = tokens.expires_in
      ? new Date(OAuthManager.coerceExpiresAt(tokens.expires_in, now)).toISOString()
      : null

    // Create atomic JSON blob containing all token data
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: expiresAt,
      scope: tokens.scope || null,
      token_type: tokens.token_type || "Bearer",
      // Store when token was saved for debugging
      saved_at: new Date(now).toISOString(),
      // Store email for debugging (pattern from Google Calendar MCP)
      cached_email: email || null,
    }

    // Save as single encrypted JSON blob
    await this.storage.save(
      userId,
      OAUTH_TOKENS_NAMESPACE,
      provider, // Use provider name directly (e.g., 'linear', 'github')
      JSON.stringify(tokenData),
    )
  }

  /**
   * Gets refresh token for a user (if available)
   *
   * @param userId - User ID
   * @param provider - Provider name
   * @returns Refresh token or null
   */
  async getRefreshToken(userId: string, provider: string): Promise<string | null> {
    const tokenBlob = await this.storage.get(userId, OAUTH_TOKENS_NAMESPACE, provider)

    if (!tokenBlob) {
      return null
    }

    try {
      const tokenData = JSON.parse(tokenBlob)
      return tokenData.refresh_token || null
    } catch {
      return null
    }
  }

  /**
   * Checks if a user is connected to a provider
   *
   * @param userId - User ID
   * @param provider - Provider name
   * @returns true if user has an access token
   */
  async isConnected(userId: string, provider: string): Promise<boolean> {
    return this.storage.exists(userId, OAUTH_TOKENS_NAMESPACE, provider)
  }

  /**
   * Disconnects a user from a provider (removes all tokens)
   *
   * @param userId - User ID
   * @param provider - Provider name
   *
   * @example
   * await oauth.disconnect('user-456', 'linear');
   */
  async disconnect(userId: string, provider: string): Promise<void> {
    await this.storage.delete(userId, OAUTH_TOKENS_NAMESPACE, provider)
  }

  /**
   * Revokes a user's access token with the provider
   * (Also removes from local storage)
   *
   * @param tenantUserId - Tenant owner (for OAuth app credentials)
   * @param userId - User ID
   * @param provider - Provider name
   */
  async revoke(tenantUserId: string, userId: string, provider: string): Promise<void> {
    // 1. Get OAuth app credentials - try database first, then env vars
    let config = await this.getProviderConfig(tenantUserId, provider)

    // Fall back to environment variables for system-wide OAuth apps (e.g., Linear)
    if (!config) {
      const envClientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`]
      const envClientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]

      if (envClientId && envClientSecret) {
        config = {
          client_id: envClientId,
          client_secret: envClientSecret,
        }
      }
    }

    if (!config) {
      throw new Error(`OAuth not configured for '${provider}'. Set environment variables or configure in database.`)
    }

    // 2. Get user's access token
    const token = await this.getAccessToken(userId, provider)

    // 3. Revoke with provider (if supported)
    const oauthProvider = getProvider(provider)
    if (isRevocable(oauthProvider)) {
      await oauthProvider.revokeToken(token, config.client_id, config.client_secret)
    }

    // 4. Remove from local storage
    await this.disconnect(userId, provider)

    // Audit: token revoked
    oauthAudit.tokenRevoked(provider, userId, { tenantId: tenantUserId })
  }

  // ------------------------------------------------------------------
  // USER ENVIRONMENT KEYS
  // ------------------------------------------------------------------

  /**
   * Saves a custom environment key for a user
   * These keys can be used by MCP servers for user-provided API keys
   *
   * @param userId - User ID
   * @param keyName - Key name (e.g., "OPENAI_API_KEY", "MY_SERVICE_TOKEN")
   * @param keyValue - The secret value to store
   *
   * @example
   * await oauth.setUserEnvKey('user-123', 'OPENAI_API_KEY', 'sk-...');
   */
  async setUserEnvKey(userId: string, keyName: string, keyValue: string): Promise<void> {
    // Validate key name format (alphanumeric + underscores, must start with letter)
    if (!/^[A-Z][A-Z0-9_]*$/.test(keyName)) {
      throw new Error(
        `Invalid key name '${keyName}'. Must be uppercase, start with a letter, and contain only letters, numbers, and underscores.`,
      )
    }

    await this.storage.save(userId, USER_ENV_KEYS_NAMESPACE, keyName, keyValue)
  }

  /**
   * Gets a specific environment key for a user
   *
   * @param userId - User ID
   * @param keyName - Key name (e.g., "OPENAI_API_KEY")
   * @returns The key value or null if not found
   */
  async getUserEnvKey(userId: string, keyName: string): Promise<string | null> {
    return this.storage.get(userId, USER_ENV_KEYS_NAMESPACE, keyName)
  }

  /**
   * Gets all environment keys for a user (values decrypted)
   *
   * @param userId - User ID
   * @returns Map of key names to values
   */
  async getAllUserEnvKeys(userId: string): Promise<Record<string, string>> {
    const secrets = await this.storage.list(userId, USER_ENV_KEYS_NAMESPACE)
    const result: Record<string, string> = {}

    // Fetch and decrypt each key value
    for (const secret of secrets) {
      const value = await this.storage.get(userId, USER_ENV_KEYS_NAMESPACE, secret.name)
      if (value) {
        result[secret.name] = value
      }
    }

    return result
  }

  /**
   * Lists environment key names for a user (without values)
   *
   * @param userId - User ID
   * @returns Array of key names
   */
  async listUserEnvKeyNames(userId: string): Promise<string[]> {
    const secrets = await this.storage.list(userId, USER_ENV_KEYS_NAMESPACE)
    return secrets.map(s => s.name)
  }

  /**
   * Deletes an environment key for a user
   *
   * @param userId - User ID
   * @param keyName - Key name to delete
   */
  async deleteUserEnvKey(userId: string, keyName: string): Promise<void> {
    await this.storage.delete(userId, USER_ENV_KEYS_NAMESPACE, keyName)
  }

  /**
   * Checks if a user has a specific environment key
   *
   * @param userId - User ID
   * @param keyName - Key name
   * @returns true if the key exists
   */
  async hasUserEnvKey(userId: string, keyName: string): Promise<boolean> {
    return this.storage.exists(userId, USER_ENV_KEYS_NAMESPACE, keyName)
  }

  // ------------------------------------------------------------------
  // UTILITIES
  // ------------------------------------------------------------------

  /**
   * Gets the authorization URL to redirect users to
   *
   * @param tenantUserId - Tenant owner
   * @param provider - Provider name
   * @param scope - Space-separated scopes
   * @param state - CSRF protection state
   * @returns Authorization URL
   *
   * @example
   * const authUrl = await oauth.getAuthUrl(
   *   'tenant-123',
   *   'github',
   *   'repo user',
   *   'random-state-123'
   * );
   * // Redirect user to authUrl
   */
  async getAuthUrl(tenantUserId: string, provider: string, scope: string, state?: string): Promise<string> {
    // Try database config first, then fall back to environment variables
    let config = await this.getProviderConfig(tenantUserId, provider)

    // Fall back to environment variables for system-wide OAuth apps
    if (!config) {
      const envClientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`]
      const envClientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]
      const envRedirectUri = process.env[`${provider.toUpperCase()}_REDIRECT_URI`]

      if (envClientId && envClientSecret) {
        config = {
          client_id: envClientId,
          client_secret: envClientSecret,
          redirect_uri: envRedirectUri || undefined,
        }
      }
    }

    if (!config) {
      throw new Error(`OAuth not configured for '${provider}'. Set environment variables or configure in database.`)
    }

    const oauthProvider = getProvider(provider)
    // getAuthUrl is now required in OAuthProviderCore, no need to check
    return oauthProvider.getAuthUrl(config.client_id, config.redirect_uri || "", scope, state)
  }
}

// Factory function for creating OAuth instances with proper configuration
export function createOAuthManager(config: OAuthManagerConfig): OAuthManager {
  return new OAuthManager(config)
}

// Helper to build instance ID for different scenarios
export function buildInstanceId(
  provider: string,
  environment: string,
  tenantId?: string,
  runId?: string,
  workerIndex?: number,
): string {
  const parts = [provider, environment]

  if (tenantId) {
    parts.push(tenantId)
  }

  if (runId) {
    parts.push(runId)
  }

  if (workerIndex !== undefined) {
    parts.push(`w${workerIndex}`)
  }

  return parts.join(":")
}

// Singleton instance for backwards compatibility
// DEPRECATED: Use createOAuthManager() or new OAuthManager() with explicit config instead
// The web app uses this singleton pattern throughout
export const oauth = new OAuthManager()

export {
  ConsoleAuditLogger,
  NoopAuditLogger,
  type OAuthAuditEvent,
  type OAuthAuditEventType,
  type OAuthAuditLogger,
  oauthAudit,
} from "./audit"
// Dynamic Client Registration (RFC 7591)
export {
  type AuthorizationServerMetadata,
  AuthorizationServerMetadataSchema,
  type ClientRegistrationResponse,
  ClientRegistrationResponseSchema,
  discoverAuthorizationServer,
  type OAuth2GrantType,
  registerClient,
  selectBestAuthMethod,
  type TokenEndpointAuthMethod,
} from "./dynamic-client-registration"
export { FetchRetryError, type FetchWithRetryOptions, fetchWithRetry } from "./fetch-with-retry"
export {
  CURRENT_KEY_VERSION,
  deriveKey,
  type EncryptionMetadata,
  getKeyForVersion,
  type KeyDerivationContext,
  type KeyVersion,
  parseMetadata,
  serializeMetadata,
} from "./key-derivation"
// PKCE support (learned from n8n)
export { generatePKCEChallenge, type PKCEChallenge, verifyPKCEChallenge } from "./pkce"
// Extended provider options
export type {
  OAuthProvider,
  OAuthProviderCore,
  OAuthRefreshable,
  OAuthRevocable,
  PKCEOptions,
  TokenExchangeOptions,
} from "./providers/base"
export { isRefreshable, isRevocable } from "./providers/base"
export { GitHubProvider } from "./providers/github"
export { type GoogleAuthOptions, GoogleProvider, type GoogleUserInfo } from "./providers/google"
export { getProvider, hasProvider, listProviders, registerProvider } from "./providers/index"
export { LINEAR_SCOPES, LinearProvider } from "./providers/linear"
export { STRIPE_SCOPES, StripeProvider, type StripeTokenResponse } from "./providers/stripe"
export {
  createRefreshLockManager,
  InMemoryRefreshLockManager,
  type IRefreshLockManager,
  type LockStrategy,
  RedisRefreshLockManager,
} from "./refresh-lock"
export type { EncryptedPayloadV2 } from "./security"
export { Security } from "./security"
export { LockboxAdapter, type LockboxAdapterConfig } from "./storage"
// Re-export types and utilities
// Extended types
export type {
  EncryptedPayload,
  LockManagerConfig,
  OAuthManagerConfig,
  OAuthTokens,
  OAuthTokensWithMetadata,
  ProviderConfig,
  SecretNamespace,
  TokenRotationResult,
  UserSecret,
} from "./types"
export { OAUTH_TOKENS_NAMESPACE, USER_ENV_KEYS_NAMESPACE } from "./types"
