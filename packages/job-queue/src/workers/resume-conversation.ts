/**
 * Resume Conversation Worker
 *
 * pg-boss worker that resumes a conversation after a delay.
 * This is the "automated Enter press" — it injects a message
 * into an existing Claude conversation session.
 */

import type PgBoss from "pg-boss"
import { QUEUES } from "../queues.js"
import type { JobQueueEventHandler, ResumeConversationPayload } from "../types.js"

/**
 * Register the resume-conversation worker with pg-boss.
 */
export async function registerResumeWorker(boss: PgBoss, onEvent?: JobQueueEventHandler): Promise<void> {
  await boss.work(
    QUEUES.RESUME_CONVERSATION,
    {
      pollingIntervalSeconds: 5, // Check frequently for time-sensitive resumptions
    },
    async jobs => {
      const job = jobs[0] as JobData<ResumeConversationPayload> | undefined
      if (job) await handleResumeJob(job, onEvent)
    },
  )

  console.log("[ResumeWorker] Registered")
}

/** Job shape from pg-boss work handler */
interface JobData<T> {
  id: string
  name: string
  data: T
}

async function handleResumeJob(job: JobData<ResumeConversationPayload>, onEvent?: JobQueueEventHandler): Promise<void> {
  const { sessionKey, userId, workspace, tabId, tabGroupId, message, reason, scheduledAt } = job.data
  const startTime = Date.now()

  console.log(`[ResumeWorker] Resuming conversation for ${workspace} (reason: ${reason}, scheduled: ${scheduledAt})`)

  onEvent?.({
    queue: QUEUES.RESUME_CONVERSATION,
    jobId: job.id,
    action: "started",
  })

  try {
    const internalSecret = process.env.INTERNAL_TOOLS_SECRET
    if (!internalSecret) {
      throw new Error("INTERNAL_TOOLS_SECRET not configured")
    }

    const port = process.env.PORT || "9000"
    const url = `http://localhost:${port}/api/internal/resume-conversation`

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Auth": internalSecret,
      },
      body: JSON.stringify({
        sessionKey,
        userId,
        workspace,
        tabId,
        tabGroupId,
        message,
        reason,
        scheduledAt,
      }),
      signal: AbortSignal.timeout(600_000), // 10 min max
    })

    const durationMs = Date.now() - startTime

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")

      // If session no longer exists, don't retry — it's a permanent failure
      if (response.status === 404) {
        console.warn(`[ResumeWorker] Session not found for ${sessionKey}, skipping (no retry)`)
        // Return normally — pg-boss marks as complete (no retry)
        return
      }

      throw new Error(`Resume API returned ${response.status}: ${errorText}`)
    }

    console.log(`[ResumeWorker] Conversation resumed for ${workspace} in ${durationMs}ms`)

    onEvent?.({
      queue: QUEUES.RESUME_CONVERSATION,
      jobId: job.id,
      action: "completed",
      durationMs,
    })
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : String(error)

    console.error(`[ResumeWorker] Failed after ${durationMs}ms:`, errorMsg)

    onEvent?.({
      queue: QUEUES.RESUME_CONVERSATION,
      jobId: job.id,
      action: "failed",
      error: errorMsg,
      durationMs,
    })

    // Re-throw so pg-boss handles retry/dead-letter
    throw error
  }
}
