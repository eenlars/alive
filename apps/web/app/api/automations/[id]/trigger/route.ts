/**
 * Trigger Automation API
 *
 * Manually trigger an automation job to run immediately.
 * This bypasses the schedule and runs the job now.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSessionUser } from "@/features/auth/lib/auth"
import { getSupabaseCredentials } from "@/lib/env/server"
import { ErrorCodes } from "@/lib/error-codes"
import { structuredErrorResponse } from "@/lib/api/responses"
import { runAutomationJob } from "@/lib/automation/executor"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/automations/[id]/trigger - Manually trigger an automation
 */
export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { id } = await context.params
    const { url, key } = getSupabaseCredentials("service")
    const supabase = createClient(url, key, { db: { schema: "app" } })

    // Get the job with site info
    const { data: job, error: jobError } = await supabase
      .from("automation_jobs")
      .select("*, domains:site_id (hostname, port)")
      .eq("id", id)
      .single()

    if (jobError || !job) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404, details: { resource: "automation" } })
    }

    // Verify ownership
    if (job.user_id !== user.id) {
      return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, { status: 403 })
    }

    // Check if already running
    if (job.running_at) {
      return structuredErrorResponse(ErrorCodes.AUTOMATION_ALREADY_RUNNING, {
        status: 409,
        details: { startedAt: job.running_at },
      })
    }

    const hostname = (job.domains as any)?.hostname
    if (!hostname) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404, details: { resource: "site" } })
    }

    // Pre-execution validation
    const { validateActionPrompt, validateWorkspace } = await import("@/lib/automation/validation")

    // Validate that job has a prompt
    const promptCheck = validateActionPrompt(job.action_type, job.action_prompt)
    if (!promptCheck.valid) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { message: promptCheck.error },
      })
    }

    // Validate workspace exists
    const wsCheck = await validateWorkspace(hostname)
    if (!wsCheck.valid) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { message: wsCheck.error },
      })
    }

    const startedAt = new Date()
    const timeoutSeconds = job.action_timeout_seconds || 300
    console.log(`[Automation Trigger] Queued job "${job.name}" for site ${hostname} at ${startedAt.toISOString()}`)

    // Fire-and-forget: keep trigger endpoint fast and let runs endpoint report completion.
    void runAutomationJob({
      jobId: job.id,
      userId: job.user_id,
      orgId: job.org_id,
      workspace: hostname,
      prompt: job.action_prompt,
      timeoutSeconds,
    })
      .then(result => {
        const status = result.success ? "success" : "failure"
        console.log(
          `[Automation Trigger] Job "${job.name}" finished with ${status} in ${result.durationMs}ms`,
          result.error ? { error: result.error } : undefined,
        )
      })
      .catch(error => {
        console.error(`[Automation Trigger] Background job "${job.name}" failed to execute:`, error)
      })

    return NextResponse.json(
      {
        ok: true,
        status: "queued",
        startedAt: startedAt.toISOString(),
        timeoutSeconds,
        monitor: {
          runsPath: `/api/automations/${job.id}/runs`,
        },
      },
      { status: 202 },
    )
  } catch (error) {
    console.error("[Automation Trigger] Error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
