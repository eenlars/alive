/**
 * App Schema Browser Client
 * Provides type-safe client-side access to the app schema for conversation sync.
 *
 * Uses the anon key with RLS policies for security.
 */
"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { AppDatabase as Database } from "@webalive/database"
import { getSupabaseCredentials } from "@/lib/env/client"

let browserAppClient: ReturnType<typeof createBrowserClient<Database>> | null = null

/**
 * Get a browser-side Supabase client for the app schema.
 * Uses anon key - all access is protected by RLS policies.
 */
export function createAppBrowserClient() {
  if (browserAppClient) return browserAppClient

  const { url, key } = getSupabaseCredentials()

  browserAppClient = createBrowserClient<Database>(url, key, {
    db: {
      schema: "app",
    },
  })

  return browserAppClient
}

// Re-export types for convenience
export type { Database as AppDatabase }
