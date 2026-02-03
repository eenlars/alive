// Security: Prevent client-side imports (allow test environment)
const isTestEnv = process.env.NODE_ENV === "test" || "vi" in globalThis
if (typeof window !== "undefined" && !isTestEnv) {
  throw new Error(
    "[SECURITY] env/server cannot be imported in client-side code. " +
      "This file accesses server-only environment variables.",
  )
}

import { supabaseServerSchema } from "./schema"
import type { SupabaseCredentials } from "./types"

export type { SupabaseCredentials }
export type KeyType = "anon" | "service"

export function getSupabaseCredentials(keyType: KeyType = "anon"): SupabaseCredentials {
  const rawEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  const result = supabaseServerSchema.safeParse(rawEnv)

  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path}: ${i.message}`).join(", ")
    throw new Error(`[Supabase] Invalid environment: ${errors}`)
  }

  const env = result.data

  if (keyType === "service") {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("[Supabase] SERVICE_ROLE_KEY not set. Use only for admin operations.")
    }
    return { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }
  }

  return { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY }
}
