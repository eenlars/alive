/**
 * Run Automation Worker
 *
 * pg-boss worker that executes automation jobs.
 * Replaces CronService's executeJob() + finishJob() logic.
 *
 * The actual Claude interaction is delegated to the Bridge API's
 * internal automation trigger endpoint to avoid duplicating
 * the complex executor setup (OAuth, worker pool, credits, etc.)
 */

import type PgBoss from "pg-boss"
import { QUEUES } from "../queues.js"
import type { JobQueueEventHandler, RunAutomationPayload } from "../types.js"

/**
 * Register the run-automation worker with pg-boss.
 *
 * Processes up to 3 jobs concurrently (matching CronService's maxConcurrent).
 */
export async function registerAutomationWorker(boss: PgBoss, onEvent?: JobQueueEventHandler): Promise<void> {
  await boss.work(
    QUEUES.RUN_AUTOMATION,
    {
      batchSize: 3, // Same concurrency as old CronService
      pollingIntervalSeconds: 10,
    },
    async jobs => {
      await Promise.all(jobs.map(job => handleAutomationJob(job as JobData<RunAutomationPayload>, onEvent)))
    },
  )

  console.log("[AutomationWorker] Registered")
}

/** Job shape from pg-boss work handler */
interface JobData<T> {
  id: string
  name: string
  data: T
}

async function handleAutomationJob(job: JobData<RunAutomationPayload>, onEvent?: JobQueueEventHandler): Promise<void> {
  const { jobId, workspace, prompt, userId, orgId, timeoutSeconds, model, thinkingPrompt, skills } = job.data
  const startTime = Date.now()

  console.log(`[AutomationWorker] Starting job ${jobId} for ${workspace}`)

  onEvent?.({
    queue: QUEUES.RUN_AUTOMATION,
    jobId: job.id,
    action: "started",
  })

  try {
    // Call the internal automation trigger endpoint.
    // This endpoint handles all the complexity:
    // - OAuth validation
    // - Credit checks
    // - Worker pool or child process execution
    // - Supabase job status updates
    // - Run record creation
    const internalSecret = process.env.INTERNAL_TOOLS_SECRET
    if (!internalSecret) {
      throw new Error("INTERNAL_TOOLS_SECRET not configured")
    }

    const port = process.env.PORT || "9000"
    const url = `http://localhost:${port}/api/internal/run-automation`

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Auth": internalSecret,
      },
      body: JSON.stringify({
        jobId,
        userId,
        orgId,
        workspace,
        prompt,
        timeoutSeconds: timeoutSeconds ?? 300,
        model,
        thinkingPrompt,
        skills,
      }),
      signal: AbortSignal.timeout((timeoutSeconds ?? 300) * 1000 + 30_000), // job timeout + 30s buffer
    })

    const durationMs = Date.now() - startTime

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      throw new Error(`Internal API returned ${response.status}: ${errorText}`)
    }

    const result = (await response.json()) as { ok: boolean; error?: string }

    if (!result.ok) {
      throw new Error(result.error || "Automation execution failed")
    }

    console.log(`[AutomationWorker] Job ${jobId} completed in ${durationMs}ms`)

    onEvent?.({
      queue: QUEUES.RUN_AUTOMATION,
      jobId: job.id,
      action: "completed",
      durationMs,
    })

    // Re-enqueue next cron run if this is a recurring automation
    if (job.data.cronSchedule) {
      try {
        const { scheduleAutomation } = await import("../index.js")
        await scheduleAutomation(`automation-${jobId}`, job.data.cronSchedule, job.data, {
          tz: job.data.cronTimezone || "UTC",
        })
      } catch (reEnqueueErr) {
        console.error(`[AutomationWorker] Failed to re-enqueue next run for ${jobId}:`, reEnqueueErr)
        // Don't fail the job — the current run was successful.
        // syncAutomationSchedules() on next restart will pick it up.
      }
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : String(error)

    console.error(`[AutomationWorker] Job ${jobId} failed after ${durationMs}ms:`, errorMsg)

    onEvent?.({
      queue: QUEUES.RUN_AUTOMATION,
      jobId: job.id,
      action: "failed",
      error: errorMsg,
      durationMs,
    })

    // Re-throw so pg-boss handles retry/dead-letter
    throw error
  }
}
