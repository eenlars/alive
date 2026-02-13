/**
 * Trigger Automation API
 *
 * Manually trigger an automation job to run immediately.
 * This bypasses the schedule and runs the job now.
 *
 * Uses the engine module for claim/execute/finish lifecycle.
 */

import * as Sentry from "@sentry/nextjs"
import { claimJob, extractSummary, type FinishHooks, finishJob } from "@webalive/automation-engine"
import type { AppDatabase } from "@webalive/database"
import { getServerId } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { broadcastAutomationEvent } from "@/app/api/automations/events/route"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { pokeCronService } from "@/lib/automation/cron-service"
import { executeJob } from "@/lib/automation/execute"
import { getAutomationExecutionGate } from "@/lib/automation/execution-guard"
import { notifyJobDisabled } from "@/lib/automation/notifications"
import { ErrorCodes } from "@/lib/error-codes"
import { createServiceAppClient } from "@/lib/supabase/service"

interface RouteContext {
  params: Promise<{ id: string }>
}

type AutomationJob = AppDatabase["app"]["Tables"]["automation_jobs"]["Row"]

/**
 * POST /api/automations/[id]/trigger - Manually trigger an automation
 */
export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const executionGate = getAutomationExecutionGate()
    if (!executionGate.allowed) {
      return structuredErrorResponse(ErrorCodes.FORBIDDEN, {
        status: 403,
        details: { message: executionGate.reason },
      })
    }

    const { id } = await context.params
    const supabase = createServiceAppClient()

    // Get the job with site info
    const { data: job, error: jobError } = await supabase
      .from("automation_jobs")
      .select("*, domains:site_id (hostname, server_id)")
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

    // Server scoping: verify the job's site belongs to this server
    const siteData = job.domains as { hostname?: string; server_id?: string } | null
    const hostname = siteData?.hostname
    const siteServerId = siteData?.server_id
    const myServerId = getServerId()

    if (!hostname) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404, details: { resource: "site" } })
    }

    if (myServerId && siteServerId && siteServerId !== myServerId) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { message: `Site belongs to server ${siteServerId}, but this is ${myServerId}` },
      })
    }

    // Pre-execution validation
    const { validateActionPrompt, validateWorkspace } = await import("@/lib/automation/validation")

    const promptCheck = validateActionPrompt(job.action_type, job.action_prompt)
    if (!promptCheck.valid) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { message: promptCheck.error },
      })
    }

    const wsCheck = await validateWorkspace(hostname)
    if (!wsCheck.valid) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { message: wsCheck.error },
      })
    }

    // Claim via engine
    const ctx = await claimJob(job as AutomationJob, {
      supabase,
      triggeredBy: "manual",
      serverId: myServerId,
    })

    if (!ctx) {
      return structuredErrorResponse(ErrorCodes.AUTOMATION_ALREADY_RUNNING, { status: 409 })
    }

    const timeoutSeconds = job.action_timeout_seconds ?? 300

    console.log(`[Automation Trigger] Queued job "${job.name}" for site ${hostname}`)

    const hooks: FinishHooks = {
      onJobDisabled: (hookCtx, hookError) => notifyJobDisabled(hookCtx, hookError),
      onJobFinished: (hookCtx, status, summary) => {
        broadcastAutomationEvent(hookCtx.job.user_id, {
          type: "finished",
          jobId: hookCtx.job.id,
          jobName: hookCtx.job.name,
          status,
          summary,
        })
      },
    }

    // Fire-and-forget: run the job and update DB state after completion.
    void (async () => {
      try {
        const result = await executeJob(ctx)
        const durationMs = result.durationMs

        await finishJob(ctx, {
          status: result.success ? "success" : "failure",
          durationMs,
          error: result.error,
          summary: result.success ? extractSummary(result.response) : undefined,
          messages: result.messages,
          costUsd: result.costUsd,
          numTurns: result.numTurns,
          usage: result.usage,
          hooks,
        })

        console.log(
          `[Automation Trigger] Job "${job.name}" finished with ${result.success ? "success" : "failure"} in ${durationMs}ms`,
        )
      } catch (error) {
        // Executor threw unexpectedly — finishJob handles cleanup via run_id
        await finishJob(ctx, {
          status: "failure",
          durationMs: Date.now() - new Date(ctx.claimedAt).getTime(),
          error: error instanceof Error ? error.message : String(error),
          hooks,
        })
        console.error(`[Automation Trigger] Background job "${job.name}" crashed:`, error)
      } finally {
        // Poke CronService so it re-arms with the new next_run_at
        pokeCronService()
      }
    })()

    return NextResponse.json(
      {
        ok: true,
        status: "queued",
        startedAt: ctx.claimedAt,
        timeoutSeconds,
        monitor: {
          runsPath: `/api/automations/${job.id}/runs`,
        },
      },
      { status: 202 },
    )
  } catch (error) {
    console.error("[Automation Trigger] Error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
