/**
 * Bridge Stream Event Types
 *
 * IMPORTANT: This file is the single source of truth for stream event types.
 * Both server (ndjson-stream-handler.ts) and client (useStreamHandler.ts) should import from here.
 * DO NOT duplicate these types elsewhere.
 *
 * The server emits NDJSON events via `/api/claude/stream`:
 * - stream_start     → Stream initialized
 * - stream_message   → Complete SDK message (user, assistant, tool_use, etc.)
 * - stream_complete  → Successful end with result
 * - stream_interrupt → User cancelled (via cancel endpoint)
 * - stream_error     → Stream failed
 */

// =============================================================================
// Event Types
// =============================================================================

export type BridgeStreamType =
  | "stream_start"
  | "stream_message"
  | "stream_complete"
  | "stream_interrupt"
  | "stream_error"

// =============================================================================
// Base Event
// =============================================================================

export interface BridgeBaseEvent {
  type: BridgeStreamType
  requestId: string
}

// =============================================================================
// Specific Events
// =============================================================================

/**
 * Stream initialization event.
 * Sent when a new streaming request begins.
 */
export interface BridgeStartEvent extends BridgeBaseEvent {
  type: "stream_start"
}

/**
 * Message event.
 * Sent for each SDK message (can be partial during streaming).
 */
export interface BridgeMessageEvent extends BridgeBaseEvent {
  type: "stream_message"
  /** Type of message being sent */
  messageType: "user" | "assistant" | "tool_use" | "tool_result" | "thinking" | "system"
  /** True if this is the final state of this message (no more updates) */
  complete: boolean
  /** Message content (shape depends on messageType) */
  content: unknown
}

/**
 * Stream completion event.
 * Sent when the stream finishes successfully.
 */
export interface BridgeCompleteEvent extends BridgeBaseEvent {
  type: "stream_complete"
  /** Final result from the Claude SDK */
  result: unknown
}

/**
 * Stream interruption event.
 * Sent when user cancels or system interrupts the stream.
 */
export interface BridgeInterruptEvent extends BridgeBaseEvent {
  type: "stream_interrupt"
  /** Source of the interruption */
  source: "user" | "system"
  /** ID of the last assistant message (if any) */
  lastMessageId?: string
}

/**
 * Stream error event.
 * Sent when the stream fails.
 */
export interface BridgeErrorEvent extends BridgeBaseEvent {
  type: "stream_error"
  /** Error code for programmatic handling */
  code: string
  /** Human-readable error message */
  message: string
}

// =============================================================================
// Union Type
// =============================================================================

export type BridgeEvent =
  | BridgeStartEvent
  | BridgeMessageEvent
  | BridgeCompleteEvent
  | BridgeInterruptEvent
  | BridgeErrorEvent

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for BridgeEvent.
 * Use to validate incoming events from the stream.
 */
export function isBridgeEvent(e: unknown): e is BridgeEvent {
  if (typeof e !== "object" || e === null) return false
  if (!("type" in e) || typeof (e as { type: unknown }).type !== "string") return false

  const validTypes: BridgeStreamType[] = [
    "stream_start",
    "stream_message",
    "stream_complete",
    "stream_interrupt",
    "stream_error",
  ]

  return validTypes.includes((e as { type: string }).type as BridgeStreamType)
}

/**
 * Type guard for BridgeMessageEvent.
 */
export function isBridgeMessageEvent(e: BridgeEvent): e is BridgeMessageEvent {
  return e.type === "stream_message"
}

/**
 * Type guard for BridgeStartEvent.
 */
export function isBridgeStartEvent(e: BridgeEvent): e is BridgeStartEvent {
  return e.type === "stream_start"
}

/**
 * Type guard for BridgeCompleteEvent.
 */
export function isBridgeCompleteEvent(e: BridgeEvent): e is BridgeCompleteEvent {
  return e.type === "stream_complete"
}

/**
 * Type guard for BridgeInterruptEvent.
 */
export function isBridgeInterruptEvent(e: BridgeEvent): e is BridgeInterruptEvent {
  return e.type === "stream_interrupt"
}

/**
 * Type guard for BridgeErrorEvent.
 */
export function isBridgeErrorEvent(e: BridgeEvent): e is BridgeErrorEvent {
  return e.type === "stream_error"
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Extract content type from BridgeMessageEvent based on messageType.
 * Useful for type-safe content handling.
 */
export interface BridgeMessageContent {
  assistant: { message?: { content?: Array<{ text?: string }> } }
  user: { text: string }
  tool_use: { name: string; id: string; input: unknown }
  tool_result: { tool_use_id: string; content: unknown }
  thinking: { text: string }
  system: { text: string }
}
