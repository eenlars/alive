/**
 * Integrations Schema Supabase Client
 *
 * Creates a Supabase client specifically typed for the integrations schema.
 * This provides proper TypeScript support for integrations tables and RPC functions.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "[SECURITY] lib/supabase/integrations cannot be imported in client-side code. " +
      "This is a server-only module for security reasons.",
  )
}

import { createServerClient } from "@supabase/ssr"
import type { IntegrationsDatabase as Database } from "@webalive/database"
import { cookies } from "next/headers"
import { getSupabaseCredentials, type KeyType } from "@/lib/env/server"

/**
 * Creates a Supabase client for the integrations schema
 *
 * @param keyType - The type of key to use (anon, service). Defaults to service
 *                  since this is a server-only module.
 * @returns Supabase client typed for integrations schema
 */
export async function createIntegrationsClient(keyType: KeyType = "service") {
  const cookieStore = await cookies()
  const { url, key } = getSupabaseCredentials(keyType)

  return createServerClient<Database>(url, key, {
    db: {
      schema: "integrations", // Force all queries to use the integrations schema
    },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Called from Server Component
        }
      },
    },
  })
}
