import { supabaseServerSchema } from "@/lib/env/schema"

function formatIssues(issues: string[]): string {
  return issues.join(", ")
}

export function assertSupabaseServiceEnv() {
  const result = supabaseServerSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  if (!result.success || !result.data.SUPABASE_SERVICE_ROLE_KEY) {
    const issues =
      result.success === false
        ? result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`)
        : ["SUPABASE_SERVICE_ROLE_KEY: Missing service-role key"]

    throw new Error(`[Supabase] Invalid environment: ${formatIssues(issues)}`)
  }
}

export function assertSupabaseManagementEnv() {
  const missing: string[] = []

  if (!process.env.SUPABASE_PROJECT_ID) {
    missing.push("SUPABASE_PROJECT_ID")
  }

  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    missing.push("SUPABASE_ACCESS_TOKEN")
  }

  if (missing.length > 0) {
    throw new Error(`[Supabase] Missing management credentials: ${missing.join(", ")}`)
  }
}

export function assertSystemTestEnv() {
  if (process.env.RUN_DEPLOYMENT_TESTS !== "true") {
    throw new Error("RUN_DEPLOYMENT_TESTS=true is required to execute deployment system tests.")
  }
}
