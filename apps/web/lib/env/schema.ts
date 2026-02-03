import { z } from "zod"

// Reusable validators
const httpsUrl = z
  .string()
  .url()
  .refine(u => u.startsWith("https://"), "Must use HTTPS")
const jwt = z
  .string()
  .min(1)
  .refine(key => key.startsWith("eyJ"), "Must be valid JWT")

// Server-side Supabase config
export const supabaseServerSchema = z.object({
  SUPABASE_URL: httpsUrl,
  SUPABASE_ANON_KEY: jwt,
  SUPABASE_SERVICE_ROLE_KEY: jwt.optional(), // Optional: only if you need admin access
})

// Client-side Supabase config (browser-safe)
export const supabaseClientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpsUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt,
})

export type SupabaseServerEnv = z.infer<typeof supabaseServerSchema>
export type SupabaseClientEnv = z.infer<typeof supabaseClientSchema>
