/**
 * Job Queue Type Definitions
 *
 * Payload types for all job queues.
 */

/**
 * Payload for the run-automation queue.
 * Mirrors the fields needed by executor.ts's runAutomationJob().
 */
export interface RunAutomationPayload {
  /** Supabase automation_jobs.id */
  jobId: string
  /** User who owns the automation */
  userId: string
  /** Organization ID */
  orgId: string
  /** Site hostname (e.g., "example.alive.best") */
  workspace: string
  /** The prompt to send to Claude */
  prompt: string
  /** Timeout in seconds (default: 300) */
  timeoutSeconds?: number
  /** Model override (e.g., "claude-sonnet-4-20250514") */
  model?: string
  /** Thinking prompt for agent guidance */
  thinkingPrompt?: string
  /** Skill IDs to load */
  skills?: string[]
  /** Cron expression (for re-scheduling after completion) */
  cronSchedule?: string
  /** Cron timezone */
  cronTimezone?: string
}

/**
 * Payload for the resume-conversation queue.
 * Represents a delayed message injection into an existing conversation.
 */
export interface ResumeConversationPayload {
  /** Tab session key: "userId::workspace::tabGroupId::tabId" */
  sessionKey: string
  /** User ID */
  userId: string
  /** Workspace hostname */
  workspace: string
  /** Tab ID for session lookup */
  tabId: string
  /** Tab group ID for session lookup */
  tabGroupId: string
  /** Message to inject when conversation resumes */
  message: string
  /** Why this resumption was scheduled (shown to user) */
  reason: string
  /** When the resumption was originally scheduled */
  scheduledAt: string
}

/**
 * Event callback for monitoring job queue activity.
 */
export interface JobQueueEvent {
  queue: string
  jobId: string
  action: "started" | "completed" | "failed" | "retry"
  error?: string
  durationMs?: number
}

export type JobQueueEventHandler = (event: JobQueueEvent) => void
