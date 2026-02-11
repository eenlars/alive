/**
 * Scheduled Jobs Scheduler
 *
 * Background service that checks for due jobs and executes them.
 * Runs as a singleton in the server process.
 */

import { getDueJobs, markJobCompleted, markJobRunning } from "./store.js"
import type { JobExecutionResult, Payload, ScheduledJob } from "./types.js"

// Scheduler configuration
const CHECK_INTERVAL_MS = 30 * 1000 // Check every 30 seconds
const MAX_CONCURRENT_JOBS = 5 // Maximum jobs to run concurrently
const JOB_TIMEOUT_MS = 5 * 60 * 1000 // 5 minute default timeout

// Scheduler state
let schedulerInterval: ReturnType<typeof setInterval> | null = null
let isRunning = false
const runningJobs = new Set<string>()

// Execution callback (set by the app to handle agent runs)
type JobExecutor = (job: ScheduledJob) => Promise<JobExecutionResult>
let jobExecutor: JobExecutor | null = null

/**
 * Register the job executor callback
 * This is called by the app to provide the actual execution logic
 */
export function registerJobExecutor(executor: JobExecutor): void {
  jobExecutor = executor
}

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running")
    return
  }

  console.log("[Scheduler] Starting...")
  schedulerInterval = setInterval(checkAndRunJobs, CHECK_INTERVAL_MS)
  isRunning = true

  // Run immediately on start
  checkAndRunJobs().catch(console.error)
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (!schedulerInterval) {
    console.log("[Scheduler] Not running")
    return
  }

  console.log("[Scheduler] Stopping...")
  clearInterval(schedulerInterval)
  schedulerInterval = null
  isRunning = false
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  running: boolean
  activeJobs: number
  checkIntervalMs: number
} {
  return {
    running: isRunning,
    activeJobs: runningJobs.size,
    checkIntervalMs: CHECK_INTERVAL_MS,
  }
}

/**
 * Check for due jobs and run them
 */
async function checkAndRunJobs(): Promise<void> {
  if (!jobExecutor) {
    // No executor registered yet
    return
  }

  try {
    const now = Date.now()
    const dueJobs = await getDueJobs(now)

    if (dueJobs.length === 0) {
      return
    }

    console.log(`[Scheduler] Found ${dueJobs.length} due job(s)`)

    // Filter out already running jobs and respect concurrency limit
    const jobsToRun = dueJobs.filter(job => !runningJobs.has(job.id)).slice(0, MAX_CONCURRENT_JOBS - runningJobs.size)

    // Execute jobs concurrently
    await Promise.all(jobsToRun.map(job => executeJob(job)))
  } catch (error) {
    console.error("[Scheduler] Error checking jobs:", error)
  }
}

/**
 * Execute a single job
 */
async function executeJob(job: ScheduledJob): Promise<void> {
  if (!jobExecutor) return

  const startTime = Date.now()
  runningJobs.add(job.id)

  console.log(`[Scheduler] Executing job: ${job.name} (${job.id})`)

  try {
    // Mark as running in store
    await markJobRunning(job.id, startTime)

    // Get timeout from payload or use default
    const timeoutMs = getJobTimeout(job.payload)

    // Execute with timeout
    const result = await Promise.race([
      jobExecutor(job),
      new Promise<JobExecutionResult>((_, reject) => setTimeout(() => reject(new Error("Job timeout")), timeoutMs)),
    ])

    console.log(`[Scheduler] Job completed: ${job.name} (${result.success ? "ok" : "error"})`)

    await markJobCompleted(job.id, result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[Scheduler] Job failed: ${job.name}:`, errorMessage)

    await markJobCompleted(job.id, {
      success: false,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    })
  } finally {
    runningJobs.delete(job.id)
  }
}

/**
 * Get timeout for a job based on its payload
 */
function getJobTimeout(payload: Payload): number {
  if (payload.kind === "agentTurn" && payload.timeoutSeconds) {
    return payload.timeoutSeconds * 1000
  }
  return JOB_TIMEOUT_MS
}

/**
 * Manually trigger a job (for testing or immediate execution)
 */
export async function triggerJob(jobId: string): Promise<JobExecutionResult | null> {
  if (!jobExecutor) {
    return { success: false, durationMs: 0, error: "No executor registered" }
  }

  const { getJob } = await import("./store.js")
  const job = await getJob(jobId)

  if (!job) {
    return { success: false, durationMs: 0, error: "Job not found" }
  }

  if (runningJobs.has(jobId)) {
    return { success: false, durationMs: 0, error: "Job already running" }
  }

  const startTime = Date.now()
  runningJobs.add(jobId)

  try {
    await markJobRunning(jobId, startTime)

    const result = await jobExecutor(job)
    await markJobCompleted(jobId, result)

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const result = {
      success: false,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    }
    await markJobCompleted(jobId, result)
    return result
  } finally {
    runningJobs.delete(jobId)
  }
}

// ============================================
// Default Job Executor (for agent turns)
// ============================================

/**
 * Create a default job executor that uses the Claude API
 *
 * This should be called by the app with the necessary context
 */
export function createDefaultExecutor(options: {
  /** Function to send a message to a Claude session */
  sendMessage: (
    workspace: string,
    userId: string,
    message: string,
    options?: {
      model?: string
      timeoutSeconds?: number
    },
  ) => Promise<{ response: string }>
}): JobExecutor {
  return async (job: ScheduledJob): Promise<JobExecutionResult> => {
    const startTime = Date.now()

    try {
      switch (job.payload.kind) {
        case "systemEvent": {
          // System events just log for now
          // In the future, these could inject context into the session
          console.log(`[Scheduler] System event for ${job.workspace}: ${job.payload.text}`)
          return {
            success: true,
            durationMs: Date.now() - startTime,
          }
        }

        case "agentTurn": {
          const result = await options.sendMessage(job.workspace, job.userId, job.payload.message, {
            model: job.payload.model,
            timeoutSeconds: job.payload.timeoutSeconds,
          })

          return {
            success: true,
            durationMs: Date.now() - startTime,
            response: result.response,
          }
        }

        default:
          return {
            success: false,
            durationMs: Date.now() - startTime,
            error: "Unknown payload kind",
          }
      }
    } catch (error) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
