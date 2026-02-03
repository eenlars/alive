/**
 * Scheduled Tasks (Cron) Types
 *
 * Enables Claude to create scheduled tasks that run automatically.
 * Tasks can trigger agent conversations at specified times.
 */

// ============================================
// Schedule Types
// ============================================

/** One-shot task: runs once at a specific time */
export interface ScheduleAt {
  kind: "at"
  /** Unix timestamp in milliseconds */
  atMs: number
}

/** Recurring task: runs every N milliseconds */
export interface ScheduleEvery {
  kind: "every"
  /** Interval in milliseconds */
  everyMs: number
  /** Optional anchor time for alignment (e.g., run every hour on the hour) */
  anchorMs?: number
}

/** Cron expression task: runs based on cron syntax */
export interface ScheduleCron {
  kind: "cron"
  /** Cron expression (e.g., "0 9 * * *" for 9am daily) */
  expr: string
  /** Timezone (e.g., "Europe/Amsterdam", defaults to UTC) */
  tz?: string
}

export type Schedule = ScheduleAt | ScheduleEvery | ScheduleCron

// ============================================
// Payload Types
// ============================================

/** System event: injects a message into the session context */
export interface PayloadSystemEvent {
  kind: "systemEvent"
  /** Text to inject as system context */
  text: string
}

/** Agent turn: triggers a full agent response */
export interface PayloadAgentTurn {
  kind: "agentTurn"
  /** Message to send to the agent */
  message: string
  /** Optional model override */
  model?: string
  /** Timeout for the agent run in seconds */
  timeoutSeconds?: number
  /** Whether to deliver the response via a channel (e.g., email) */
  deliver?: boolean
  /** Delivery channel (for future: email, webhook, etc.) */
  channel?: string
  /** Recipient for delivery */
  to?: string
}

export type Payload = PayloadSystemEvent | PayloadAgentTurn

// ============================================
// Job State
// ============================================

export type JobStatus = "pending" | "running" | "completed" | "failed" | "disabled"

export interface JobState {
  /** Next scheduled run time (Unix ms) */
  nextRunAtMs?: number
  /** Currently running since (Unix ms) */
  runningAtMs?: number
  /** Last completed run time (Unix ms) */
  lastRunAtMs?: number
  /** Last run status */
  lastStatus?: "ok" | "error" | "skipped"
  /** Last error message if failed */
  lastError?: string
  /** Duration of last run in milliseconds */
  lastDurationMs?: number
  /** Total number of runs */
  runCount?: number
}

// ============================================
// Scheduled Job
// ============================================

export interface ScheduledJob {
  /** Unique job ID (UUID) */
  id: string
  /** User who created the job */
  userId: string
  /** Organization ID */
  orgId: string
  /** Workspace (domain) where this job runs */
  workspace: string
  /** Human-readable name */
  name: string
  /** Optional description */
  description?: string
  /** Whether the job is enabled */
  enabled: boolean
  /** Delete job after it runs (for one-shot tasks) */
  deleteAfterRun?: boolean
  /** Schedule configuration */
  schedule: Schedule
  /** What to do when triggered */
  payload: Payload
  /** Runtime state */
  state: JobState
  /** Created timestamp (ISO) */
  createdAt: string
  /** Last updated timestamp (ISO) */
  updatedAt: string
}

// ============================================
// API Types
// ============================================

export interface ScheduledJobCreate {
  workspace: string
  name: string
  description?: string
  schedule: Schedule
  payload: Payload
  enabled?: boolean
  deleteAfterRun?: boolean
}

export interface ScheduledJobUpdate {
  name?: string
  description?: string
  schedule?: Schedule
  payload?: Payload
  enabled?: boolean
  deleteAfterRun?: boolean
}

export interface ScheduledJobListParams {
  workspace?: string
  enabled?: boolean
  limit?: number
  offset?: number
}

export interface ScheduledJobListResult {
  jobs: ScheduledJob[]
  total: number
  hasMore: boolean
}

// ============================================
// Execution Context
// ============================================

export interface JobExecutionContext {
  job: ScheduledJob
  triggeredAt: number
  /** Session key to use for the agent run */
  sessionKey?: string
}

export interface JobExecutionResult {
  success: boolean
  durationMs: number
  error?: string
  /** Response from the agent (if agentTurn) */
  response?: string
}

// ============================================
// Tool Context (for Claude tools)
// ============================================

export interface ScheduledToolContext {
  userId: string
  orgId: string
  workspace: string
}

// ============================================
// Validation
// ============================================

const CRON_REGEX = /^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([12]?\d|3[01])) (\*|(0?[1-9]|1[0-2])) (\*|([0-6]))$/

export function isValidCronExpression(expr: string): boolean {
  // Basic cron validation (5-part: minute hour day month weekday)
  return CRON_REGEX.test(expr.trim())
}

export function isValidSchedule(schedule: Schedule): { valid: boolean; error?: string } {
  switch (schedule.kind) {
    case "at":
      if (!Number.isFinite(schedule.atMs) || schedule.atMs < 0) {
        return { valid: false, error: "atMs must be a positive number" }
      }
      if (schedule.atMs < Date.now()) {
        return { valid: false, error: "atMs must be in the future" }
      }
      return { valid: true }

    case "every":
      if (!Number.isFinite(schedule.everyMs) || schedule.everyMs < 60000) {
        return { valid: false, error: "everyMs must be at least 60000 (1 minute)" }
      }
      return { valid: true }

    case "cron":
      if (!isValidCronExpression(schedule.expr)) {
        return { valid: false, error: `Invalid cron expression: ${schedule.expr}` }
      }
      return { valid: true }

    default:
      return { valid: false, error: "Unknown schedule kind" }
  }
}

export function isValidPayload(payload: Payload): { valid: boolean; error?: string } {
  switch (payload.kind) {
    case "systemEvent":
      if (!payload.text || payload.text.trim().length === 0) {
        return { valid: false, error: "systemEvent requires non-empty text" }
      }
      return { valid: true }

    case "agentTurn":
      if (!payload.message || payload.message.trim().length === 0) {
        return { valid: false, error: "agentTurn requires non-empty message" }
      }
      return { valid: true }

    default:
      return { valid: false, error: "Unknown payload kind" }
  }
}

// ============================================
// Helpers
// ============================================

/** Calculate next run time for a schedule */
export function calculateNextRunTime(schedule: Schedule, now: number = Date.now()): number | null {
  switch (schedule.kind) {
    case "at":
      return schedule.atMs > now ? schedule.atMs : null

    case "every": {
      const anchor = schedule.anchorMs ?? now
      const elapsed = now - anchor
      const intervals = Math.floor(elapsed / schedule.everyMs)
      return anchor + (intervals + 1) * schedule.everyMs
    }

    case "cron":
      // For cron expressions, we'd need a library like cron-parser
      // For now, return null and handle in the service
      return null

    default:
      return null
  }
}

/** Format schedule for display */
export function formatSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case "at": {
      const date = new Date(schedule.atMs)
      return `Once at ${date.toISOString()}`
    }
    case "every": {
      const minutes = Math.round(schedule.everyMs / 60000)
      if (minutes < 60) return `Every ${minutes} minute${minutes === 1 ? "" : "s"}`
      const hours = Math.round(minutes / 60)
      if (hours < 24) return `Every ${hours} hour${hours === 1 ? "" : "s"}`
      const days = Math.round(hours / 24)
      return `Every ${days} day${days === 1 ? "" : "s"}`
    }
    case "cron":
      return `Cron: ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`
    default:
      return "Unknown schedule"
  }
}
