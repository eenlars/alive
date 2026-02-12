/**
 * Service-role Supabase client for the worker process.
 *
 * Reads credentials from environment variables (same .env.production as web).
 * No cookie-based auth — worker is a background process.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { AppDatabase } from "@webalive/database"

type AppClient = SupabaseClient<AppDatabase, "app">

let cachedClient: AppClient | null = null

export function createWorkerAppClient(): AppClient {
  if (cachedClient) return cachedClient

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error("[Worker] SUPABASE_URL not set")
  if (!key) throw new Error("[Worker] SUPABASE_SERVICE_ROLE_KEY not set")

  cachedClient = createClient<AppDatabase, "app">(url, key, {
    db: { schema: "app" },
  })
  return cachedClient
}
