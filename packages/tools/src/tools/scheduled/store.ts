/**
 * Scheduled Jobs Store
 *
 * Manages scheduled jobs in Supabase (app.scheduled_jobs table).
 * Falls back to in-memory store if table doesn't exist.
 */

import type {
  ScheduledJob,
  ScheduledJobCreate,
  ScheduledJobListParams,
  ScheduledJobListResult,
  ScheduledJobUpdate,
} from "./types.js"
import { calculateNextRunTime } from "./types.js"

// In-memory fallback store (used when Supabase table doesn't exist)
const memoryStore = new Map<string, ScheduledJob>()

// Flag to track if we're using memory fallback
let usingMemoryFallback = false

/**
 * Generate a UUID for job IDs
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Create a new scheduled job
 */
export async function createJob(userId: string, orgId: string, params: ScheduledJobCreate): Promise<ScheduledJob> {
  const now = new Date()
  const id = generateId()

  const job: ScheduledJob = {
    id,
    userId,
    orgId,
    workspace: params.workspace,
    name: params.name,
    description: params.description,
    enabled: params.enabled ?? true,
    deleteAfterRun: params.deleteAfterRun ?? false,
    schedule: params.schedule,
    payload: params.payload,
    state: {
      nextRunAtMs: calculateNextRunTime(params.schedule) ?? undefined,
      runCount: 0,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  // Try Supabase first, fall back to memory
  try {
    const saved = await saveJobToSupabase(job)
    if (saved) return saved
  } catch (error) {
    console.warn("[ScheduledJobs] Supabase save failed, using memory store:", error)
  }

  // Memory fallback
  usingMemoryFallback = true
  memoryStore.set(id, job)
  return job
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<ScheduledJob | null> {
  // Try Supabase first
  try {
    const job = await getJobFromSupabase(jobId)
    if (job) return job
  } catch {
    // Fall through to memory
  }

  // Memory fallback
  return memoryStore.get(jobId) ?? null
}

/**
 * Update a job
 */
export async function updateJob(jobId: string, updates: ScheduledJobUpdate): Promise<ScheduledJob | null> {
  const existing = await getJob(jobId)
  if (!existing) return null

  const now = new Date()
  const updated: ScheduledJob = {
    ...existing,
    ...updates,
    schedule: updates.schedule ?? existing.schedule,
    payload: updates.payload ?? existing.payload,
    state: {
      ...existing.state,
      // Recalculate next run if schedule changed
      nextRunAtMs: updates.schedule
        ? (calculateNextRunTime(updates.schedule) ?? undefined)
        : existing.state.nextRunAtMs,
    },
    updatedAt: now.toISOString(),
  }

  // Try Supabase first
  try {
    const saved = await saveJobToSupabase(updated)
    if (saved) return saved
  } catch {
    // Fall through to memory
  }

  // Memory fallback
  memoryStore.set(jobId, updated)
  return updated
}

/**
 * Delete a job
 */
export async function deleteJob(jobId: string): Promise<boolean> {
  // Try Supabase first
  try {
    const deleted = await deleteJobFromSupabase(jobId)
    if (deleted) return true
  } catch {
    // Fall through to memory
  }

  // Memory fallback
  return memoryStore.delete(jobId)
}

/**
 * List jobs with optional filtering
 */
export async function listJobs(userId: string, params: ScheduledJobListParams = {}): Promise<ScheduledJobListResult> {
  const { workspace, enabled, limit = 50, offset = 0 } = params

  // Try Supabase first
  try {
    const result = await listJobsFromSupabase(userId, params)
    if (result) return result
  } catch {
    // Fall through to memory
  }

  // Memory fallback
  let jobs = Array.from(memoryStore.values()).filter(j => j.userId === userId)

  if (workspace) {
    jobs = jobs.filter(j => j.workspace === workspace)
  }
  if (enabled !== undefined) {
    jobs = jobs.filter(j => j.enabled === enabled)
  }

  const total = jobs.length
  const paged = jobs.slice(offset, offset + limit)

  return {
    jobs: paged,
    total,
    hasMore: offset + limit < total,
  }
}

/**
 * Get jobs that are due to run
 */
export async function getDueJobs(now: number = Date.now()): Promise<ScheduledJob[]> {
  // Try Supabase first
  try {
    const jobs = await getDueJobsFromSupabase(now)
    if (jobs) return jobs
  } catch {
    // Fall through to memory
  }

  // Memory fallback
  return Array.from(memoryStore.values()).filter(
    job => job.enabled && job.state.nextRunAtMs !== undefined && job.state.nextRunAtMs <= now && !job.state.runningAtMs,
  )
}

/**
 * Mark a job as running
 */
export async function markJobRunning(jobId: string, now: number = Date.now()): Promise<void> {
  const job = await getJob(jobId)
  if (!job) return

  job.state.runningAtMs = now
  job.updatedAt = new Date().toISOString()

  try {
    await saveJobToSupabase(job)
  } catch {
    memoryStore.set(jobId, job)
  }
}

/**
 * Mark a job as completed
 */
export async function markJobCompleted(
  jobId: string,
  result: { success: boolean; durationMs: number; error?: string },
): Promise<void> {
  const job = await getJob(jobId)
  if (!job) return

  const now = Date.now()

  job.state = {
    ...job.state,
    runningAtMs: undefined,
    lastRunAtMs: now,
    lastStatus: result.success ? "ok" : "error",
    lastError: result.error,
    lastDurationMs: result.durationMs,
    runCount: (job.state.runCount ?? 0) + 1,
    // Calculate next run time
    nextRunAtMs: job.schedule.kind === "at" ? undefined : (calculateNextRunTime(job.schedule, now) ?? undefined),
  }
  job.updatedAt = new Date().toISOString()

  // Handle deleteAfterRun for one-shot tasks
  if (job.deleteAfterRun && job.schedule.kind === "at") {
    await deleteJob(jobId)
    return
  }

  // Disable if it was a one-shot that completed
  if (job.schedule.kind === "at") {
    job.enabled = false
  }

  try {
    await saveJobToSupabase(job)
  } catch {
    memoryStore.set(jobId, job)
  }
}

// ============================================
// Supabase Operations (lazy loaded)
// ============================================

let supabaseClient: any = null

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient

  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) {
      return null
    }
    // Dynamic import to avoid circular dependencies
    const { createAppClient } = await import("@webalive/database")
    supabaseClient = createAppClient(url, key)
    return supabaseClient
  } catch {
    return null
  }
}

async function saveJobToSupabase(job: ScheduledJob): Promise<ScheduledJob | null> {
  const client = await getSupabaseClient()
  if (!client) return null

  const row = {
    id: job.id,
    user_id: job.userId,
    org_id: job.orgId,
    workspace: job.workspace,
    name: job.name,
    description: job.description,
    enabled: job.enabled,
    delete_after_run: job.deleteAfterRun,
    schedule: job.schedule,
    payload: job.payload,
    state: job.state,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  }

  const { data, error } = await client.from("scheduled_jobs").upsert(row, { onConflict: "id" }).select().single()

  if (error) {
    // Table might not exist yet
    if (error.code === "42P01") {
      console.warn("[ScheduledJobs] Table not found, using memory store")
      return null
    }
    throw error
  }

  return rowToJob(data)
}

async function getJobFromSupabase(jobId: string): Promise<ScheduledJob | null> {
  const client = await getSupabaseClient()
  if (!client) return null

  const { data, error } = await client.from("scheduled_jobs").select().eq("id", jobId).single()

  if (error) return null
  return rowToJob(data)
}

async function deleteJobFromSupabase(jobId: string): Promise<boolean> {
  const client = await getSupabaseClient()
  if (!client) return false

  const { error } = await client.from("scheduled_jobs").delete().eq("id", jobId)
  return !error
}

async function listJobsFromSupabase(
  userId: string,
  params: ScheduledJobListParams,
): Promise<ScheduledJobListResult | null> {
  const client = await getSupabaseClient()
  if (!client) return null

  let query = client.from("scheduled_jobs").select("*", { count: "exact" }).eq("user_id", userId)

  if (params.workspace) {
    query = query.eq("workspace", params.workspace)
  }
  if (params.enabled !== undefined) {
    query = query.eq("enabled", params.enabled)
  }

  const limit = params.limit ?? 50
  const offset = params.offset ?? 0

  query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false })

  const { data, error, count } = await query

  if (error) return null

  return {
    jobs: (data ?? []).map(rowToJob),
    total: count ?? 0,
    hasMore: (count ?? 0) > offset + limit,
  }
}

async function getDueJobsFromSupabase(now: number): Promise<ScheduledJob[] | null> {
  const client = await getSupabaseClient()
  if (!client) return null

  // Query jobs where next_run_at <= now AND enabled AND not currently running
  const { data, error } = await client
    .from("scheduled_jobs")
    .select()
    .eq("enabled", true)
    .lte("state->nextRunAtMs", now)
    .is("state->runningAtMs", null)

  if (error) return null
  return (data ?? []).map(rowToJob)
}

function rowToJob(row: any): ScheduledJob {
  return {
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    workspace: row.workspace,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    deleteAfterRun: row.delete_after_run,
    schedule: row.schedule,
    payload: row.payload,
    state: row.state ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ============================================
// Debug/Status
// ============================================

export function getStoreStatus(): { type: "supabase" | "memory"; jobCount: number } {
  return {
    type: usingMemoryFallback ? "memory" : "supabase",
    jobCount: memoryStore.size,
  }
}
