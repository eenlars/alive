/**
 * Type guards for Bridge streaming messages
 */

import type { BridgeMessageEvent } from "@/features/chat/lib/streaming/ndjson"
import { BridgeStreamType } from "@/features/chat/lib/streaming/ndjson"
import type { LLMTokenUsage } from "@/lib/tokens"

/**
 * Type guard for BridgeMessageEvent
 */
export function isBridgeMessageEvent(event: unknown): event is BridgeMessageEvent {
  if (typeof event !== "object" || event === null) return false
  const e = event as Record<string, unknown>
  if (e.type !== BridgeStreamType.MESSAGE) return false
  if (typeof e.data !== "object" || e.data === null) return false
  const data = e.data as Record<string, unknown>
  return typeof data.messageCount === "number" && typeof data.messageType === "string" && "content" in data
}

/**
 * Structure of assistant message content with usage
 */
export interface AssistantMessageContent {
  message: {
    usage: LLMTokenUsage
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Type guard for assistant message with usage data
 */
export function isAssistantMessageWithUsage(
  event: BridgeMessageEvent,
): event is BridgeMessageEvent & { data: { content: AssistantMessageContent } } {
  if (event.data.messageType !== "assistant") return false

  const content = event.data.content
  if (typeof content !== "object" || content === null) return false
  const c = content as Record<string, unknown>
  if (typeof c.message !== "object" || c.message === null) return false
  const msg = c.message as Record<string, unknown>
  if (typeof msg.usage !== "object" || msg.usage === null) return false
  const usage = msg.usage as Record<string, unknown>
  return typeof usage.input_tokens === "number" && typeof usage.output_tokens === "number"
}
