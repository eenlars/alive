/**
 * Service-role Supabase clients (no cookies, no SSR)
 *
 * Use these for background jobs, automation, scripts, and any context
 * that doesn't have an HTTP request (no cookies available).
 *
 * For request-context clients with cookie forwarding, use:
 * - lib/supabase/app.ts (createAppClient)
 * - lib/supabase/iam.ts (createIamClient)
 * - lib/supabase/integrations.ts (createIntegrationsClient)
 */

// Security: Prevent client-side imports (allow test environment)
const isTestEnv = process.env.NODE_ENV === "test" || "vi" in globalThis
if (typeof window !== "undefined" && !isTestEnv) {
  throw new Error("[SECURITY] lib/supabase/service cannot be imported in client-side code.")
}

import { createClient } from "@supabase/supabase-js"
import type { AppDatabase, IamDatabase, IntegrationsDatabase } from "@webalive/database"
import { getSupabaseCredentials } from "@/lib/env/server"

/** Typed app-schema client with service role key (no cookies) */
export function createServiceAppClient() {
  const { url, key } = getSupabaseCredentials("service")
  return createClient<AppDatabase, "app">(url, key, { db: { schema: "app" } })
}

/** Typed IAM-schema client with service role key (no cookies) */
export function createServiceIamClient() {
  const { url, key } = getSupabaseCredentials("service")
  return createClient<IamDatabase, "iam">(url, key, { db: { schema: "iam" } })
}

/** Typed integrations-schema client with service role key (no cookies) */
export function createServiceIntegrationsClient() {
  const { url, key } = getSupabaseCredentials("service")
  return createClient<IntegrationsDatabase, "integrations">(url, key, { db: { schema: "integrations" } })
}
