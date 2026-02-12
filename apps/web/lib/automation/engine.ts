/**
 * Automation Engine
 *
 * Single source of truth for claim → execute → finish lifecycle.
 * Used by CronService, public trigger route, and internal trigger route.
 *
 * Key design decisions:
 * - RunContext captures DB client + config at claim time (survives stopCronService)
 * - Lease-based locking with run_id prevents stale runners from clobbering state
 * - Conditional finish: UPDATE ... WHERE run_id = $myRunId
 * - Heartbeat extends lease during long-running jobs
 */

import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { computeNextRunAtMs } from "@webalive/automation"
import type { AppDatabase } from "@webalive/database"
import { getServerId } from "@webalive/shared"
import { createServiceAppClient } from "@/lib/supabase/service"
import { appendRunLog } from "./run-log"

type AppClient = ReturnType<typeof createServiceAppClient>
type AutomationJob = AppDatabase["app"]["Tables"]["automation_jobs"]["Row"]

// =============================================================================
// Types
// =============================================================================

/** Captured at claim time — survives singleton teardown */
export interface RunContext {
  supabase: AppClient
  job: AutomationJob
  hostname: string
  runId: string
  claimedAt: string
  serverId: string
  /** Timeout in seconds from job config */
  timeoutSeconds: number
  /** Who triggered this run */
  triggeredBy: "scheduler" | "manual" | "internal"
  /** Heartbeat interval handle (cleared on finish) */
  heartbeatInterval: ReturnType<typeof setInterval> | null
}

export interface ClaimOptions {
  supabase?: AppClient
  triggeredBy: "scheduler" | "manual" | "internal"
  serverId?: string
  /** Default lease duration in seconds (default: job timeout + 120s buffer) */
  leaseDurationSeconds?: number
}

export interface FinishOptions {
  status: "success" | "failure" | "skipped"
  durationMs: number
  error?: string
  summary?: string
  messages?: unknown[]
  /** Config for retry behavior */
  maxRetries?: number
  retryBaseDelayMs?: number
}

// =============================================================================
// Constants
// =============================================================================

/** Extra seconds beyond timeout for lease (buffer for cleanup) */
const LEASE_BUFFER_SECONDS = 120

/** Heartbeat interval: extend lease every 30 seconds */
const HEARTBEAT_INTERVAL_MS = 30_000

/** Directory for message transcripts (kept out of DB to avoid bloat) */
const MESSAGES_DIR = "/var/log/automation-runs/messages"

// =============================================================================
// Batch Claim (FOR UPDATE SKIP LOCKED)
// =============================================================================

/**
 * Claim up to `limit` due jobs atomically using a single DB round-trip.
 * Uses the `claim_due_jobs` RPC (FOR UPDATE SKIP LOCKED) — no race windows.
 *
 * Returns RunContext[] for all successfully claimed jobs.
 * Jobs whose hostname can't be resolved are released immediately.
 */
export async function claimDueJobs(opts: {
  supabase: AppClient
  serverId: string
  limit: number
  triggeredBy: "scheduler"
}): Promise<RunContext[]> {
  const { supabase, serverId, limit } = opts

  const { data: claimedJobs, error } = await supabase.rpc("claim_due_jobs", {
    p_server_id: serverId,
    p_limit: limit,
    p_claimed_by: serverId,
  })

  if (error) {
    console.error("[Engine] claim_due_jobs RPC error:", error)
    return []
  }

  if (!claimedJobs?.length) return []

  console.log(
    `[Engine] DB claimed ${claimedJobs.length} job(s): ${claimedJobs.map((j: AutomationJob) => `"${j.name}" (${j.id})`).join(", ")}`,
  )

  // Resolve hostnames and build RunContexts
  const contexts: RunContext[] = []

  for (const job of claimedJobs as AutomationJob[]) {
    if (!job.run_id) {
      // RPC should always set run_id — release and skip if it didn't
      await supabase
        .from("automation_jobs")
        .update({ status: "idle", running_at: null, run_id: null, claimed_by: null, lease_expires_at: null })
        .eq("id", job.id)
      console.error(`[Engine] RPC returned no run_id for claimed job "${job.name}" (${job.id}), released`)
      continue
    }

    const { data: site } = await supabase.from("domains").select("hostname").eq("domain_id", job.site_id).single()

    if (!site?.hostname) {
      // Can't resolve site — release claim (guarded by run_id)
      await supabase
        .from("automation_jobs")
        .update({ status: "idle", running_at: null, run_id: null, claimed_by: null, lease_expires_at: null })
        .eq("id", job.id)
        .eq("run_id", job.run_id)
      console.error(`[Engine] Site not found for claimed job "${job.name}" (site_id: ${job.site_id}), released`)
      continue
    }

    const ctx: RunContext = {
      supabase,
      job,
      hostname: site.hostname,
      runId: job.run_id,
      claimedAt: job.running_at ?? new Date().toISOString(),
      serverId,
      timeoutSeconds: job.action_timeout_seconds ?? 300,
      triggeredBy: opts.triggeredBy,
      heartbeatInterval: null,
    }

    // Start heartbeat
    ctx.heartbeatInterval = setInterval(() => {
      void extendLease(ctx).catch(err => {
        console.warn(`[Engine] Heartbeat failed for "${job.name}" (${job.id}):`, err)
      })
    }, HEARTBEAT_INTERVAL_MS)

    contexts.push(ctx)
  }

  return contexts
}

// =============================================================================
// Single Claim (for manual/internal triggers)
// =============================================================================

/**
 * Atomically claim a single job for execution.
 * Sets run_id, claimed_by, running_at, and lease_expires_at.
 * Returns null if the job is already claimed.
 *
 * Used by manual trigger and internal trigger routes.
 * For scheduled jobs, prefer claimDueJobs() which uses FOR UPDATE SKIP LOCKED.
 */
export async function claimJob(job: AutomationJob, opts: ClaimOptions): Promise<RunContext | null> {
  const supabase = opts.supabase ?? createServiceAppClient()
  const serverId = opts.serverId ?? getServerId() ?? "unknown"
  const runId = randomUUID()
  const claimedAt = new Date().toISOString()
  const timeoutSeconds = job.action_timeout_seconds ?? 300
  const leaseDuration = opts.leaseDurationSeconds ?? timeoutSeconds + LEASE_BUFFER_SECONDS
  const leaseExpiresAt = new Date(Date.now() + leaseDuration * 1000).toISOString()

  // Atomic claim: only succeed if running_at is still null
  const { count: claimCount, error: claimError } = await supabase
    .from("automation_jobs")
    .update(
      {
        status: "running",
        running_at: claimedAt,
        run_id: runId,
        claimed_by: serverId,
        lease_expires_at: leaseExpiresAt,
      },
      { count: "exact" },
    )
    .eq("id", job.id)
    .is("running_at", null)

  if (claimError) {
    console.error(`[Engine] Claim error for "${job.name}" (${job.id}):`, claimError)
    return null
  }

  if (!claimCount) {
    console.log(`[Engine] Job "${job.name}" (${job.id}) already claimed, skipping`)
    return null
  }

  // Resolve hostname
  const { data: site } = await supabase.from("domains").select("hostname").eq("domain_id", job.site_id).single()

  if (!site?.hostname) {
    // Release claim since we can't resolve the site
    await supabase
      .from("automation_jobs")
      .update({ status: "idle", running_at: null, run_id: null, claimed_by: null, lease_expires_at: null })
      .eq("id", job.id)
      .eq("run_id", runId)
    console.error(`[Engine] Site not found for job "${job.name}" (site_id: ${job.site_id})`)
    return null
  }

  console.log(`[Engine] Claimed job "${job.name}" (${job.id}) run_id=${runId} server=${serverId}`)

  const ctx: RunContext = {
    supabase,
    job,
    hostname: site.hostname,
    runId,
    claimedAt,
    serverId,
    timeoutSeconds,
    triggeredBy: opts.triggeredBy,
    heartbeatInterval: null,
  }

  // Start heartbeat to extend lease during execution
  ctx.heartbeatInterval = setInterval(() => {
    void extendLease(ctx).catch(err => {
      console.warn(`[Engine] Heartbeat failed for "${job.name}" (${job.id}):`, err)
    })
  }, HEARTBEAT_INTERVAL_MS)

  return ctx
}

// =============================================================================
// Execute
// =============================================================================

/**
 * Execute a claimed job. Pure execution — calls runAutomationJob.
 * Returns the result without touching DB state (that's finishJob's job).
 */
export async function executeJob(ctx: RunContext): Promise<{
  success: boolean
  durationMs: number
  error?: string
  response?: string
  messages?: unknown[]
}> {
  const startTime = Date.now()

  try {
    const { runAutomationJob } = await import("./executor")
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

    return {
      success: result.success,
      durationMs: result.durationMs,
      error: result.error,
      response: result.response,
      messages: result.messages,
    }
  } catch (error) {
    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// =============================================================================
// Finish
// =============================================================================

/**
 * Finish a job run. Conditionally updates DB only if our run_id still matches.
 * This prevents a stale runner from overwriting a newer run's state.
 */
export async function finishJob(ctx: RunContext, result: FinishOptions): Promise<void> {
  // Stop heartbeat
  if (ctx.heartbeatInterval) {
    clearInterval(ctx.heartbeatInterval)
    ctx.heartbeatInterval = null
  }

  const now = Date.now()
  const maxRetries = result.maxRetries ?? 3
  const retryBaseDelayMs = result.retryBaseDelayMs ?? 60_000

  console.log(
    `[Engine] finishJob "${ctx.job.name}" (${ctx.job.id}): ${result.status} in ${result.durationMs}ms${result.error ? ` - ${result.error.slice(0, 100)}` : ""}`,
  )

  // Compute next run time and failure tracking
  let nextRunAt: string | null = null
  let consecutiveFailures = ctx.job.consecutive_failures ?? 0
  let isActive = ctx.job.is_active
  let jobStatus: "idle" | "disabled" = "idle"

  if (result.status === "success") {
    consecutiveFailures = 0

    if (ctx.job.trigger_type === "one-time") {
      isActive = false
      jobStatus = "disabled"
    } else if (ctx.job.trigger_type === "cron" && ctx.job.cron_schedule) {
      const nextMs = computeNextRunAtMs(
        { kind: "cron", expr: ctx.job.cron_schedule, tz: ctx.job.cron_timezone ?? undefined },
        now,
      )
      if (nextMs) {
        nextRunAt = new Date(nextMs).toISOString()
      }
    }
  } else if (result.status === "failure") {
    consecutiveFailures += 1

    if (consecutiveFailures >= maxRetries) {
      console.warn(
        `[Engine] Job "${ctx.job.name}" (${ctx.job.id}) DISABLED after ${consecutiveFailures}/${maxRetries} failures`,
      )
      isActive = false
      jobStatus = "disabled"
    } else {
      // Exponential backoff with jitter for retry
      const baseMs = retryBaseDelayMs * 2 ** (consecutiveFailures - 1)
      const jitter = Math.random() * baseMs * 0.2
      nextRunAt = new Date(now + baseMs + jitter).toISOString()
      console.log(`[Engine] Job "${ctx.job.name}" (${ctx.job.id}) retry ${consecutiveFailures}/${maxRetries}`)
    }
  }

  // Write messages to file storage instead of DB (avoids bloat)
  let messagesUri: string | null = null
  if (result.messages?.length) {
    messagesUri = await writeMessagesToFile(ctx.runId, result.messages)
  }

  // Conditional update: only if our run_id still owns the job
  const { count: updateCount } = await ctx.supabase
    .from("automation_jobs")
    .update(
      {
        status: jobStatus,
        running_at: null,
        run_id: null,
        claimed_by: null,
        lease_expires_at: null,
        last_run_at: ctx.claimedAt,
        last_run_status: result.status,
        last_run_error: result.error ?? null,
        last_run_duration_ms: result.durationMs,
        next_run_at: nextRunAt,
        is_active: isActive,
        consecutive_failures: consecutiveFailures,
      },
      { count: "exact" },
    )
    .eq("id", ctx.job.id)
    .eq("run_id", ctx.runId)

  if (!updateCount) {
    console.warn(
      `[Engine] Conditional finish failed for "${ctx.job.name}" (${ctx.job.id}) — run_id mismatch (ours: ${ctx.runId}). Another runner took over.`,
    )
    return
  }

  // Insert run record (messages stored as file, not in DB)
  const { error: runInsertError } = await ctx.supabase.from("automation_runs").insert({
    job_id: ctx.job.id,
    started_at: ctx.claimedAt,
    completed_at: new Date(now).toISOString(),
    duration_ms: result.durationMs,
    status: result.status,
    error: result.error ?? null,
    result: result.summary ? { summary: result.summary } : null,
    messages: null,
    messages_uri: messagesUri,
    triggered_by: ctx.triggeredBy,
  })

  if (runInsertError) {
    console.error(`[Engine] Failed to insert run record for "${ctx.job.name}":`, runInsertError)
  }

  // Log to file-based run log
  await appendRunLog(ctx.job.id, {
    action: "finished",
    status: result.status,
    error: result.error,
    summary: result.summary,
    runAtMs: new Date(ctx.claimedAt).getTime(),
    durationMs: result.durationMs,
    nextRunAtMs: nextRunAt ? new Date(nextRunAt).getTime() : undefined,
    retryAttempt: consecutiveFailures > 0 ? consecutiveFailures : undefined,
    messages: result.messages,
  }).catch(() => {}) // Don't fail if logging fails

  // Broadcast SSE event for UI updates
  if (result.status === "success" && result.summary) {
    try {
      const { broadcastAutomationEvent } = await import("@/app/api/automations/events/route")
      broadcastAutomationEvent(ctx.job.user_id, {
        type: "finished",
        jobId: ctx.job.id,
        jobName: ctx.job.name,
        status: "success",
        summary: result.summary,
      })
    } catch {
      // SSE broadcast failure is not critical
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Write messages to file storage, return the file URI */
async function writeMessagesToFile(runId: string, messages: unknown[]): Promise<string | null> {
  let tempPath: string | null = null
  try {
    // run_id should be a UUID, but we still sanitize to avoid accidental path injection.
    const safeRunId = runId.replace(/[^a-zA-Z0-9_-]/g, "")
    if (!safeRunId) {
      console.error(`[Engine] Invalid runId for message write: ${runId}`)
      return null
    }

    const serialized = JSON.stringify(messages)
    await fs.mkdir(MESSAGES_DIR, { recursive: true })
    const filePath = path.join(MESSAGES_DIR, `${safeRunId}.json`)
    tempPath = path.join(MESSAGES_DIR, `${safeRunId}.${randomUUID()}.tmp`)

    // Atomic write: write temp file then rename.
    await fs.writeFile(tempPath, serialized, { encoding: "utf-8", mode: 0o600 })
    await fs.rename(tempPath, filePath)
    return `file://${filePath}`
  } catch (err) {
    console.error(`[Engine] Failed to write messages to file for run ${runId}:`, err)
    if (tempPath) {
      await fs.rm(tempPath, { force: true }).catch(() => {})
    }
    return null
  }
}

/** Read messages from file storage by URI */
export async function readMessagesFromUri(uri: string): Promise<unknown[] | null> {
  if (!uri.startsWith("file://")) return null

  const filePath = uri.slice("file://".length)
  if (!filePath.endsWith(".json")) return null
  if (!isWithinDirectory(filePath, MESSAGES_DIR)) return null

  try {
    const [messagesDirRealPath, fileRealPath] = await Promise.all([
      fs.realpath(MESSAGES_DIR).catch(() => path.resolve(MESSAGES_DIR)),
      fs.realpath(filePath),
    ])
    if (!isWithinDirectory(fileRealPath, messagesDirRealPath)) return null

    const data = await fs.readFile(fileRealPath, "utf-8")
    const parsed: unknown = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isWithinDirectory(candidatePath: string, baseDir: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath)
  const resolvedBaseDir = path.resolve(baseDir)
  return resolvedCandidate === resolvedBaseDir || resolvedCandidate.startsWith(`${resolvedBaseDir}${path.sep}`)
}

/** Extend the lease for a running job (heartbeat) */
async function extendLease(ctx: RunContext): Promise<void> {
  const newExpiry = new Date(Date.now() + (ctx.timeoutSeconds + LEASE_BUFFER_SECONDS) * 1000).toISOString()

  const { count } = await ctx.supabase
    .from("automation_jobs")
    .update({ lease_expires_at: newExpiry }, { count: "exact" })
    .eq("id", ctx.job.id)
    .eq("run_id", ctx.runId)

  if (!count) {
    console.warn(`[Engine] Heartbeat: run_id mismatch for "${ctx.job.name}" — stopping heartbeat`)
    if (ctx.heartbeatInterval) {
      clearInterval(ctx.heartbeatInterval)
      ctx.heartbeatInterval = null
    }
  }
}

/** Extract a concise summary from a response string */
export function extractSummary(response: string | undefined): string | undefined {
  if (!response) return undefined
  const lines = response.split("\n").filter(l => l.trim())
  const firstLine = lines[0]?.trim() ?? ""
  if (firstLine.length > 200) {
    return `${firstLine.slice(0, 197)}...`
  }
  return firstLine || undefined
}
