/**
 * OAuth Instance Factory
 *
 * Provides properly configured OAuth manager instances for different providers
 * and environments. Uses a generic factory pattern - no per-provider boilerplate.
 *
 * SINGLE SOURCE OF TRUTH: packages/shared/src/mcp-providers.ts
 */

import { buildInstanceId, createOAuthManager, type OAuthManagerConfig } from "@webalive/oauth-core"
import {
  type AllOAuthProviderKey,
  isValidOAuthProviderKey,
  OAUTH_MCP_PROVIDERS,
  OAUTH_ONLY_PROVIDERS,
} from "@webalive/shared"

/**
 * Get the current environment from environment variables
 */
function getCurrentEnvironment(): string {
  const env = process.env.BRIDGE_ENV || process.env.NODE_ENV || "production"

  // Normalize environment names
  switch (env) {
    case "development":
      return "dev"
    case "test":
      return "test"
    case "staging":
      return "staging"
    case "production":
    case "prod":
      return "prod"
    case "local":
      return "local"
    default:
      console.warn(`Unknown environment: ${env}, defaulting to dev`)
      return "dev"
  }
}

/**
 * Get TTL based on environment
 */
function getDefaultTtl(environment: string): number | undefined {
  switch (environment) {
    case "test":
      return 600 // 10 minutes for tests
    case "local":
    case "dev":
      return 3600 // 1 hour for development
    case "staging":
      return 86400 // 24 hours for staging
    case "prod":
      return undefined // No TTL in production
    default:
      return 3600 // Default to 1 hour
  }
}

/**
 * Generic factory to create OAuth manager for any provider
 */
function createProviderOAuthManager(provider: AllOAuthProviderKey): ReturnType<typeof createOAuthManager> {
  const environment = getCurrentEnvironment()
  const instanceId = buildInstanceId(provider, environment)

  const config: OAuthManagerConfig = {
    provider,
    instanceId,
    namespace: "oauth_connections",
    environment,
    defaultTtlSeconds: getDefaultTtl(environment),
  }

  return createOAuthManager(config)
}

/**
 * Create an OAuth manager for E2E tests
 */
export function createE2EOAuthManager(
  provider: string,
  runId: string,
  workerIndex: number,
): ReturnType<typeof createOAuthManager> {
  const instanceId = buildInstanceId(provider, "test", undefined, runId, workerIndex)

  const config: OAuthManagerConfig = {
    provider,
    instanceId,
    namespace: "oauth_connections",
    environment: "test",
    defaultTtlSeconds: 300, // 5 minutes for E2E tests
  }

  return createOAuthManager(config)
}

/**
 * Create a multi-tenant OAuth manager
 */
export function createTenantOAuthManager(provider: string, tenantId: string): ReturnType<typeof createOAuthManager> {
  const environment = getCurrentEnvironment()
  const instanceId = buildInstanceId(provider, environment, tenantId)

  const config: OAuthManagerConfig = {
    provider,
    instanceId,
    namespace: "oauth_connections",
    environment,
    defaultTtlSeconds: getDefaultTtl(environment),
  }

  return createOAuthManager(config)
}

// Dynamic singleton map - instances created on demand
const instances = new Map<AllOAuthProviderKey, ReturnType<typeof createOAuthManager>>()

/**
 * All supported OAuth providers (MCP + OAuth-only)
 */
const ALL_OAUTH_PROVIDERS = { ...OAUTH_MCP_PROVIDERS, ...OAUTH_ONLY_PROVIDERS }

/**
 * Get OAuth manager instance for any provider (singleton per provider)
 *
 * @param provider - Provider key (e.g., 'linear', 'stripe', 'google')
 * @returns OAuth manager instance
 * @throws Error if provider is not supported
 */
export function getOAuthInstance(provider: string): ReturnType<typeof createOAuthManager> {
  const key = provider.toLowerCase() as AllOAuthProviderKey
  if (!instances.has(key)) {
    if (!isValidOAuthProviderKey(key)) {
      throw new Error(
        `Unsupported OAuth provider: ${provider}. Valid providers: ${Object.keys(ALL_OAUTH_PROVIDERS).join(", ")}`,
      )
    }
    instances.set(key, createProviderOAuthManager(key))
  }
  return instances.get(key)!
}

// Backward-compatible named exports for existing code
export const getLinearOAuth = () => getOAuthInstance("linear")
export const getStripeOAuth = () => getOAuthInstance("stripe")
export const getGoogleOAuth = () => getOAuthInstance("google")

/**
 * Get OAuth manager for user environment keys operations
 * (not provider-specific, used for storing custom API keys)
 */
let userEnvKeysInstance: ReturnType<typeof createOAuthManager> | null = null

export function getUserEnvKeysManager(): ReturnType<typeof createOAuthManager> {
  if (!userEnvKeysInstance) {
    const environment = getCurrentEnvironment()
    const config: OAuthManagerConfig = {
      provider: "user-env-keys",
      instanceId: buildInstanceId("user-env-keys", environment),
      namespace: "user_env_keys",
      environment,
      defaultTtlSeconds: undefined, // No TTL for user keys
    }
    userEnvKeysInstance = createOAuthManager(config)
  }
  return userEnvKeysInstance
}

export type { OAuthProvider } from "./providers"
// Re-export client-safe provider constants
export { isOAuthProviderSupported, SUPPORTED_OAUTH_PROVIDERS } from "./providers"

// Export environment helper for debugging
export { getCurrentEnvironment }
