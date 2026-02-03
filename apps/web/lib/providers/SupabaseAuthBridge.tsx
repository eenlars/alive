"use client"

/**
 * Supabase authentication integration placeholder.
 *
 * Claude Bridge uses httpOnly JWT cookies which are not accessible from JavaScript.
 * The browser client uses the anon key only. For user-scoped RLS queries,
 * use server-side createRLSClient() which passes the JWT to Supabase.
 *
 * To enable browser-side RLS:
 * 1. Create API route that exchanges Claude Bridge JWT for Supabase JWT
 * 2. Store Supabase JWT in client state
 * 3. Use setSession() on the browser client
 *
 * Or migrate to Supabase Auth entirely for full browser-side RLS support.
 */
export function SupabaseAuthBridge() {
  return null
}
