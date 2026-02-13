/**
 * Pure Zod schemas for environment variable validation
 *
 * This file contains ONLY schema definitions - no runtime code, no side effects.
 * Safe to import anywhere (server, client, tests).
 */

import { z } from "zod"

/**
 * Custom validators for common patterns
 *
 * IMPORTANT: Do NOT use .refine() here — it wraps the schema in ZodEffects
 * which breaks type inference in @t3-oss/env-nextjs (all fields resolve to {}).
 * Use .regex() or other ZodString chainable methods instead.
 */
export const httpsUrl = z
  .string()
  .url()
  .regex(/^https:\/\//, "Must use HTTPS")

export const jwt = z.string().regex(/^eyJ/, "Must be valid JWT")

export const anthropicApiKey = z.string().regex(/^sk-ant-/, "Must be valid Anthropic API key")

export const flowgladSecretKey = z
  .string()
  .regex(/^sk_(test|live)_/, "Must be valid Flowglad secret key (sk_test_* or sk_live_*)")

/**
 * Custom validators for domain configuration
 */
export const domainName = z
  .string()
  .min(1)
  .regex(/^[a-z0-9.-]+$/i, "Must be a valid domain name")

/**
 * Server-side environment variables schema
 * These are NEVER exposed to the client
 */
export const serverSchema = {
  // Anthropic API
  ANTH_API_SECRET: anthropicApiKey.optional(),
  ANTHROPIC_API_KEY: anthropicApiKey.optional(),

  // Supabase (server-side)
  SUPABASE_URL: httpsUrl,
  SUPABASE_ANON_KEY: jwt,
  SUPABASE_SERVICE_ROLE_KEY: jwt.optional(),
  SUPABASE_ACCESS_TOKEN: z.string().optional(),
  SUPABASE_PROJECT_ID: z.string().optional(),

  // Domain Configuration (REQUIRED - no fallbacks, fails fast at startup)
  MAIN_DOMAIN: domainName,
  WILDCARD_DOMAIN: domainName,
  PREVIEW_BASE: domainName,
  COOKIE_DOMAIN: domainName,

  // Stream URLs (REQUIRED - no fallbacks, fails fast at startup)
  STREAM_PROD_URL: httpsUrl,
  STREAM_STAGING_URL: httpsUrl,
  STREAM_DEV_URL: httpsUrl,

  // Stream configuration
  WORKSPACE_BASE: z.string().default("/srv/webalive/sites"),
  ALIVE_PASSCODE: z.string().optional(),
  STREAM_ENV: z.enum(["local", "dev", "staging", "production", "standalone"]).optional(),
  LOCAL_TEMPLATE_PATH: z.string().optional(),
  SHELL_PASSWORD: z.string().optional(),
  HOSTED_ENV: z.string().optional(),

  // Claude configuration
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-5-20250929"),
  // Note: CLAUDE_MAX_TURNS is not an env var - use DEFAULTS.CLAUDE_MAX_TURNS from @webalive/shared

  // Optional integrations
  GROQ_API_SECRET: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  DEPLOY_BRANCH: z.string().optional(),
  STRIPE_OAUTH_TOKEN: z.string().optional(), // DEPRECATED - use STRIPE_CLIENT_ID/SECRET instead
  STRIPE_CLIENT_ID: z.string().optional(), // Stripe Connect Client ID (ca_xxx)
  STRIPE_CLIENT_SECRET: z.string().optional(), // Platform API secret key
  STRIPE_REDIRECT_URI: z.string().optional(), // Optional, derived from baseUrl
  // Flowglad billing/payment integration
  // REQUIRED in production/staging, optional in local dev (STREAM_ENV=local)
  // Validated at runtime by getFlowgladSecretKey() helper
  FLOWGLAD_SECRET_KEY: flowgladSecretKey.optional(),
  LINEAR_CLIENT_ID: z.string().optional(),
  LINEAR_CLIENT_SECRET: z.string().optional(),
  LINEAR_REDIRECT_URI: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // JWT & Security
  JWT_SECRET: z.string().optional(),
  JWT_ES256_PRIVATE_KEY: z.string().optional(),
  JWT_ALGORITHM: z.string().optional(),
  LOCKBOX_MASTER_KEY: z.string().optional(),
  INTERNAL_TOOLS_SECRET: z.string().optional(),

  // Images
  IMAGES_SIGNATURE_SECRET: z.string().optional(),
  IMAGES_STORAGE_PATH: z.string().optional(),

  // Infrastructure
  WILDCARD_TLD: z.string().optional(), // Deprecated: use WILDCARD_DOMAIN

  // Server identity
  SERVER_IP: z
    .string()
    .regex(/^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]{2,39})$/i, "Must be a valid IP address")
    .optional(),

  // Admin configuration (comma-separated emails)
  ADMIN_EMAILS: z.string().optional(),
  // SUPERADMIN_EMAILS is REQUIRED in production/staging (validated at runtime by getSuperadminEmails)
  SUPERADMIN_EMAILS: z.string().optional(),

  // Redis configuration
  // REQUIRED in production/staging, optional in local dev (STREAM_ENV=local)
  // Validated at runtime by getRedisUrl() helper
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, "Must be a valid Redis URL (redis:// or rediss://)")
    .optional(),

  // Node environment
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),

  // E2E Testing (optional - only needed for E2E tests)
  E2E_TEST_SECRET: z.string().optional(),
  E2E_RUN_ID: z.string().optional(),
} as const

/**
 * Client-side environment variables schema
 * These are exposed to the browser (must be prefixed with NEXT_PUBLIC_)
 */
export const clientSchema = {
  NEXT_PUBLIC_SUPABASE_URL: httpsUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt,
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_PREVIEW_BASE: z.string().min(1, "NEXT_PUBLIC_PREVIEW_BASE is required"),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
} as const

/**
 * Runtime environment mapping
 * Maps schema keys to process.env values
 */
export const runtimeEnv = {
  // Server
  ANTH_API_SECRET: process.env.ANTH_API_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN,
  SUPABASE_PROJECT_ID: process.env.SUPABASE_PROJECT_ID,
  MAIN_DOMAIN: process.env.MAIN_DOMAIN,
  WILDCARD_DOMAIN: process.env.WILDCARD_DOMAIN,
  PREVIEW_BASE: process.env.PREVIEW_BASE,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
  STREAM_PROD_URL: process.env.STREAM_PROD_URL,
  STREAM_STAGING_URL: process.env.STREAM_STAGING_URL,
  STREAM_DEV_URL: process.env.STREAM_DEV_URL,
  WORKSPACE_BASE: process.env.WORKSPACE_BASE,
  ALIVE_PASSCODE: process.env.ALIVE_PASSCODE,
  STREAM_ENV: process.env.STREAM_ENV,

  LOCAL_TEMPLATE_PATH: process.env.LOCAL_TEMPLATE_PATH,
  SHELL_PASSWORD: process.env.SHELL_PASSWORD,
  HOSTED_ENV: process.env.HOSTED_ENV,
  CLAUDE_MODEL: process.env.CLAUDE_MODEL,
  CLAUDE_MAX_TURNS: process.env.CLAUDE_MAX_TURNS,
  GROQ_API_SECRET: process.env.GROQ_API_SECRET,
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
  DEPLOY_BRANCH: process.env.DEPLOY_BRANCH,
  STRIPE_OAUTH_TOKEN: process.env.STRIPE_OAUTH_TOKEN,
  STRIPE_CLIENT_ID: process.env.STRIPE_CLIENT_ID,
  STRIPE_CLIENT_SECRET: process.env.STRIPE_CLIENT_SECRET,
  STRIPE_REDIRECT_URI: process.env.STRIPE_REDIRECT_URI,
  FLOWGLAD_SECRET_KEY: process.env.FLOWGLAD_SECRET_KEY,
  LINEAR_CLIENT_ID: process.env.LINEAR_CLIENT_ID,
  LINEAR_CLIENT_SECRET: process.env.LINEAR_CLIENT_SECRET,
  LINEAR_REDIRECT_URI: process.env.LINEAR_REDIRECT_URI,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_ES256_PRIVATE_KEY: process.env.JWT_ES256_PRIVATE_KEY,
  JWT_ALGORITHM: process.env.JWT_ALGORITHM,
  LOCKBOX_MASTER_KEY: process.env.LOCKBOX_MASTER_KEY,
  INTERNAL_TOOLS_SECRET: process.env.INTERNAL_TOOLS_SECRET,
  IMAGES_SIGNATURE_SECRET: process.env.IMAGES_SIGNATURE_SECRET,
  IMAGES_STORAGE_PATH: process.env.IMAGES_STORAGE_PATH,
  WILDCARD_TLD: process.env.WILDCARD_TLD,
  SERVER_IP: process.env.SERVER_IP,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  SUPERADMIN_EMAILS: process.env.SUPERADMIN_EMAILS,
  REDIS_URL: process.env.REDIS_URL,
  NODE_ENV: process.env.NODE_ENV,
  E2E_TEST_SECRET: process.env.E2E_TEST_SECRET,
  E2E_RUN_ID: process.env.E2E_RUN_ID,

  // Client
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_PREVIEW_BASE: process.env.NEXT_PUBLIC_PREVIEW_BASE,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
} as const

/**
 * Export schema keys for validation tooling
 * Used by scripts/validation/validate-turbo-env.ts to ensure turbo.json is in sync
 */
export const CLIENT_ENV_KEYS = Object.keys(clientSchema) as (keyof typeof clientSchema)[]
export const SERVER_ENV_KEYS = Object.keys(serverSchema) as (keyof typeof serverSchema)[]
