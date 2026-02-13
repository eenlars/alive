if (typeof window !== "undefined") {
  throw new Error("[SECURITY] server-rls.ts is server-only")
}

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import type { AppDatabase, IamDatabase, PublicDatabase } from "@webalive/database"
import { getSafeSessionCookie } from "@/features/auth/lib/auth"
import { getSupabaseCredentials } from "@/lib/env/server"

/**
 * Create Supabase client with RLS enforcement using Alive's workspace JWT.
 *
 * Requires Supabase JWT secret to match Alive's JWT_SECRET.
 * Configure in Supabase: Authentication > Settings > JWT Settings
 */
function isJwtToken(token: string): boolean {
  return token.split(".").length === 3
}

function requireJwtToken(token: string | undefined, context: string): string {
  if (!token) {
    throw new Error(`${context} Missing JWT session token for RLS client`)
  }
  if (!isJwtToken(token)) {
    throw new Error(`${context} Non-JWT session token is not allowed for RLS client`)
  }
  return token
}

function buildAuthHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function createRLSClient() {
  const token = requireJwtToken(await getSafeSessionCookie("[Supabase RLS]"), "[Supabase RLS]")
  const { url, key } = getSupabaseCredentials("anon")

  return createSupabaseClient<PublicDatabase>(url, key, {
    global: {
      headers: buildAuthHeaders(token),
    },
  })
}

export async function createRLSAppClient() {
  const token = requireJwtToken(await getSafeSessionCookie("[Supabase RLS App]"), "[Supabase RLS App]")
  const { url, key } = getSupabaseCredentials("anon")

  return createSupabaseClient<AppDatabase, "app">(url, key, {
    db: {
      schema: "app",
    },
    global: {
      headers: buildAuthHeaders(token),
    },
  })
}

export async function createRLSIamClient() {
  const token = requireJwtToken(await getSafeSessionCookie("[Supabase RLS IAM]"), "[Supabase RLS IAM]")
  const { url, key } = getSupabaseCredentials("anon")

  return createSupabaseClient<IamDatabase, "iam">(url, key, {
    db: {
      schema: "iam",
    },
    global: {
      headers: buildAuthHeaders(token),
    },
  })
}
