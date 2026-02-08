/**
 * CronService - In-process automation scheduler
 *
 * Inspired by ClawdBot's cron system. Uses setTimeout-based scheduling
 * that wakes exactly when the next job is due, instead of polling.
 *
 * Features:
 * - Precise timing (wakes exactly when needed)
 * - Event system for real-time monitoring
 * - Retry logic with exponential backoff
 * - Concurrent job limits
 * - Posts summaries back to user's chat
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { computeNextRunAtMs } from "@webalive/automation"
import { getSupabaseCredentials } from "@/lib/env/server"
import { appendRunLog } from "./run-log"

// ============================================
// Types
// ============================================

export type CronEvent = {
  jobId: string
  action: "started" | "finished" | "error" | "scheduled"
  runAtMs?: number
  durationMs?: number
  status?: "success" | "failure" | "skipped"
  error?: string
  summary?: string
  nextRunAtMs?: number
}

export type CronServiceConfig = {
  /** Maximum concurrent jobs (default: 3) */
  maxConcurrent?: number
  /** Maximum retries before disabling job (default: 3) */
  maxRetries?: number
  /** Base retry delay in ms (default: 60000 = 1 minute) */
  retryBaseDelayMs?: number
  /** Event callback for monitoring */
  onEvent?: (event: CronEvent) => void
  /** Whether service is enabled (default: true in production) */
  enabled?: boolean
}

type AutomationJob = {
  id: string
  site_id: string
  user_id: string
  org_id: string
  name: string
  trigger_type: "cron" | "webhook" | "one-time"
  cron_schedule: string | null
  cron_timezone: string | null
  run_at: string | null
  action_prompt: string | null
  action_timeout_seconds: number | null
  action_model: string | null
  action_thinking: string | null
  is_active: boolean
  next_run_at: string | null
  running_at: string | null
  last_run_status: string | null
  consecutive_failures?: number
}

// ============================================
// Service State
// ============================================

type ServiceState = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>
  config: Required<CronServiceConfig>
  timer: NodeJS.Timeout | null
  runningJobs: Set<string>
  started: boolean
  stopping: boolean
}

// Singleton state
let state: ServiceState | null = null

// ============================================
// Public API
// ============================================

/**
 * Start the cron service
 */
export async function startCronService(config: CronServiceConfig = {}): Promise<void> {
  if (state?.started) {
    console.log("[CronService] Already started")
    return
  }

  const { url, key } = getSupabaseCredentials("service")
  const supabase = createClient(url, key, { db: { schema: "app" } })

  const enabled = config.enabled ?? process.env.NODE_ENV === "production"
  if (!enabled) {
    console.log("[CronService] Disabled (not production)")
    return
  }

  state = {
    supabase,
    config: {
      maxConcurrent: config.maxConcurrent ?? 3,
      maxRetries: config.maxRetries ?? 3,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 60_000,
      onEvent: config.onEvent ?? (() => {}),
      enabled: true,
    },
    timer: null,
    runningJobs: new Set(),
    started: true,
    stopping: false,
  }

  console.log("[CronService] Starting...")
  await armTimer()
  console.log("[CronService] Started")
}

/**
 * Stop the cron service
 */
export function stopCronService(): void {
  if (!state) return

  console.log("[CronService] Stopping...")
  state.stopping = true

  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }

  state.started = false
  state = null
  console.log("[CronService] Stopped")
}

/**
 * Get service status
 */
export function getCronServiceStatus(): {
  started: boolean
  runningJobs: number
  nextWakeAt: Date | null
} {
  if (!state) {
    return { started: false, runningJobs: 0, nextWakeAt: null }
  }

  return {
    started: state.started,
    runningJobs: state.runningJobs.size,
    nextWakeAt: null, // Would need to track this
  }
}

/**
 * Manually trigger a job (for testing or immediate execution)
 */
export async function triggerJob(jobId: string): Promise<{
  success: boolean
  error?: string
}> {
  if (!state) {
    return { success: false, error: "Service not started" }
  }

  const { data: job } = await state.supabase.from("automation_jobs").select("*").eq("id", jobId).single()

  if (!job) {
    return { success: false, error: "Job not found" }
  }

  await executeJob(job, { forced: true })
  return { success: true }
}

// ============================================
// Internal: Timer Management
// ============================================

const MAX_TIMEOUT_MS = 2 ** 31 - 1 // Max setTimeout value

async function armTimer(): Promise<void> {
  if (!state || state.stopping) return

  // Clear existing timer
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }

  // Find next wake time
  const nextWakeMs = await getNextWakeTime()
  if (!nextWakeMs) {
    console.log("[CronService] No jobs scheduled, sleeping...")
    // Re-check in 5 minutes even if no jobs (new jobs might be added)
    state.timer = setTimeout(() => void armTimer(), 5 * 60 * 1000)
    return
  }

  const delay = Math.max(0, nextWakeMs - Date.now())
  const clampedDelay = Math.min(delay, MAX_TIMEOUT_MS)
  const nextWakeDate = new Date(nextWakeMs)

  console.log(`[CronService] Next wake: ${nextWakeDate.toISOString()} (in ${Math.round(clampedDelay / 1000)}s)`)

  state.timer = setTimeout(() => {
    void onTimerTick().catch(err => {
      console.error("[CronService] Timer tick failed:", err)
    })
  }, clampedDelay)
}

async function getNextWakeTime(): Promise<number | null> {
  if (!state) return null

  const { data: jobs } = await state.supabase
    .from("automation_jobs")
    .select("next_run_at")
    .eq("is_active", true)
    .not("next_run_at", "is", null)
    .order("next_run_at", { ascending: true })
    .limit(1)

  if (!jobs?.length || !jobs[0].next_run_at) {
    return null
  }

  return new Date(jobs[0].next_run_at).getTime()
}

async function onTimerTick(): Promise<void> {
  if (!state || state.stopping) return

  try {
    await runDueJobs()
  } finally {
    await armTimer()
  }
}

// ============================================
// Internal: Job Execution
// ============================================

async function runDueJobs(): Promise<void> {
  if (!state) return

  const now = Date.now()

  // Reap stale jobs: if running_at is older than 1 hour, the executor likely crashed.
  // Clear running_at so the job can be picked up again.
  const staleThreshold = new Date(now - 60 * 60 * 1000).toISOString()
  const { data: staleJobs } = await state.supabase
    .from("automation_jobs")
    .select("id, name, running_at")
    .eq("is_active", true)
    .not("running_at", "is", null)
    .lt("running_at", staleThreshold)

  if (staleJobs?.length) {
    for (const stale of staleJobs) {
      console.warn(`[CronService] Reaping stale job "${stale.name}" (${stale.id}), stuck since ${stale.running_at}`)
      await state.supabase.from("automation_jobs").update({ running_at: null }).eq("id", stale.id)
    }
  }

  // Get due jobs that aren't already running
  const { data: dueJobs } = await state.supabase
    .from("automation_jobs")
    .select("*")
    .eq("is_active", true)
    .is("running_at", null)
    .lte("next_run_at", new Date(now).toISOString())
    .order("next_run_at", { ascending: true })

  if (!dueJobs?.length) return

  const jobNames = dueJobs.map(j => `"${j.name}"`).join(", ")
  console.log(`[CronService] Found ${dueJobs.length} due job(s): ${jobNames}`)

  // Filter out already running and respect concurrency limit
  const availableSlots = state.config.maxConcurrent - state.runningJobs.size
  const jobsToRun = dueJobs.filter(j => !state!.runningJobs.has(j.id)).slice(0, availableSlots)

  if (jobsToRun.length < dueJobs.length) {
    console.log(
      `[CronService] Concurrency limit: executing ${jobsToRun.length}/${dueJobs.length} jobs (${state.runningJobs.size}/${state.config.maxConcurrent} slots in use)`,
    )
  }

  // Execute jobs concurrently
  await Promise.all(jobsToRun.map(job => executeJob(job, { forced: false })))
}

async function executeJob(job: AutomationJob, _opts: { forced: boolean }): Promise<void> {
  if (!state) return

  const startedAt = Date.now()
  state.runningJobs.add(job.id)

  // Emit started event
  emit({
    jobId: job.id,
    action: "started",
    runAtMs: startedAt,
  })

  // Log to run log
  await appendRunLog(job.id, {
    action: "started",
    runAtMs: startedAt,
  }).catch(() => {}) // Don't fail if logging fails

  // Mark as running in DB
  await state.supabase
    .from("automation_jobs")
    .update({ running_at: new Date(startedAt).toISOString() })
    .eq("id", job.id)

  try {
    // Get site hostname
    console.log(`[CronService] Looking up site for site_id: ${job.site_id}`)
    const { data: site, error: siteError } = await state.supabase
      .from("domains")
      .select("hostname")
      .eq("domain_id", job.site_id)
      .single()

    if (siteError) {
      console.error("[CronService] Error querying domains table:", siteError)
      throw new Error(`Failed to lookup site: ${siteError.message}`)
    }

    if (!site?.hostname) {
      console.error(`[CronService] Site not found for site_id: ${job.site_id}`)
      throw new Error(`Site not found (site_id: ${job.site_id})`)
    }

    console.log(`[CronService] Resolved site ${job.site_id} to hostname: ${site.hostname}`)

    // Run the automation
    const { runAutomationJob } = await import("./executor")
    const result = await runAutomationJob({
      jobId: job.id,
      userId: job.user_id,
      orgId: job.org_id,
      workspace: site.hostname,
      prompt: job.action_prompt || "",
      timeoutSeconds: job.action_timeout_seconds || 300,
      model: job.action_model || undefined,
      thinkingPrompt: job.action_thinking || undefined,
    })

    const durationMs = Date.now() - startedAt

    if (result.success) {
      await finishJob(job, {
        status: "success",
        durationMs,
        summary: extractSummary(result.response),
        messages: result.messages,
      })
    } else {
      await finishJob(job, {
        status: "failure",
        durationMs,
        error: result.error,
        messages: result.messages,
      })
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    await finishJob(job, {
      status: "failure",
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    state.runningJobs.delete(job.id)
  }
}

async function finishJob(
  job: AutomationJob,
  result: {
    status: "success" | "failure" | "skipped"
    durationMs: number
    error?: string
    summary?: string
    messages?: unknown[]
  },
): Promise<void> {
  if (!state) return

  const now = Date.now()

  // Compute next run time
  let nextRunAt: string | null = null
  let consecutiveFailures = job.consecutive_failures || 0
  let isActive = job.is_active

  if (result.status === "success") {
    consecutiveFailures = 0

    if (job.trigger_type === "one-time") {
      // One-time job completed, disable it
      isActive = false
    } else if (job.trigger_type === "cron" && job.cron_schedule) {
      // Compute next cron run
      const nextMs = computeNextRunAtMs(
        { kind: "cron", expr: job.cron_schedule, tz: job.cron_timezone || undefined },
        now,
      )
      if (nextMs) {
        nextRunAt = new Date(nextMs).toISOString()
      }
    }
  } else if (result.status === "failure") {
    consecutiveFailures += 1

    if (consecutiveFailures >= state.config.maxRetries) {
      // Too many failures, disable the job
      console.warn(
        `[CronService] Job "${job.name}" (${job.id}) DISABLED after ${consecutiveFailures}/${state.config.maxRetries} failures. Last error: ${result.error}`,
      )
      isActive = false
    } else {
      // Exponential backoff for retry
      const backoffMs = state.config.retryBaseDelayMs * 2 ** (consecutiveFailures - 1)
      nextRunAt = new Date(now + backoffMs).toISOString()
      console.log(
        `[CronService] Job "${job.name}" (${job.id}) failed: ${result.error || "unknown error"} (attempt ${consecutiveFailures}/${state.config.maxRetries}) - retrying in ${Math.round(backoffMs / 1000)}s`,
      )
    }
  }

  // Update job in DB
  await state.supabase
    .from("automation_jobs")
    .update({
      running_at: null,
      last_run_at: new Date(now - result.durationMs).toISOString(),
      last_run_status: result.status,
      last_run_error: result.error || null,
      last_run_duration_ms: result.durationMs,
      next_run_at: nextRunAt,
      is_active: isActive,
      consecutive_failures: consecutiveFailures,
    })
    .eq("id", job.id)

  // Create run record with full message log
  await state.supabase.from("automation_runs").insert({
    job_id: job.id,
    started_at: new Date(now - result.durationMs).toISOString(),
    completed_at: new Date(now).toISOString(),
    duration_ms: result.durationMs,
    status: result.status,
    error: result.error,
    result: result.summary ? { summary: result.summary } : null,
    messages: result.messages ?? null, // Full conversation log
    triggered_by: "scheduler",
  })

  // Emit finished event
  emit({
    jobId: job.id,
    action: "finished",
    status: result.status,
    durationMs: result.durationMs,
    error: result.error,
    summary: result.summary,
    nextRunAtMs: nextRunAt ? new Date(nextRunAt).getTime() : undefined,
  })

  // Log to run log (includes full messages for debugging)
  await appendRunLog(job.id, {
    action: "finished",
    status: result.status,
    error: result.error,
    summary: result.summary,
    runAtMs: now - result.durationMs,
    durationMs: result.durationMs,
    nextRunAtMs: nextRunAt ? new Date(nextRunAt).getTime() : undefined,
    retryAttempt: consecutiveFailures > 0 ? consecutiveFailures : undefined,
    messages: result.messages,
  }).catch(() => {}) // Don't fail if logging fails

  // Post summary to user's chat (if successful)
  if (result.status === "success" && result.summary) {
    await postSummaryToChat(job, result.summary)
  }
}

// ============================================
// Internal: Helpers
// ============================================

function emit(event: CronEvent): void {
  if (!state) return
  try {
    state.config.onEvent(event)
  } catch {
    // Ignore callback errors
  }
}

function extractSummary(response: string | undefined): string | undefined {
  if (!response) return undefined

  // Try to extract a concise summary from the response
  // Look for common patterns like "I added X articles" or "Updated Y files"
  const lines = response.split("\n").filter(l => l.trim())

  // Return first meaningful line, truncated
  const firstLine = lines[0]?.trim() || ""
  if (firstLine.length > 200) {
    return `${firstLine.slice(0, 197)}...`
  }
  return firstLine || undefined
}

async function postSummaryToChat(job: AutomationJob, summary: string): Promise<void> {
  // Broadcast to connected SSE clients
  try {
    const { broadcastAutomationEvent } = await import("@/app/api/automations/events/route")
    broadcastAutomationEvent(job.user_id, {
      type: "finished",
      jobId: job.id,
      jobName: job.name,
      status: "success",
      summary,
    })
    console.log(`[CronService] Job "${job.name}" (${job.id}) completed and broadcasted to user ${job.user_id}`)
  } catch (error) {
    // SSE broadcast failed, not critical but log it
    console.warn(
      `[CronService] Failed to broadcast completion for job "${job.name}" (${job.id}):`,
      error instanceof Error ? error.message : String(error),
    )
  }

  // Log summary for debugging
  console.log(`[CronService] Job "${job.name}" (${job.id}) summary: ${summary}`)
}
