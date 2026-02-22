/**
 * CronService - Pure Scheduler
 *
 * Finds due jobs and delegates execution to the web app's internal trigger.
 * The web handles claim → execute → finish using its existing infrastructure
 * (worker pool, OAuth, credits, SSE broadcasting).
 *
 * This process just owns the SCHEDULE — when to wake, what's due, stale reaping.
 * Survives web deploys since it's a separate systemd service.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AppDatabase } from "@webalive/database"
import { AutomationTriggerResponseSchema } from "@webalive/shared"
import { Sentry } from "./sentry"

type AppClient = SupabaseClient<AppDatabase, "app">

// ============================================
// Configuration
// ============================================

/** Web app URL for internal trigger calls */
const WEB_URL = `http://localhost:${process.env.PORT ?? "9000"}`

// ============================================
// Service State
// ============================================

type ServiceState = {
  supabase: AppClient
  serverId: string
  jwtSecret: string
  timer: ReturnType<typeof setTimeout> | null
  triggeredJobs: Set<string>
  started: boolean
  stopping: boolean
}

let state: ServiceState | null = null

// ============================================
// Public API
// ============================================

export async function startCronService(supabase: AppClient, serverId: string): Promise<void> {
  if (state?.started) {
    console.log("[CronService] Already started")
    return
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    console.error("[CronService] FATAL: JWT_SECRET not set")
    process.exit(1)
  }

  state = {
    supabase,
    serverId,
    jwtSecret,
    timer: null,
    triggeredJobs: new Set(),
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
  triggeredJobs: number
  nextWakeAt: Date | null
} {
  if (!state) {
    return { started: false, triggeredJobs: 0, nextWakeAt: null }
  }
  return {
    started: state.started,
    triggeredJobs: state.triggeredJobs.size,
    nextWakeAt: null,
  }
}

/** Re-check for due jobs immediately. Called when jobs are created/updated. */
export function pokeCronService(): void {
  if (!state || state.stopping) return
  console.log("[CronService] Poked — re-arming timer")
  void armTimer()
}

/** Manually trigger a job via the web's internal endpoint */
export async function triggerJob(jobId: string): Promise<{ success: boolean; error?: string }> {
  if (!state) {
    return { success: false, error: "Service not started" }
  }
  return triggerViaWeb(jobId)
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
    .eq("status", "idle")
    .is("run_id", null)
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
    await triggerDueJobs()
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
    .eq("status", "running")
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
          .update({ status: "idle", running_at: null, run_id: null, claimed_by: null, lease_expires_at: null })
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
      .update({ status: "idle", running_at: null, run_id: null, claimed_by: null, lease_expires_at: null })
      .eq("id", stale.id)
    if (stale.run_id) {
      await reapQuery.eq("run_id", stale.run_id)
    } else {
      await reapQuery
    }
  }
}

// ============================================
// Internal: Job Triggering (via Web App)
// ============================================

/**
 * Find due jobs and trigger each via the web app's internal endpoint.
 * The web handles claim → execute → finish. We just tell it WHAT to run.
 */
async function triggerDueJobs(): Promise<void> {
  if (!state) return

  // Find due jobs (not running, next_run_at <= now, on this server)
  const { data: dueJobs } = await state.supabase
    .from("automation_jobs")
    .select("id, name, domains!inner(server_id)")
    .eq("is_active", true)
    .eq("status", "idle")
    .is("run_id", null)
    .is("running_at", null)
    .not("next_run_at", "is", null)
    .lte("next_run_at", new Date().toISOString())
    .eq("domains.server_id", state.serverId)
    .limit(5)

  if (!dueJobs?.length) return

  console.log(
    `[CronService] Found ${dueJobs.length} due job(s): ${dueJobs.map(j => `"${j.name}" (${j.id})`).join(", ")}`,
  )

  // Trigger each via the web app — fire and forget
  const results = await Promise.allSettled(dueJobs.map(job => triggerViaWeb(job.id)))

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const job = dueJobs[i]
    if (result.status === "rejected") {
      console.error(`[CronService] Failed to trigger "${job.name}" (${job.id}):`, result.reason)
    } else if (!result.value.success) {
      console.warn(`[CronService] Trigger "${job.name}" (${job.id}): ${result.value.error}`)
    }
  }
}

/**
 * POST to the web app's internal automation trigger.
 * The web claims the job, runs it via worker pool, and finishes it.
 */
async function triggerViaWeb(jobId: string): Promise<{ success: boolean; error?: string }> {
  if (!state) return { success: false, error: "Service not started" }

  try {
    state.triggeredJobs.add(jobId)

    const res = await fetch(`${WEB_URL}/api/internal/automation/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": state.jwtSecret,
      },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(10 * 60 * 1000), // 10 min max
    })

    const data = AutomationTriggerResponseSchema.parse(await res.json())

    if (res.ok) {
      console.log(`[CronService] Job ${jobId} completed: ${data.ok ? "success" : "failure"} (${data.durationMs}ms)`)
      return { success: data.ok ?? false, error: data.error }
    }

    return { success: false, error: data.error ?? `HTTP ${res.status}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[CronService] Trigger request failed for ${jobId}:`, msg)
    Sentry.withScope(scope => {
      scope.setTag("jobId", jobId)
      scope.setFingerprint(["cron-trigger-failure"])
      scope.setLevel("error")
      Sentry.captureException(err)
    })
    return { success: false, error: msg }
  } finally {
    state?.triggeredJobs.delete(jobId)
  }
}
