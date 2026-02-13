/**
 * Service-Role Supabase Clients (No Cookies)
 *
 * For background tasks (cron, automations, internal APIs) that run outside
 * a request context and don't have access to cookies.
 *
 * These use the service role key — bypasses RLS. Use only in trusted server code.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "[SECURITY] lib/supabase/service cannot be imported in client-side code. " +
      "Service-role clients must only run server-side.",
  )
}

import { createClient } from "@supabase/supabase-js"
import type { AppDatabase, IamDatabase } from "@webalive/database"
import { getSupabaseCredentials } from "@/lib/env/server"

/**
 * Create a service-role Supabase client for the app schema.
 * No cookies, no RLS — for background tasks only.
 */
export function createServiceAppClient() {
  const { url, key } = getSupabaseCredentials("service")
  return createClient<AppDatabase, "app">(url, key, {
    db: { schema: "app" },
  })
}

/**
 * Create a service-role Supabase client for the iam schema.
 * No cookies, no RLS — for background tasks only.
 */
export function createServiceIamClient() {
  const { url, key } = getSupabaseCredentials("service")
  return createClient<IamDatabase, "iam">(url, key, {
    db: { schema: "iam" },
  })
}
