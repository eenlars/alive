/**
 * Shared types for the automation engine.
 *
 * Used by both apps/worker (scheduler + executor) and apps/web (trigger routes).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AppDatabase, Json } from "@webalive/database"

// =============================================================================
// Database Types
// =============================================================================

export type AppClient = SupabaseClient<AppDatabase, "app">
export type AutomationJob = AppDatabase["app"]["Tables"]["automation_jobs"]["Row"]

// =============================================================================
// Engine Types
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
  /** Full prompt override (e.g. email content with conversation history) */
  promptOverride?: string
  /** Metadata about what triggered the run (e.g. email from/subject/messageId) */
  triggerContext?: { [key: string]: Json | undefined }
  /** Custom system prompt — replaces default automation system prompt */
  systemPromptOverride?: string
  /** Additional MCP tool names to register (e.g. ["mcp__alive-email__send_reply"]) */
  extraTools?: string[]
  /** Extract response from this tool's input.text instead of text messages */
  responseToolName?: string
}

export interface ClaimOptions {
  supabase: AppClient
  triggeredBy: "scheduler" | "manual" | "internal"
  serverId?: string
  /** Default lease duration in seconds (default: job timeout + 120s buffer) */
  leaseDurationSeconds?: number
}

export interface FinishHooks {
  /** Called when a job gets permanently disabled (max retries exceeded for non-cron, or cron with no next run) */
  onJobDisabled?: (ctx: RunContext, error?: string) => Promise<void> | void
  /** Called after every finish (for SSE broadcasts, logging, etc.) */
  onJobFinished?: (ctx: RunContext, status: "success" | "failure" | "skipped", summary?: string) => Promise<void> | void
}

export interface FinishOptions {
  status: "success" | "failure" | "skipped"
  durationMs: number
  error?: string
  summary?: string
  messages?: unknown[]
  costUsd?: number
  numTurns?: number
  usage?: { input_tokens: number; output_tokens: number }
  /** Config for retry behavior */
  maxRetries?: number
  retryBaseDelayMs?: number
  /** Lifecycle hooks called during finish */
  hooks?: FinishHooks
}

// =============================================================================
// CronService Types
// =============================================================================

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
