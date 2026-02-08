/**
 * Trigger Automation API
 *
 * Manually trigger an automation job to run immediately.
 * This bypasses the schedule and runs the job now.
 */

import { createClient } from "@supabase/supabase-js"
import { computeNextRunAtMs } from "@webalive/automation"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { runAutomationJob } from "@/lib/automation/executor"
import { getSupabaseCredentials } from "@/lib/env/server"
import { ErrorCodes } from "@/lib/error-codes"

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
    const startedAtIso = startedAt.toISOString()
    const timeoutSeconds = job.action_timeout_seconds ?? 300

    // Atomically claim this job to prevent concurrent trigger races.
    const { data: claimedRows, error: claimError } = await supabase
      .from("automation_jobs")
      .update({ running_at: startedAtIso })
      .eq("id", job.id)
      .is("running_at", null)
      .select("id")
      .limit(1)

    if (claimError) {
      console.error("[Automation Trigger] Failed to claim job:", claimError)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    if (!claimedRows || claimedRows.length === 0) {
      return structuredErrorResponse(ErrorCodes.AUTOMATION_ALREADY_RUNNING, { status: 409 })
    }

    console.log(`[Automation Trigger] Queued job "${job.name}" for site ${hostname} at ${startedAt.toISOString()}`)

    // Fire-and-forget: run the job and update DB state after completion.
    // The executor is a pure function — this route owns all DB side effects for manual triggers.
    void (async () => {
      let result: Awaited<ReturnType<typeof runAutomationJob>>
      try {
        result = await runAutomationJob({
          jobId: job.id,
          userId: job.user_id,
          orgId: job.org_id,
          workspace: hostname,
          prompt: job.action_prompt,
          timeoutSeconds,
        })
      } catch (error) {
        // Executor threw unexpectedly — roll back running_at so job isn't permanently stuck
        await supabase
          .from("automation_jobs")
          .update({ running_at: null })
          .eq("id", job.id)
          .eq("running_at", startedAtIso)

        console.error(`[Automation Trigger] Background job "${job.name}" crashed:`, error)
        return
      }

      const now = new Date()
      const status = result.success ? "success" : "failure"

      // Compute next_run_at so a manual trigger doesn't break the cron schedule
      let nextRunAt: string | null = null
      if (job.trigger_type === "cron" && job.cron_schedule) {
        const nextMs = computeNextRunAtMs(
          { kind: "cron", expr: job.cron_schedule, tz: job.cron_timezone || undefined },
          now.getTime(),
        )
        if (nextMs) {
          nextRunAt = new Date(nextMs).toISOString()
        }
      }

      // Update job state (clear running_at, record last run info)
      await supabase
        .from("automation_jobs")
        .update({
          running_at: null,
          last_run_at: startedAtIso,
          last_run_status: status,
          last_run_error: result.error ?? null,
          last_run_duration_ms: result.durationMs,
          next_run_at: nextRunAt,
        })
        .eq("id", job.id)

      // Insert run record
      await supabase.from("automation_runs").insert({
        job_id: job.id,
        started_at: startedAtIso,
        completed_at: now.toISOString(),
        duration_ms: result.durationMs,
        status,
        error: result.error ?? null,
        result: result.response ? { response: result.response.substring(0, 10000) } : null,
        messages: result.messages ?? null,
        triggered_by: "manual",
      })

      console.log(
        `[Automation Trigger] Job "${job.name}" finished with ${status} in ${result.durationMs}ms`,
        result.error ? { error: result.error } : undefined,
      )
    })()

    return NextResponse.json(
      {
        ok: true,
        status: "queued",
        startedAt: startedAtIso,
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
