/**
 * @webalive/env
 *
 * Centralized environment variable validation using @t3-oss/env-nextjs
 *
 * ## Usage
 *
 * ### Server-side (API routes, server components, server actions)
 * ```typescript
 * import { env } from "@webalive/env/server"
 *
 * const apiKey = env.ANTH_API_SECRET
 * const dbUrl = env.SUPABASE_URL
 * ```
 *
 * ### Client-side (client components)
 * ```typescript
 * import { env } from "@webalive/env/client"
 *
 * const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
 * ```
 *
 * ### Schemas only (tests, type generation)
 * ```typescript
 * import { serverSchema, clientSchema } from "@webalive/env"
 * ```
 *
 * ## Architecture
 *
 * - `/server` - Server-only validation, can use node:fs for dotenv loading
 * - `/client` - Client-safe validation, no Node.js built-ins
 * - `/` (this file) - Schema exports only, safe for any context
 */

// Export ONLY schemas - no env object, no side effects
// This file is safe to import anywhere (client, server, tests)
export {
  serverSchema,
  clientSchema,
  runtimeEnv,
  httpsUrl,
  jwt,
  anthropicApiKey,
  domainName,
  CLIENT_ENV_KEYS,
  SERVER_ENV_KEYS,
} from "./schema"
