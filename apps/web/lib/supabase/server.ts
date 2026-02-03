if (typeof window !== "undefined") {
  throw new Error(
    "[SECURITY] lib/supabase/server cannot be imported in client-side code. " +
      "Use lib/supabase/client for browser access.",
  )
}

import { createServerClient } from "@supabase/ssr"
import type { PublicDatabase as Database } from "@webalive/database"
import { cookies } from "next/headers"
import { getSupabaseCredentials, type KeyType } from "@/lib/env/server"

export async function createClient(keyType: KeyType = "anon") {
  const cookieStore = await cookies()
  const { url, key } = getSupabaseCredentials(keyType)

  return createServerClient<Database>(url, key, {
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
