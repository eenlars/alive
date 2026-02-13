/**
 * Centralized Error Logger
 *
 * Captures errors from both frontend and backend with structured data.
 * Stores in-memory ring buffer for recent errors + optional persistence.
 *
 * Usage:
 * - Backend: errorLogger.capture({ ... })
 * - Frontend: POST /api/logs/error { ... }
 * - Query: GET /api/logs/error?category=oauth&limit=50
 */

import * as Sentry from "@sentry/nextjs"
import { env } from "@webalive/env/server"

export interface ErrorLogEntry {
  id: string
  timestamp: string
  category: string // 'oauth', 'api', 'claude', 'frontend', etc.
  source: "frontend" | "backend"
  message: string
  details?: Record<string, unknown>
  stack?: string
  userId?: string
  requestId?: string
  url?: string
  userAgent?: string
}

// Ring buffer for recent errors (in-memory, survives for server lifetime)
const MAX_ERRORS = 500
const errorBuffer: ErrorLogEntry[] = []

/**
 * Add an error to the log
 */
export function captureError(entry: Omit<ErrorLogEntry, "id" | "timestamp">): ErrorLogEntry {
  const fullEntry: ErrorLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  }

  // Add to ring buffer
  errorBuffer.push(fullEntry)
  if (errorBuffer.length > MAX_ERRORS) {
    errorBuffer.shift()
  }

  // Also log to console for journalctl
  console.error(`[ErrorLogger:${entry.category}]`, {
    message: entry.message,
    details: entry.details,
    userId: entry.userId,
    requestId: entry.requestId,
  })

  // Send to Sentry
  Sentry.withScope(scope => {
    scope.setTag("category", entry.category)
    scope.setTag("source", entry.source)
    if (entry.requestId) scope.setTag("requestId", entry.requestId)
    if (entry.userId) scope.setUser({ id: entry.userId })
    if (entry.details) scope.setContext("details", entry.details)

    if (entry.stack) {
      // Reconstruct error with original stack
      const err = new Error(entry.message)
      err.stack = entry.stack
      Sentry.captureException(err)
    } else {
      Sentry.captureMessage(entry.message, "error")
    }
  })

  return fullEntry
}

/**
 * Query recent errors
 */
export function queryErrors(options?: {
  category?: string
  source?: "frontend" | "backend"
  userId?: string
  since?: Date
  limit?: number
}): ErrorLogEntry[] {
  let results = [...errorBuffer]

  if (options?.category) {
    results = results.filter(e => e.category === options.category)
  }

  if (options?.source) {
    results = results.filter(e => e.source === options.source)
  }

  if (options?.userId) {
    results = results.filter(e => e.userId === options.userId)
  }

  if (options?.since) {
    const sinceTime = options.since.getTime()
    results = results.filter(e => new Date(e.timestamp).getTime() >= sinceTime)
  }

  // Most recent first
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  if (options?.limit) {
    results = results.slice(0, options.limit)
  }

  return results
}

/**
 * Get error count by category (for dashboard)
 */
export function getErrorStats(): Record<string, { count: number; lastSeen: string | null }> {
  const stats: Record<string, { count: number; lastSeen: string | null }> = {}

  for (const entry of errorBuffer) {
    if (!stats[entry.category]) {
      stats[entry.category] = { count: 0, lastSeen: null }
    }
    stats[entry.category].count++
    if (!stats[entry.category].lastSeen || entry.timestamp > stats[entry.category].lastSeen!) {
      stats[entry.category].lastSeen = entry.timestamp
    }
  }

  return stats
}

/**
 * Clear all errors (for testing)
 */
export function clearErrors(): void {
  errorBuffer.length = 0
}

/**
 * Convenience logger for specific categories
 */
export const errorLogger = {
  capture: captureError,
  query: queryErrors,
  stats: getErrorStats,
  clear: clearErrors,

  // Typed convenience methods for common categories
  oauth: (message: string, details?: Record<string, unknown>, meta?: Partial<ErrorLogEntry>) =>
    captureError({ category: "oauth", source: "backend", message, details, ...meta }),

  api: (message: string, details?: Record<string, unknown>, meta?: Partial<ErrorLogEntry>) =>
    captureError({ category: "api", source: "backend", message, details, ...meta }),

  claude: (message: string, details?: Record<string, unknown>, meta?: Partial<ErrorLogEntry>) =>
    captureError({ category: "claude", source: "backend", message, details, ...meta }),

  frontend: (message: string, details?: Record<string, unknown>, meta?: Partial<ErrorLogEntry>) =>
    captureError({ category: "frontend", source: "frontend", message, details, ...meta }),
}

// ============================================================================
// Stream Error Logging (with build info for debugging)
// ============================================================================

interface BuildInfo {
  branch: string
  buildTime: string
  env: string
}

let buildInfo: BuildInfo | null = null

function getBuildInfo(): BuildInfo {
  if (buildInfo) return buildInfo

  let branch = "unknown"
  let buildTime = "unknown"

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const info = require("@/lib/build-info.json") as { branch?: string; buildTime?: string }
    branch = info.branch ?? "unknown"
    buildTime = info.buildTime ?? "unknown"
  } catch {
    // File may not exist in dev mode
  }

  buildInfo = {
    branch,
    buildTime,
    env: env.STREAM_ENV ?? env.NODE_ENV ?? "unknown",
  }

  return buildInfo
}

export interface StreamErrorContext {
  requestId: string
  workspace: string
  model: string
  error: unknown
}

interface ErrorWithWorkerDebug extends Error {
  stderr?: string
  diagnostics?: unknown
}

interface PidsDiagnosticsPayload {
  current: number
  max: number
  headroom?: number
  usagePercent?: number
  cgroupPath?: string
}

function extractPidsDiagnostics(diagnostics: unknown): PidsDiagnosticsPayload | null {
  if (!diagnostics || typeof diagnostics !== "object") return null
  const asRecord = diagnostics as Record<string, unknown>

  const fromRoot =
    typeof asRecord.current === "number" && typeof asRecord.max === "number"
      ? asRecord
      : asRecord.pids && typeof asRecord.pids === "object"
        ? (asRecord.pids as Record<string, unknown>)
        : null

  if (!fromRoot || typeof fromRoot.current !== "number" || typeof fromRoot.max !== "number") {
    return null
  }

  return {
    current: fromRoot.current,
    max: fromRoot.max,
    headroom: typeof fromRoot.headroom === "number" ? fromRoot.headroom : undefined,
    usagePercent: typeof fromRoot.usagePercent === "number" ? fromRoot.usagePercent : undefined,
    cgroupPath: typeof fromRoot.cgroupPath === "string" ? fromRoot.cgroupPath : undefined,
  }
}

function safeJsonForLog(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '"[unserializable]"'
  }
}

/**
 * Log a stream error with full context for debugging
 *
 * Logs both to journalctl (structured for grep) and to the error buffer (queryable via API).
 *
 * To find errors:
 *   journalctl -u alive-staging | grep "STREAM_ERROR:ERROR_ID"
 *   Or query: GET /api/logs/error?category=stream
 */
export function logStreamError(context: StreamErrorContext): void {
  const { requestId, workspace, model, error } = context
  const info = getBuildInfo()

  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined
  // Check for backend worker diagnostics attached by worker-pool
  const stderr = error instanceof Error && "stderr" in error ? (error as ErrorWithWorkerDebug).stderr : undefined
  const diagnostics =
    error instanceof Error && "diagnostics" in error ? (error as ErrorWithWorkerDebug).diagnostics : undefined

  // Structured log line for easy grep in journalctl
  console.error(
    `[STREAM_ERROR:${requestId}] ${errorMessage} | ` +
      `build=${info.branch}@${info.buildTime} env=${info.env} workspace=${workspace} model=${model}`,
  )

  // Claude subprocess stderr - THE ACTUAL ERROR (if available)
  if (stderr) {
    console.error(`[STREAM_ERROR:${requestId}] Claude stderr:\n${stderr}`)
  }

  if (diagnostics) {
    console.error(`[STREAM_ERROR:${requestId}] Worker diagnostics: ${safeJsonForLog(diagnostics)}`)
    const pids = extractPidsDiagnostics(diagnostics)
    if (pids) {
      console.error(
        `[STREAM_ERROR:${requestId}] PID pressure detected: current=${pids.current} max=${pids.max}${typeof pids.headroom === "number" ? ` headroom=${pids.headroom}` : ""}${typeof pids.usagePercent === "number" ? ` usage=${pids.usagePercent.toFixed(1)}%` : ""}${pids.cgroupPath ? ` cgroup=${pids.cgroupPath}` : ""}`,
      )
    }
  }

  // Stack trace on separate line if available
  if (errorStack) {
    console.error(`[STREAM_ERROR:${requestId}] Stack:`, errorStack)
  }

  // Send to Sentry with rich stream context
  Sentry.withScope(scope => {
    scope.setTag("category", "stream")
    scope.setTag("requestId", requestId)
    scope.setTag("workspace", workspace)
    scope.setTag("model", model)
    scope.setTag("build", `${info.branch}@${info.buildTime}`)
    scope.setContext("stream", {
      workspace,
      model,
      build: `${info.branch}@${info.buildTime}`,
      env: info.env,
      stderr,
      diagnostics,
    })

    const err = error instanceof Error ? error : new Error(errorMessage)
    Sentry.captureException(err)
  })

  // Also capture in queryable error buffer
  captureError({
    category: "stream",
    source: "backend",
    message: errorMessage,
    requestId,
    details: {
      workspace,
      model,
      build: `${info.branch}@${info.buildTime}`,
      env: info.env,
      stderr, // Include stderr in queryable buffer too
      diagnostics,
    },
    stack: errorStack,
  })
}

/**
 * Get build info for health checks or debugging endpoints
 */
export function getServerBuildInfo(): BuildInfo {
  return getBuildInfo()
}
