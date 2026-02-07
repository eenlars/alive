/**
 * Server-side environment validation
 *
 * This file can safely use Node.js built-ins (fs, path, etc.)
 * Only import this in server components, API routes, or server actions.
 *
 * @example
 * ```typescript
 * // In API route or server component
 * import { env, loadEnvFile } from "@webalive/env/server"
 *
 * // Optional: explicitly load .env file (call once at app entry)
 * loadEnvFile()
 *
 * // Use validated env vars
 * const apiKey = env.ANTH_API_SECRET
 * ```
 */

import { existsSync } from "node:fs"
import { join } from "node:path"
import { config as loadDotenv } from "dotenv"
import { createEnv } from "@t3-oss/env-nextjs"
import { serverSchema, clientSchema, runtimeEnv } from "./schema"

/**
 * Explicitly load environment file
 *
 * Call this at your app's entry point if you need dotenv loading.
 * This is NOT called automatically on import (no side effects).
 *
 * @param nodeEnv - Environment name (defaults to NODE_ENV or "development")
 * @returns true if file was loaded, false if not found
 */
export function loadEnvFile(nodeEnv?: string): boolean {
  const envName = nodeEnv || process.env.NODE_ENV || "development"
  const envFile = join(process.cwd(), `.env.${envName}`)

  if (existsSync(envFile)) {
    loadDotenv({ path: envFile, override: true })
    return true
  }

  return false
}

/**
 * Server-side validated environment variables
 *
 * Includes both server and client schemas for SSR compatibility.
 * Validation runs on first access.
 */
export const env = createEnv({
  server: serverSchema,
  client: clientSchema,
  runtimeEnv,

  /**
   * Skip validation in certain environments
   */
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION ||
    process.env.npm_lifecycle_event === "lint" ||
    process.env.npm_lifecycle_event === "format",

  /**
   * Custom error handling
   */
  onValidationError: issues => {
    console.error("❌ Invalid environment variables:")
    console.error(issues)
    throw new Error("Invalid environment variables")
  },

  emptyStringAsUndefined: true,
})

/**
 * Get Anthropic API key with fallback logic
 *
 * Priority order:
 * 1. ANTHROPIC_API_KEY env var (explicit API key)
 * 2. ANTH_API_SECRET env var (legacy .env)
 * 3. OAuth token from ~/.claude/.credentials.json (auto-refreshed)
 * 4. Mock key for local development
 *
 * In local dev mode (STREAM_ENV=local), allows a mock key for testing.
 */
export function getAnthropicApiKey(): string {
  const apiKey = env.ANTHROPIC_API_KEY || env.ANTH_API_SECRET
  const isLocalDev = env.STREAM_ENV === "local"

  if (apiKey) {
    return apiKey
  }

  if (!isLocalDev) {
    throw new Error("ANTHROPIC_API_KEY or ANTH_API_SECRET is required (or set STREAM_ENV=local for development)")
  }

  return "sk-ant-mock-key-for-local-development"
}

/**
 * Default Redis URL for local development only
 */
const LOCAL_DEV_REDIS_URL = "redis://:dev_password_only@127.0.0.1:6379"

/**
 * Get Redis URL with environment-aware validation
 *
 * - Production/Staging: REDIS_URL is REQUIRED (throws if missing)
 * - Local dev (STREAM_ENV=local): Falls back to default dev password
 * - Standalone (BRIDGE_ENV=standalone): Returns null (Redis not required)
 *
 * This prevents auth mismatches in production while allowing easy local dev.
 */
export function getRedisUrl(): string | null {
  // Standalone mode - Redis not available
  if (env.BRIDGE_ENV === "standalone") {
    return null
  }

  const redisUrl = env.REDIS_URL
  const isLocalDev = env.STREAM_ENV === "local"

  if (!redisUrl && !isLocalDev) {
    throw new Error(
      "REDIS_URL is required in production/staging. " +
        "Set REDIS_URL environment variable or use STREAM_ENV=local for development.",
    )
  }

  return redisUrl || LOCAL_DEV_REDIS_URL
}

/**
 * Get superadmin emails with environment-aware validation
 *
 * - Production/Staging: SUPERADMIN_EMAILS is REQUIRED (throws if missing)
 * - Local dev (STREAM_ENV=local): Returns empty array (all users are effectively superadmin)
 *
 * This prevents the "no superadmin" scenario in production.
 */
export function getSuperadminEmails(): readonly string[] {
  const emailsEnv = env.SUPERADMIN_EMAILS
  const isLocalDev = env.STREAM_ENV === "local"

  if (!emailsEnv && !isLocalDev) {
    throw new Error(
      "SUPERADMIN_EMAILS is required in production/staging. " +
        "Set SUPERADMIN_EMAILS environment variable (comma-separated emails) or use STREAM_ENV=local for development.",
    )
  }

  if (!emailsEnv) {
    return []
  }

  return emailsEnv
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Get validated main domain
 *
 * - Required in all environments (no fallback)
 * - Throws on startup if misconfigured
 *
 * @throws Error if MAIN_DOMAIN is not configured
 */
export function getMainDomain(): string {
  const domain = env.MAIN_DOMAIN

  if (!domain) {
    throw new Error("MAIN_DOMAIN is required. Set the MAIN_DOMAIN environment variable.")
  }

  return domain
}

/**
 * Get validated wildcard domain
 *
 * - Required in all environments (no fallback)
 * - Throws on startup if misconfigured
 *
 * @throws Error if WILDCARD_DOMAIN is not configured
 */
export function getWildcardDomain(): string {
  const domain = env.WILDCARD_DOMAIN

  if (!domain) {
    throw new Error("WILDCARD_DOMAIN is required. Set the WILDCARD_DOMAIN environment variable.")
  }

  return domain
}

/**
 * Get validated preview base domain
 *
 * - Required in all environments (no fallback)
 * - Throws on startup if misconfigured
 *
 * @throws Error if PREVIEW_BASE is not configured
 */
export function getPreviewBase(): string {
  const domain = env.PREVIEW_BASE

  if (!domain) {
    throw new Error("PREVIEW_BASE is required. Set the PREVIEW_BASE environment variable.")
  }

  return domain
}

/**
 * Get validated cookie domain
 *
 * - Required in all environments (no fallback)
 * - Throws on startup if misconfigured
 *
 * @throws Error if COOKIE_DOMAIN is not configured
 */
export function getCookieDomain(): string {
  const domain = env.COOKIE_DOMAIN

  if (!domain) {
    throw new Error("COOKIE_DOMAIN is required. Set the COOKIE_DOMAIN environment variable.")
  }

  return domain
}

/**
 * Get validated production stream URL
 *
 * - Required in all environments (no fallback)
 * - Must be HTTPS
 * - Throws on startup if misconfigured
 *
 * @throws Error if STREAM_PROD_URL is not configured
 */
export function getStreamProdUrl(): string {
  const url = env.STREAM_PROD_URL

  if (!url) {
    throw new Error("STREAM_PROD_URL is required. Set the STREAM_PROD_URL environment variable.")
  }

  return url
}

/**
 * Get validated staging stream URL
 *
 * - Required in all environments (no fallback)
 * - Must be HTTPS
 * - Throws on startup if misconfigured
 *
 * @throws Error if STREAM_STAGING_URL is not configured
 */
export function getStreamStagingUrl(): string {
  const url = env.STREAM_STAGING_URL

  if (!url) {
    throw new Error("STREAM_STAGING_URL is required. Set the STREAM_STAGING_URL environment variable.")
  }

  return url
}

/**
 * Get validated development stream URL
 *
 * - Required in all environments (no fallback)
 * - Must be HTTPS
 * - Throws on startup if misconfigured
 *
 * @throws Error if STREAM_DEV_URL is not configured
 */
export function getStreamDevUrl(): string {
  const url = env.STREAM_DEV_URL

  if (!url) {
    throw new Error("STREAM_DEV_URL is required. Set the STREAM_DEV_URL environment variable.")
  }

  return url
}

/**
 * Get Flowglad secret key with environment-aware validation
 *
 * - Production/Staging: FLOWGLAD_SECRET_KEY is REQUIRED (throws if missing)
 * - Local dev (STREAM_ENV=local): Returns undefined (billing features disabled)
 *
 * This ensures billing integration works in deployed environments while
 * allowing local development without Flowglad credentials.
 */
export function getFlowgladSecretKey(): string | undefined {
  const secretKey = env.FLOWGLAD_SECRET_KEY
  const isLocalDev = env.STREAM_ENV === "local"

  if (!secretKey && !isLocalDev) {
    throw new Error(
      "FLOWGLAD_SECRET_KEY is required in production/staging. " +
        "Set FLOWGLAD_SECRET_KEY environment variable (sk_test_* or sk_live_*) or use STREAM_ENV=local for development.",
    )
  }

  return secretKey
}

// Re-export schema types for convenience
export type { serverSchema, clientSchema } from "./schema"
