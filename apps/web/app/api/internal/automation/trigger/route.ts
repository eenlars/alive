/**
 * Internal Automation Trigger Endpoint
 *
 * Server-to-server endpoint for triggering automation jobs without browser auth.
 * Secured by X-Internal-Secret header matching JWT_SECRET.
 *
 * Uses the engine module for claim/execute/finish lifecycle.
 */

import { claimJob, extractSummary, type FinishHooks, finishJob } from "@webalive/automation-engine"
import type { AppDatabase } from "@webalive/database"
import { AutomationTriggerRequestSchema, type AutomationTriggerResponse, getServerId } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { broadcastAutomationEvent } from "@/app/api/automations/events/route"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { pokeCronService } from "@/lib/automation/cron-service"
import { executeJob } from "@/lib/automation/execute"
import { getAutomationExecutionGate } from "@/lib/automation/execution-guard"
import { notifyJobDisabled } from "@/lib/automation/notifications"
import { ErrorCodes } from "@/lib/error-codes"
import { createServiceAppClient } from "@/lib/supabase/service"

type AutomationJob = AppDatabase["app"]["Tables"]["automation_jobs"]["Row"]

function triggerResponse(data: AutomationTriggerResponse, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

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

  const executionGate = getAutomationExecutionGate()
  if (!executionGate.allowed) {
    return createErrorResponse(ErrorCodes.FORBIDDEN, 403, { message: executionGate.reason })
  }

  // Parse and validate request body
  const parseResult = AutomationTriggerRequestSchema.safeParse(await req.json().catch(() => null))
  if (!parseResult.success) {
    return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, { field: "jobId" })
  }

  const { jobId, promptOverride, triggerContext, systemPromptOverride, extraTools, responseToolName } = parseResult.data

  // Get job from database
  const supabase = createServiceAppClient()

  const { data: job, error: jobError } = await supabase.from("automation_jobs").select("*").eq("id", jobId).single()

  if (jobError || !job) {
    return createErrorResponse(ErrorCodes.AUTOMATION_JOB_NOT_FOUND, 404, { jobId })
  }

  if (!job.is_active) {
    return createErrorResponse(ErrorCodes.AUTOMATION_JOB_DISABLED, 400, { jobId })
  }

  // Claim via engine
  const ctx = await claimJob(job as AutomationJob, {
    supabase,
    triggeredBy: "internal",
    serverId: getServerId(),
  })

  if (!ctx) {
    return createErrorResponse(ErrorCodes.AUTOMATION_ALREADY_RUNNING, 409)
  }

  // Attach optional overrides from the trigger request
  if (promptOverride) ctx.promptOverride = promptOverride
  if (triggerContext) ctx.triggerContext = triggerContext
  if (systemPromptOverride) ctx.systemPromptOverride = systemPromptOverride
  if (extraTools?.length) ctx.extraTools = extraTools
  if (responseToolName) ctx.responseToolName = responseToolName

  console.log(`[internal/automation/trigger] Running job ${jobId} for ${ctx.hostname}`)

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

  // Synchronous execution — wait for completion
  try {
    const result = await executeJob(ctx)

    await finishJob(ctx, {
      status: result.success ? "success" : "failure",
      durationMs: result.durationMs,
      error: result.error,
      summary: result.success ? extractSummary(result.response) : undefined,
      messages: result.messages,
      costUsd: result.costUsd,
      numTurns: result.numTurns,
      usage: result.usage,
      hooks,
    })

    // Poke CronService so it re-arms with the new next_run_at
    pokeCronService()

    return triggerResponse({
      ok: result.success,
      durationMs: result.durationMs,
      error: result.error,
      response: result.response?.substring(0, 2000),
    })
  } catch (error) {
    const durationMs = Date.now() - new Date(ctx.claimedAt).getTime()

    await finishJob(ctx, {
      status: "failure",
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      hooks,
    })

    pokeCronService()

    return triggerResponse(
      {
        ok: false,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    )
  }
}
