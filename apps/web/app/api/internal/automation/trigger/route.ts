/**
 * Internal Automation Trigger Endpoint
 *
 * Server-to-server endpoint for triggering automation jobs without browser auth.
 * Secured by X-Internal-Secret header matching JWT_SECRET.
 *
 * Used by:
 * - CLI testing
 * - Cron/scheduler for timed executions
 */

import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { runAutomationJob } from "@/lib/automation/executor"
import { getSupabaseCredentials } from "@/lib/env/server"
import { ErrorCodes } from "@/lib/error-codes"

export async function POST(req: NextRequest) {
  // Validate internal secret
  const secret = req.headers.get("X-Internal-Secret")
  const expectedSecret = process.env.JWT_SECRET

  if (!expectedSecret) {
    console.error("[internal/automation/trigger] JWT_SECRET not configured")
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }

  if (!secret || secret !== expectedSecret) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  // Parse request body
  let body: { jobId?: string }
  try {
    body = await req.json()
  } catch {
    return createErrorResponse(ErrorCodes.INVALID_JSON, 400)
  }

  const { jobId } = body
  if (!jobId) {
    return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, { field: "jobId" })
  }

  // Get job from database
  const { url, key } = getSupabaseCredentials("service")
  const supabase = createClient(url, key, { db: { schema: "app" } })

  const { data: job, error: jobError } = await supabase.from("automation_jobs").select("*").eq("id", jobId).single()

  if (jobError || !job) {
    return createErrorResponse(ErrorCodes.AUTOMATION_JOB_NOT_FOUND, 404, { jobId })
  }

  if (!job.is_active) {
    return createErrorResponse(ErrorCodes.AUTOMATION_JOB_DISABLED, 400, { jobId })
  }

  // Get site hostname for workspace resolution
  const { data: site, error: siteError } = await supabase
    .from("domains")
    .select("hostname")
    .eq("domain_id", job.site_id)
    .single()

  if (siteError || !site) {
    return createErrorResponse(ErrorCodes.SITE_NOT_FOUND, 404, { jobId })
  }

  console.log(`[internal/automation/trigger] Running job ${jobId} for ${site.hostname}`)

  // Run the automation
  const result = await runAutomationJob({
    jobId: job.id,
    userId: job.user_id,
    orgId: job.org_id,
    workspace: site.hostname,
    prompt: job.action_prompt,
    timeoutSeconds: job.action_timeout_seconds || 300,
  })

  return NextResponse.json({
    ok: result.success,
    durationMs: result.durationMs,
    error: result.error,
    response: result.response?.substring(0, 2000), // Limit response size
  })
}
