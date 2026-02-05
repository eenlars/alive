/**
 * Environment variables - Re-exports from @webalive/env package
 *
 * This file exists for backwards compatibility with imports using "@/lib/env".
 * New code should import directly from "@webalive/env/server".
 *
 * The @webalive/env package provides:
 * - Zod validation with proper type checking
 * - Environment-aware helpers (getAnthropicApiKey, getRedisUrl, getSuperadminEmails)
 * - Consistent validation across the codebase
 */

export { env, getAnthropicApiKey, getRedisUrl, getSuperadminEmails } from "@webalive/env/server"
