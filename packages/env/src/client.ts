/**
 * Client-side environment validation
 *
 * This file is safe to import in client components.
 * It has NO Node.js built-in imports (no fs, path, etc.)
 *
 * @example
 * ```typescript
 * // In client component
 * import { env } from "@webalive/env/client"
 *
 * // Only NEXT_PUBLIC_ vars are accessible
 * const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
 * ```
 */

import { createEnv } from "@t3-oss/env-nextjs"
import { clientSchema, runtimeEnv } from "./schema"

/**
 * Client-side validated environment variables
 *
 * Only includes NEXT_PUBLIC_ prefixed variables.
 * Server variables are NOT accessible here.
 */
export const env = createEnv({
  client: clientSchema,

  // Only client-side runtime env
  runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: runtimeEnv.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: runtimeEnv.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PREVIEW_BASE: runtimeEnv.NEXT_PUBLIC_PREVIEW_BASE,
    NEXT_PUBLIC_POSTHOG_KEY: runtimeEnv.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: runtimeEnv.NEXT_PUBLIC_POSTHOG_HOST,
  },

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
    console.error("❌ Invalid client environment variables:")
    console.error(issues)
    throw new Error("Invalid client environment variables")
  },

  emptyStringAsUndefined: true,
})

// Re-export client schema value (runtime Zod object)
export { clientSchema } from "./schema"

// Export inferred client environment type for type safety
export type ClientEnv = typeof env
