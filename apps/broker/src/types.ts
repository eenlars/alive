/**
 * Broker Types
 *
 * Shared types for the message broker service.
 */

import { z } from "zod"

// =============================================================================
// Stream State Machine
// =============================================================================

export const STREAM_STATES = {
  IDLE: "idle",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  TIMED_OUT: "timed_out",
} as const

export type StreamState = (typeof STREAM_STATES)[keyof typeof STREAM_STATES]

export interface StreamContext {
  requestId: string
  userId: string
  orgId: string
  workspace: string
  tabId: string
  startedAt?: number
  finishedAt?: number
  error?: string
  messagesEmitted: number
}

// =============================================================================
// API Request/Response
// =============================================================================

// Agent configuration passed from Next.js
// We use z.record to accept whatever Next.js sends - the worker-pool validates the shape
export const AgentConfigSchema = z.record(z.unknown())

export type AgentConfigInput = z.infer<typeof AgentConfigSchema>

export const StartStreamRequestSchema = z.object({
  requestId: z.string().min(1),
  userId: z.string().min(1),
  orgId: z.string().min(1),
  workspace: z.string().min(1),
  tabId: z.string().min(1),
  conversationId: z.string().min(1),
  sessionId: z.string().optional(),
  message: z.string().min(1), // User message (string, not array)
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  apiKey: z.string().optional(), // User's API key
  agentConfig: AgentConfigSchema, // Required agent configuration
  sessionCookie: z.string().optional(), // For MCP tool auth
  oauthTokens: z.record(z.string()).optional(),
  userEnvKeys: z.record(z.string()).optional(),
})

export type StartStreamRequest = z.infer<typeof StartStreamRequestSchema>

// =============================================================================
// Stream Events (NDJSON protocol)
// =============================================================================

export const STREAM_EVENT_TYPES = {
  START: "stream_start",
  MESSAGE: "stream_message",
  SESSION: "stream_session",
  COMPLETE: "stream_complete",
  INTERRUPT: "stream_interrupt",
  ERROR: "stream_error",
} as const

export type StreamEventType = (typeof STREAM_EVENT_TYPES)[keyof typeof STREAM_EVENT_TYPES]

export interface StreamEventBase {
  type: StreamEventType
  requestId: string
  tabId: string
  timestamp: number
}

export interface StreamStartEvent extends StreamEventBase {
  type: typeof STREAM_EVENT_TYPES.START
}

export interface StreamMessageEvent extends StreamEventBase {
  type: typeof STREAM_EVENT_TYPES.MESSAGE
  data: unknown
}

export interface StreamSessionEvent extends StreamEventBase {
  type: typeof STREAM_EVENT_TYPES.SESSION
  sessionId: string
}

export interface StreamCompleteEvent extends StreamEventBase {
  type: typeof STREAM_EVENT_TYPES.COMPLETE
  result?: unknown
}

export interface StreamInterruptEvent extends StreamEventBase {
  type: typeof STREAM_EVENT_TYPES.INTERRUPT
  reason: "cancelled" | "timeout"
}

export interface StreamErrorEvent extends StreamEventBase {
  type: typeof STREAM_EVENT_TYPES.ERROR
  error: string
  code?: string
}

export type StreamEvent =
  | StreamStartEvent
  | StreamMessageEvent
  | StreamSessionEvent
  | StreamCompleteEvent
  | StreamInterruptEvent
  | StreamErrorEvent

// Type guards
export function isStreamEvent(value: unknown): value is StreamEvent {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.type === "string" &&
    Object.values(STREAM_EVENT_TYPES).includes(obj.type as StreamEventType) &&
    typeof obj.requestId === "string" &&
    typeof obj.tabId === "string"
  )
}

// =============================================================================
// Concurrency Limits
// =============================================================================

export interface ConcurrencyConfig {
  maxGlobal: number
  maxPerOrg: number
  maxPerUser: number
  queueMaxPerOrg: number
}

export const DEFAULT_CONCURRENCY: ConcurrencyConfig = {
  maxGlobal: 50,
  maxPerOrg: 10,
  maxPerUser: 3,
  queueMaxPerOrg: 20,
}

// =============================================================================
// Broker Config
// =============================================================================

export interface BrokerConfig {
  port: number
  host: string
  sharedSecret: string
  concurrency: ConcurrencyConfig
  streamTimeoutMs: number
  shutdownTimeoutMs: number
}

export const DEFAULT_BROKER_CONFIG: Omit<BrokerConfig, "sharedSecret"> = {
  port: 3001,
  host: "127.0.0.1", // Internal only
  concurrency: DEFAULT_CONCURRENCY,
  streamTimeoutMs: 300_000, // 5 minutes
  shutdownTimeoutMs: 30_000, // 30 seconds
}
