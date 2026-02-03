/**
 * Automation Run Log
 *
 * Per-job JSONL log files with auto-pruning.
 * Inspired by ClawdBot's run-log.ts.
 *
 * Each job gets its own log file at:
 *   /var/log/automation-runs/{job_id}.jsonl
 *
 * Features:
 * - Append-only JSONL format
 * - Auto-pruning when file exceeds maxBytes
 * - Concurrent-safe writes
 * - Easy querying of recent runs
 */

import fs from "node:fs/promises"
import path from "node:path"

// ============================================
// Types
// ============================================

export type RunLogEntry = {
  /** Timestamp in ms */
  ts: number
  /** Job ID */
  jobId: string
  /** Action type */
  action: "started" | "finished"
  /** Status (only for finished) */
  status?: "success" | "failure" | "skipped"
  /** Error message (only for failure) */
  error?: string
  /** Summary of what was done */
  summary?: string
  /** When the run started */
  runAtMs?: number
  /** Duration in ms */
  durationMs?: number
  /** Next scheduled run */
  nextRunAtMs?: number
  /** Retry attempt number */
  retryAttempt?: number
  /** Full Claude SDK message stream (for debugging) */
  messages?: unknown[]
}

export type RunLogConfig = {
  /** Directory for log files (default: /var/log/automation-runs) */
  logDir?: string
  /** Max file size in bytes before pruning (default: 2MB) */
  maxBytes?: number
  /** Number of lines to keep after pruning (default: 1000) */
  keepLines?: number
}

// ============================================
// Configuration
// ============================================

const DEFAULT_LOG_DIR = "/var/log/automation-runs"
const DEFAULT_MAX_BYTES = 2_000_000 // 2MB
const DEFAULT_KEEP_LINES = 1000

// Concurrent write protection
const writesByPath = new Map<string, Promise<void>>()

// ============================================
// Public API
// ============================================

/**
 * Get the log file path for a job
 */
export function getLogPath(jobId: string, config?: RunLogConfig): string {
  const logDir = config?.logDir ?? DEFAULT_LOG_DIR
  return path.join(logDir, `${jobId}.jsonl`)
}

/**
 * Append an entry to a job's run log
 */
export async function appendRunLog(
  jobId: string,
  entry: Omit<RunLogEntry, "ts" | "jobId">,
  config?: RunLogConfig,
): Promise<void> {
  const logPath = getLogPath(jobId, config)
  const fullEntry: RunLogEntry = {
    ...entry,
    ts: Date.now(),
    jobId,
  }

  // Chain writes to prevent concurrent access issues
  const prev = writesByPath.get(logPath) ?? Promise.resolve()
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(path.dirname(logPath), { recursive: true })
      await fs.appendFile(logPath, `${JSON.stringify(fullEntry)}\n`, "utf-8")
      await pruneIfNeeded(logPath, config)
    })

  writesByPath.set(logPath, next)
  await next
}

/**
 * Read entries from a job's run log
 */
export async function readRunLog(
  jobId: string,
  opts?: {
    /** Max entries to return (default: 100) */
    limit?: number
    /** Filter by action type */
    action?: "started" | "finished"
    /** Filter by status */
    status?: "success" | "failure" | "skipped"
  },
  config?: RunLogConfig,
): Promise<RunLogEntry[]> {
  const logPath = getLogPath(jobId, config)
  const limit = Math.max(1, Math.min(5000, opts?.limit ?? 100))

  const raw = await fs.readFile(logPath, "utf-8").catch(() => "")
  if (!raw.trim()) {
    return []
  }

  const parsed: RunLogEntry[] = []
  const lines = raw.split("\n")

  // Read from end (most recent first)
  for (let i = lines.length - 1; i >= 0 && parsed.length < limit; i--) {
    const line = lines[i]?.trim()
    if (!line) continue

    try {
      const entry = JSON.parse(line) as RunLogEntry

      // Validate required fields
      if (typeof entry.ts !== "number" || typeof entry.jobId !== "string") {
        continue
      }

      // Apply filters
      if (opts?.action && entry.action !== opts.action) continue
      if (opts?.status && entry.status !== opts.status) continue

      parsed.push(entry)
    } catch {
      // Skip invalid lines
    }
  }

  // Return in chronological order
  return parsed.reverse()
}

/**
 * Get summary statistics for a job's runs
 */
export async function getRunStats(
  jobId: string,
  config?: RunLogConfig,
): Promise<{
  totalRuns: number
  successCount: number
  failureCount: number
  avgDurationMs: number
  lastRunAt: number | null
  lastStatus: string | null
}> {
  const entries = await readRunLog(jobId, { limit: 1000, action: "finished" }, config)

  if (entries.length === 0) {
    return {
      totalRuns: 0,
      successCount: 0,
      failureCount: 0,
      avgDurationMs: 0,
      lastRunAt: null,
      lastStatus: null,
    }
  }

  const successCount = entries.filter(e => e.status === "success").length
  const failureCount = entries.filter(e => e.status === "failure").length
  const durations = entries.map(e => e.durationMs).filter((d): d is number => typeof d === "number")
  const avgDurationMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0

  const lastEntry = entries[entries.length - 1]

  return {
    totalRuns: entries.length,
    successCount,
    failureCount,
    avgDurationMs,
    lastRunAt: lastEntry?.runAtMs ?? lastEntry?.ts ?? null,
    lastStatus: lastEntry?.status ?? null,
  }
}

/**
 * Delete a job's run log
 */
export async function deleteRunLog(jobId: string, config?: RunLogConfig): Promise<boolean> {
  const logPath = getLogPath(jobId, config)
  try {
    await fs.unlink(logPath)
    return true
  } catch {
    return false
  }
}

/**
 * List all job IDs that have log files
 */
export async function listLoggedJobs(config?: RunLogConfig): Promise<string[]> {
  const logDir = config?.logDir ?? DEFAULT_LOG_DIR

  try {
    const files = await fs.readdir(logDir)
    return files.filter(f => f.endsWith(".jsonl")).map(f => f.replace(/\.jsonl$/, ""))
  } catch {
    return []
  }
}

// ============================================
// Internal: Pruning
// ============================================

async function pruneIfNeeded(filePath: string, config?: RunLogConfig): Promise<void> {
  const maxBytes = config?.maxBytes ?? DEFAULT_MAX_BYTES
  const keepLines = config?.keepLines ?? DEFAULT_KEEP_LINES

  const stat = await fs.stat(filePath).catch(() => null)
  if (!stat || stat.size <= maxBytes) {
    return
  }

  console.log(`[RunLog] Pruning ${filePath} (${stat.size} bytes > ${maxBytes})`)

  const raw = await fs.readFile(filePath, "utf-8").catch(() => "")
  const lines = raw
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)

  // Keep only the most recent entries
  const kept = lines.slice(Math.max(0, lines.length - keepLines))

  // Write atomically using temp file
  const tmp = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`
  await fs.writeFile(tmp, `${kept.join("\n")}\n`, "utf-8")
  await fs.rename(tmp, filePath)

  console.log(`[RunLog] Pruned to ${kept.length} lines`)
}
