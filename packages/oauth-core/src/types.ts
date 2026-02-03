/**
 * OAuth Core Type Definitions
 */

import type { IRefreshLockManager, LockStrategy } from "./refresh-lock"

export type SecretNamespace = "provider_config" | "oauth_tokens" | "oauth_connections" | "user_env_keys"

/**
 * Namespace for OAuth token storage
 * MUST match what the integrations.get_available_integrations RPC expects
 */
export const OAUTH_TOKENS_NAMESPACE: SecretNamespace = "oauth_connections"

/**
 * Namespace for user-defined environment keys
 * Used for custom API keys (e.g., OpenAI, custom services) that users want MCPs to access
 */
export const USER_ENV_KEYS_NAMESPACE: SecretNamespace = "user_env_keys"

/**
 * Lock manager configuration options
 */
export interface LockManagerConfig {
  /** Lock strategy: "memory", "redis", or "auto" (default: "auto") */
  strategy?: LockStrategy
  /** Redis URL for distributed locking (required if strategy is "redis") */
  redisUrl?: string
}

/**
 * OAuth Manager configuration for instance-aware operations
 */
export interface OAuthManagerConfig {
  provider: string // 'linear', 'github', ...
  instanceId: string // maps to lockbox.*.instance_id
  namespace: string // e.g. 'oauth_connections'
  environment: string // 'local' | 'dev' | 'staging' | 'prod' | 'test'
  defaultTtlSeconds?: number // optional, for user_secrets.expires_at

  /**
   * Inject a custom lock manager instance (for DI/testing).
   * If not provided, one will be created using lockManagerConfig or defaults.
   */
  lockManager?: IRefreshLockManager

  /**
   * Configuration for creating the lock manager (ignored if lockManager is provided)
   */
  lockManagerConfig?: LockManagerConfig
}

export interface EncryptedPayload {
  ciphertext: string // Postgres bytea format: "\x..."
  iv: string // 12 bytes in hex
  authTag: string // 16 bytes in hex
}

export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

/**
 * Extended OAuth tokens with PKCE and metadata
 * Learned from n8n's OAuth2CredentialData pattern
 */
export interface OAuthTokensWithMetadata extends OAuthTokens {
  /** Grant type used to obtain tokens */
  grant_type?: "authorization_code" | "client_credentials" | "refresh_token" | "pkce"
  /** Token endpoint auth method */
  authentication?: "header" | "body"
  /** PKCE code verifier (stored for token exchange) */
  code_verifier?: string
  /** Timestamp when token was obtained */
  obtained_at?: number
  /** Calculated expiry timestamp */
  expires_at?: number
}

/**
 * Token rotation result (for atomic refresh operations)
 * Learned from n8n's McpOAuthTokenService.validateAndRotateRefreshToken
 */
export interface TokenRotationResult {
  old_access_token?: string
  new_tokens: OAuthTokens
  rotated_at: number
}

export interface ProviderConfig {
  client_id: string
  client_secret: string
  redirect_uri?: string
}

export interface UserSecret {
  user_secret_id: string
  user_id: string
  instance_id?: string // Instance identifier for multi-tenant isolation
  namespace: string
  name: string
  ciphertext: string
  iv: string
  auth_tag: string
  version: number
  is_current: boolean
  scope: string | null // OAuth scope string or null
  expires_at?: string | null // TTL for automatic cleanup
  last_used_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

// GraphQL error type for API responses
export interface GraphQLError {
  message?: string
  extensions?: Record<string, unknown>
}
