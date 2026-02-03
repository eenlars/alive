import { supabaseClientSchema } from "./schema"
import type { SupabaseCredentials } from "./types"

export type { SupabaseCredentials }

export function getSupabaseCredentials(): SupabaseCredentials {
  const rawEnv = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }

  const result = supabaseClientSchema.safeParse(rawEnv)

  if (!result.success) {
    throw new Error("Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return {
    url: result.data.NEXT_PUBLIC_SUPABASE_URL,
    key: result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}
