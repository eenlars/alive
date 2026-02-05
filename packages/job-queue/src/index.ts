/**
 * Job Queue — pg-boss wrapper
 *
 * Singleton pg-boss instance that handles:
 * - Automation scheduling (replaces CronService)
 * - Conversation resumption (new capability)
 *
 * Uses the existing DATABASE_URL (Supabase direct connection).
 * pg-boss creates its own schema ("pgboss") and manages its tables.
 */

import PgBoss from "pg-boss"
import { QUEUES, QUEUE_CONFIGS } from "./queues.js"
import type { JobQueueEventHandler, ResumeConversationPayload, RunAutomationPayload } from "./types.js"

// Singleton instance
let boss: PgBoss | null = null
let started = false

/**
 * Get the pg-boss instance (lazy-init, does NOT start it).
 * Call startJobQueue() to actually start processing.
 */
export function getJobQueue(): PgBoss {
  if (boss) return boss

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("[JobQueue] DATABASE_URL environment variable is required")
  }

  boss = new PgBoss({
    connectionString,
    schema: "pgboss",
    migrate: true, // auto-creates/updates pgboss tables
    // Use polling (reliable with Bun + Supabase pooler)
    supervise: true,
  })

  boss.on("error", (error: Error) => {
    console.error("[JobQueue] pg-boss error:", error)
  })

  return boss
}

/**
 * Start the job queue and register all workers.
 *
 * @param onEvent - Optional callback for monitoring job activity
 */
export async function startJobQueue(onEvent?: JobQueueEventHandler): Promise<void> {
  if (started) {
    console.log("[JobQueue] Already started")
    return
  }

  const instance = getJobQueue()

  console.log("[JobQueue] Starting pg-boss...")
  await instance.start()
  started = true
  console.log("[JobQueue] pg-boss started")

  // Create all queues with their configs (order matters: dead letter queues first)
  for (const [queueName, config] of QUEUE_CONFIGS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await instance.createQueue(queueName, config as any)
    console.log(`[JobQueue] Queue created: ${queueName}`)
  }

  // Register workers (lazy import to avoid circular deps)
  const { registerAutomationWorker } = await import("./workers/run-automation.js")
  await registerAutomationWorker(instance, onEvent)

  const { registerResumeWorker } = await import("./workers/resume-conversation.js")
  await registerResumeWorker(instance, onEvent)

  console.log("[JobQueue] All workers registered")
}

/**
 * Gracefully stop the job queue.
 */
export async function stopJobQueue(): Promise<void> {
  if (!boss) return

  console.log("[JobQueue] Stopping...")
  await boss.stop({ graceful: true, timeout: 30_000 })
  boss = null
  started = false
  console.log("[JobQueue] Stopped")
}

/**
 * Check if the job queue is running.
 */
export function isJobQueueRunning(): boolean {
  return started
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Enqueue an automation job.
 *
 * For cron-scheduled automations, use scheduleAutomation() instead.
 */
export async function enqueueAutomation(
  payload: RunAutomationPayload,
  options?: { startAfter?: number },
): Promise<string | null> {
  const instance = getJobQueue()
  return instance.send(QUEUES.RUN_AUTOMATION, payload, {
    ...(options?.startAfter && { startAfter: options.startAfter }),
  })
}

/**
 * Schedule the next run of a cron automation.
 *
 * Computes the next run time from the cron expression and enqueues
 * a delayed job to the run-automation queue. Uses singletonKey to
 * prevent duplicate pending jobs for the same automation.
 *
 * pg-boss's built-in schedule() requires schedule name = queue name,
 * which doesn't work for our "many automations → one queue" pattern.
 * Instead we use send() + startAfter + singletonKey.
 *
 * @param name - Unique key (use `automation-${jobId}`)
 * @param cron - Cron expression (e.g., "0 8 * * *")
 * @param payload - Job payload
 * @param options - Timezone and other options
 */
export async function scheduleAutomation(
  name: string,
  cron: string,
  payload: RunAutomationPayload,
  options?: { tz?: string },
): Promise<string | null> {
  const { computeNextRunAtMs } = await import("@webalive/automation")
  const tz = options?.tz || "UTC"

  const nextMs = computeNextRunAtMs({ kind: "cron", expr: cron, tz }, Date.now())
  if (!nextMs) {
    console.warn(`[JobQueue] Could not compute next run for "${name}" (cron: ${cron})`)
    return null
  }

  const delaySec = Math.max(1, Math.round((nextMs - Date.now()) / 1000))
  const instance = getJobQueue()

  const jobId = await instance.send(QUEUES.RUN_AUTOMATION, payload, {
    startAfter: delaySec,
    singletonKey: name,
  })

  const nextDate = new Date(nextMs).toISOString()
  console.log(`[JobQueue] Scheduled "${name}" next run: ${nextDate} (in ${delaySec}s, cron: ${cron}, tz: ${tz})`)
  return jobId
}

/**
 * Cancel a scheduled automation (remove pending job).
 */
export async function unscheduleAutomation(name: string): Promise<void> {
  const instance = getJobQueue()
  // Cancel any pending job with this singletonKey
  // pg-boss cancel by singletonKey: fetch the job ID from the table
  try {
    const db = (instance as any).db
    if (db) {
      await db.executeSql(
        `UPDATE pgboss.job SET state = 'cancelled' WHERE name = $1 AND singleton_key = $2 AND state < 'active'`,
        [QUEUES.RUN_AUTOMATION, name],
      )
    }
    console.log(`[JobQueue] Unscheduled automation: ${name}`)
  } catch (err) {
    console.warn(`[JobQueue] Failed to unschedule "${name}":`, err)
  }
}

/**
 * Schedule a conversation resumption after a delay.
 *
 * @param payload - Resume conversation payload
 * @param delaySeconds - Seconds to wait before resuming
 */
export async function scheduleResumption(
  payload: ResumeConversationPayload,
  delaySeconds: number,
): Promise<string | null> {
  const instance = getJobQueue()
  return instance.send(QUEUES.RESUME_CONVERSATION, payload, {
    startAfter: delaySeconds,
  })
}

// Re-export types and queue names
export { QUEUES } from "./queues.js"
export type { RunAutomationPayload, ResumeConversationPayload, JobQueueEvent, JobQueueEventHandler } from "./types.js"
