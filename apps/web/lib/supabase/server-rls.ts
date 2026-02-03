if (typeof window !== "undefined") {
  throw new Error("[SECURITY] server-rls.ts is server-only")
}

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import type { PublicDatabase as Database } from "@webalive/database"
import { getSafeSessionCookie } from "@/features/auth/lib/auth"
import { getSupabaseCredentials } from "@/lib/env/server"

/**
 * Create Supabase client with RLS enforcement using Claude Bridge's workspace JWT.
 *
 * Requires Supabase JWT secret to match Claude Bridge's JWT_SECRET.
 * Configure in Supabase: Authentication > Settings > JWT Settings
 */
export async function createRLSClient() {
  const { url, key } = getSupabaseCredentials("anon")
  const token = await getSafeSessionCookie("[Supabase RLS]")

  return createSupabaseClient<Database>(url, key, {
    global: {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {},
    },
  })
}
