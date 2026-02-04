/**
 * Stream event types for browser-to-broker communication.
 *
 * These types are the contract between:
 * - Broker (emits events)
 * - Client (consumes events)
 * - Next.js (fallback proxy mode)
 *
 * IMPORTANT: Changes here affect all three. Version bump required for breaking changes.
 */

// Protocol version for compatibility checks
export const STREAM_PROTOCOL_VERSION = "1.0.0"

// Valid stream event types
export const STREAM_EVENT_TYPES = [
  "stream_start",
  "stream_message",
  "stream_chunk",
  "stream_state",
  "stream_complete",
  "stream_interrupt",
  "stream_error",
] as const

export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number]

// Base event with sequence number for ordering/replay
export interface BaseStreamEvent {
  /** Monotonically increasing sequence number */
  seq: number
  /** Unix timestamp in milliseconds */
  timestamp: number
}

/** Stream started successfully */
export interface StreamStartEvent extends BaseStreamEvent {
  type: "stream_start"
  /** Broker-assigned stream ID */
  streamId: string
  /** Client-generated request ID (idempotency key) */
  requestId: string
}

/** Message types from Claude SDK */
export type StreamMessageType = "user" | "assistant" | "tool_use" | "tool_result" | "thinking" | "system"

/** Complete SDK message */
export interface StreamMessageEvent extends BaseStreamEvent {
  type: "stream_message"
  /** Type of message */
  messageType: StreamMessageType
  /** Unique message ID */
  messageId: string
  /** Message content (structure depends on messageType) */
  content: unknown
  /** True if this is the final state of this message */
  complete: boolean
}

/** Text delta for streaming assistant response */
export interface StreamChunkEvent extends BaseStreamEvent {
  type: "stream_chunk"
  /** ID of the message being streamed */
  messageId: string
  /** Text to append to the current content */
  delta: string
}

/** Stream state types */
export type StreamState = "running" | "paused"

/** Periodic state sync (every 5s during active stream) */
export interface StreamStateEvent extends BaseStreamEvent {
  type: "stream_state"
  /** Current stream state */
  state: StreamState
  /** ID of the last emitted message */
  lastMessageId: string
}

/** Stream completed successfully */
export interface StreamCompleteEvent extends BaseStreamEvent {
  type: "stream_complete"
  /** Final result from Claude SDK */
  result: unknown
  /** Token usage */
  totalTokens: {
    input: number
    output: number
  }
}

/** Interrupt source types */
export type InterruptSource = "user" | "system" | "timeout"

/** Stream interrupted (user cancel, timeout, or system) */
export interface StreamInterruptEvent extends BaseStreamEvent {
  type: "stream_interrupt"
  /** What caused the interruption */
  source: InterruptSource
  /** ID of the last message before interruption */
  lastMessageId?: string
}

/** Stream error */
export interface StreamErrorEvent extends BaseStreamEvent {
  type: "stream_error"
  /** Error code (see ERROR_CODES) */
  code: string
  /** Human-readable error message */
  message: string
  /** Whether the client should retry */
  retryable: boolean
}

/** Union of all stream event types */
export type StreamEvent =
  | StreamStartEvent
  | StreamMessageEvent
  | StreamChunkEvent
  | StreamStateEvent
  | StreamCompleteEvent
  | StreamInterruptEvent
  | StreamErrorEvent

/**
 * Type guard for stream events
 */
export function isStreamEvent(e: unknown): e is StreamEvent {
  if (typeof e !== "object" || e === null || !("type" in e)) {
    return false
  }
  return STREAM_EVENT_TYPES.includes((e as { type: string }).type as StreamEventType)
}

/**
 * Standard error codes
 */
export const ERROR_CODES = {
  // Auth errors (401)
  INVALID_TOKEN: "invalid_token",
  TOKEN_EXPIRED: "token_expired",

  // Quota errors (429)
  QUOTA_EXCEEDED: "quota_exceeded",
  RATE_LIMITED: "rate_limited",

  // Not found errors (404/410)
  STREAM_NOT_FOUND: "stream_not_found",
  STREAM_EXPIRED: "stream_expired",

  // Client errors (400)
  INVALID_REQUEST: "invalid_request",

  // Access errors (403)
  MODEL_NOT_ALLOWED: "model_not_allowed",
  WORKSPACE_DENIED: "workspace_denied",

  // Server errors (500+)
  INTERNAL_ERROR: "internal_error",
  UPSTREAM_ERROR: "upstream_error",
  TIMEOUT: "timeout",
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
