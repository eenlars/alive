/**
 * CronService - Standalone automation scheduler
 *
 * Runs as a separate process from Next.js. Survives web deploys.
 *
 * Uses setTimeout-based scheduling that wakes exactly when the next job is due.
 *
 * Hardened features:
 * - RunContext pattern: DB client captured at claim time
 * - Lease-based locking: run_id + claimed_by + lease_expires_at
 * - Conditional finish: only updates if our run_id still owns the job
 * - Heartbeat: extends lease every 30s during long-running jobs
 * - Promise.allSettled: one failing job doesn't block others
 * - Jitter: prevents thundering herd on timer wakeups
 * - pokeCronService(): immediate re-arm when jobs are created/updated
 * - Dynamic reaper: uses lease_expires_at instead of hardcoded 1h threshold
 */

import {
  type AppClient,
  type CronEvent,
  type CronServiceConfig,
  type RunContext,
  appendRunLog,
  claimDueJobs,
  claimJob,
  extractSummary,
  finishJob,
} from "@webalive/automation-engine"
import { runAutomationJob } from "./executor"

// ============================================
// Service State
// ============================================

type ServiceState = {
  supabase: AppClient
  config: Required<CronServiceConfig>
  serverId: string
  timer: ReturnType<typeof setTimeout> | null
  runningJobs: Map<string, RunContext>
  started: boolean
  stopping: boolean
}

// Singleton state
let state: ServiceState | null = null

// ============================================
// Public API
// ============================================

export async function startCronService(
  supabase: AppClient,
  serverId: string,
  config: CronServiceConfig = {},
): Promise<void> {
  if (state?.started) {
    console.log("[CronService] Already started")
    return
  }

  state = {
    supabase,
    serverId,
    config: {
      maxConcurrent: config.maxConcurrent ?? 3,
      maxRetries: config.maxRetries ?? 3,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 60_000,
      onEvent: config.onEvent ?? (() => {}),
      enabled: true,
    },
    timer: null,
    runningJobs: new Map(),
    started: true,
    stopping: false,
  }

  console.log(`[CronService] Starting (server: ${serverId})...`)
  await armTimer()
  console.log("[CronService] Started")
}

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
    nextWakeAt: null,
  }
}

/** Re-check for due jobs immediately. Called when jobs are created/updated. */
export function pokeCronService(): void {
  if (!state || state.stopping) return
  console.log("[CronService] Poked — re-arming timer")
  void armTimer()
}

/** Manually trigger a job */
export async function triggerJob(jobId: string): Promise<{ success: boolean; error?: string }> {
  if (!state) {
    return { success: false, error: "Service not started" }
  }

  const { data: job } = await state.supabase.from("automation_jobs").select("*").eq("id", jobId).single()

  if (!job) {
    return { success: false, error: "Job not found" }
  }

  const ctx = await claimJob(job, {
    supabase: state.supabase,
    triggeredBy: "scheduler",
    serverId: state.serverId,
  })

  if (!ctx) {
    return { success: false, error: "Job already running" }
  }

  state.runningJobs.set(job.id, ctx)
  await runClaimedJob(ctx)
  return { success: true }
}

// ============================================
// Internal: Timer Management
// ============================================

const MAX_TIMEOUT_MS = 2 ** 31 - 1

async function armTimer(): Promise<void> {
  if (!state || state.stopping) return

  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }

  // Reap stale jobs BEFORE checking for schedulable work
  await reapStaleJobs()

  const nextWakeMs = await getNextWakeTime()
  if (!nextWakeMs) {
    console.log("[CronService] No jobs scheduled, sleeping...")
    state.timer = setTimeout(() => void armTimer(), 5 * 60 * 1000)
    return
  }

  const jitter = Math.random() * 5000
  const delay = Math.max(1000, nextWakeMs - Date.now()) + jitter
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
    .select("next_run_at, domains!inner(server_id)")
    .eq("is_active", true)
    .is("running_at", null)
    .not("next_run_at", "is", null)
    .eq("domains.server_id", state.serverId)
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
// Internal: Stale Reaping (Lease-Based)
// ============================================

async function reapStaleJobs(): Promise<void> {
  if (!state) return

  const now = new Date().toISOString()
  const { data: staleJobs } = await state.supabase
    .from("automation_jobs")
    .select("id, name, running_at, lease_expires_at, run_id, domains!inner(server_id)")
    .eq("is_active", true)
    .not("running_at", "is", null)
    .eq("domains.server_id", state.serverId)
    .lt("lease_expires_at", now)

  if (!staleJobs?.length) {
    // Fallback: reap legacy jobs with running_at but NO lease_expires_at
    const legacyThreshold = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: legacyStale } = await state.supabase
      .from("automation_jobs")
      .select("id, name, running_at, domains!inner(server_id)")
      .eq("is_active", true)
      .not("running_at", "is", null)
      .is("lease_expires_at", null)
      .eq("domains.server_id", state.serverId)
      .lt("running_at", legacyThreshold)

    if (legacyStale?.length) {
      for (const stale of legacyStale) {
        console.warn(
          `[CronService] Reaping legacy stale job "${stale.name}" (${stale.id}), stuck since ${stale.running_at}`,
        )
        await state.supabase
          .from("automation_jobs")
          .update({ running_at: null, run_id: null, claimed_by: null, lease_expires_at: null })
          .eq("id", stale.id)
      }
    }
    return
  }

  for (const stale of staleJobs) {
    console.warn(
      `[CronService] Reaping stale job "${stale.name}" (${stale.id}), lease expired at ${stale.lease_expires_at}`,
    )
    const reapQuery = state.supabase
      .from("automation_jobs")
      .update({ running_at: null, run_id: null, claimed_by: null, lease_expires_at: null })
      .eq("id", stale.id)
    if (stale.run_id) {
      await reapQuery.eq("run_id", stale.run_id)
    } else {
      await reapQuery
    }
  }
}

// ============================================
// Internal: Job Execution
// ============================================

async function runDueJobs(): Promise<void> {
  if (!state) return

  const availableSlots = state.config.maxConcurrent - state.runningJobs.size
  if (availableSlots <= 0) {
    console.log(`[CronService] All slots full (${state.runningJobs.size}/${state.config.maxConcurrent}), skipping`)
    return
  }

  const contexts = await claimDueJobs({
    supabase: state.supabase,
    serverId: state.serverId,
    limit: availableSlots,
    triggeredBy: "scheduler",
  })

  if (!contexts.length) return

  console.log(`[CronService] Executing ${contexts.length} claimed job(s)`)

  for (const ctx of contexts) {
    state.runningJobs.set(ctx.job.id, ctx)
  }

  const results = await Promise.allSettled(contexts.map(ctx => runClaimedJob(ctx)))

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === "rejected") {
      console.error(`[CronService] Unexpected rejection for job ${contexts[i].job.id}:`, result.reason)
    }
  }
}

async function runClaimedJob(ctx: RunContext): Promise<void> {
  const startedAt = Date.now()

  emit({ jobId: ctx.job.id, action: "started", runAtMs: startedAt })
  await appendRunLog(ctx.job.id, { action: "started", runAtMs: startedAt }).catch(() => {})

  try {
    const result = await runAutomationJob({
      jobId: ctx.job.id,
      userId: ctx.job.user_id,
      orgId: ctx.job.org_id,
      workspace: ctx.hostname,
      prompt: ctx.job.action_prompt ?? "",
      timeoutSeconds: ctx.timeoutSeconds,
      model: ctx.job.action_model ?? undefined,
      thinkingPrompt: ctx.job.action_thinking ?? undefined,
      skills: ctx.job.skills ?? undefined,
    })

    const durationMs = Date.now() - startedAt

    await finishJob(ctx, {
      status: result.success ? "success" : "failure",
      durationMs,
      error: result.error,
      summary: result.success ? extractSummary(result.response) : undefined,
      messages: result.messages,
      maxRetries: state?.config.maxRetries,
      retryBaseDelayMs: state?.config.retryBaseDelayMs,
    })

    emit({
      jobId: ctx.job.id,
      action: "finished",
      status: result.success ? "success" : "failure",
      durationMs,
      error: result.error,
      summary: result.success ? extractSummary(result.response) : undefined,
    })
  } catch (error) {
    const durationMs = Date.now() - startedAt
    await finishJob(ctx, {
      status: "failure",
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      maxRetries: state?.config.maxRetries,
      retryBaseDelayMs: state?.config.retryBaseDelayMs,
    })
  } finally {
    state?.runningJobs.delete(ctx.job.id)
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
