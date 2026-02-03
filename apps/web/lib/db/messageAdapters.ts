"use client"

import type { UIMessage } from "@/features/chat/lib/message-parser"
import type { DbMessage, DbMessageContent, DbMessageStatus, DbMessageType } from "./messageDb"

/**
 * Message Type Adapters
 *
 * Converts between:
 * - UIMessage: Display shape used in React components
 * - DbMessage: Persistence shape stored in Dexie
 *
 * CRITICAL: Keep these in sync when either type changes!
 */

// =============================================================================
// UIMessage -> DbMessage (for persistence)
// =============================================================================

/**
 * Convert UIMessage to structured DbMessageContent for storage.
 */
export function toDbMessageContent(message: UIMessage): DbMessageContent {
  const content = message.content

  switch (message.type) {
    case "user":
      return { kind: "text", text: typeof content === "string" ? content : JSON.stringify(content) }

    case "sdk_message":
      // SDK messages are passed through as-is
      return { kind: "sdk_message", data: content }

    case "start":
    case "complete":
    case "result":
      // System-like messages
      return { kind: "system", text: typeof content === "string" ? content : JSON.stringify(content) }

    case "compact_boundary":
    case "compacting":
    case "tool_progress":
    case "auth_status":
    case "interrupt":
    case "agent_manager":
      // Store these as SDK messages (they have structured data)
      return { kind: "sdk_message", data: content }

    default:
      // Fallback: store as text
      return { kind: "text", text: typeof content === "string" ? content : JSON.stringify(content) }
  }
}

/**
 * Map UIMessage type to DbMessageType.
 */
export function toDbMessageType(uiType: UIMessage["type"]): DbMessageType {
  switch (uiType) {
    case "user":
      return "user"
    case "sdk_message":
      return "sdk_message"
    case "start":
    case "complete":
    case "result":
    case "compact_boundary":
    case "compacting":
    case "tool_progress":
    case "auth_status":
    case "interrupt":
    case "agent_manager":
      return "system"
    default:
      return "system"
  }
}

/**
 * Convert a UIMessage to a DbMessage for storage.
 * Note: seq must be provided - caller is responsible for getting next sequence number.
 */
export function toDbMessage(
  message: UIMessage,
  tabId: string,
  seq: number,
  options: {
    status?: DbMessageStatus
    origin?: "local" | "remote" | "migration"
    pendingSync?: boolean
  } = {},
): DbMessage {
  const now = Date.now()
  const createdAt = message.timestamp instanceof Date ? message.timestamp.getTime() : now

  return {
    id: message.id,
    tabId,
    type: toDbMessageType(message.type),
    content: toDbMessageContent(message),
    createdAt,
    updatedAt: now,
    version: 1, // CURRENT_MESSAGE_VERSION
    status: options.status ?? "complete",
    origin: options.origin ?? "local",
    seq,
    pendingSync: options.pendingSync ?? true,
  }
}

// =============================================================================
// DbMessage -> UIMessage (for display)
// =============================================================================

/**
 * Convert DbMessage to UIMessage for display in React components.
 */
export function toUIMessage(dbMessage: DbMessage): UIMessage {
  const { content, id, createdAt, status } = dbMessage

  const timestamp = new Date(createdAt)
  const isStreaming = status === "streaming"

  switch (content.kind) {
    case "text":
      return {
        id,
        type: dbMessage.type === "user" ? "user" : "sdk_message",
        content: content.text,
        timestamp,
        isStreaming,
      }

    case "sdk_message":
      return {
        id,
        type: "sdk_message",
        content: content.data,
        timestamp,
        isStreaming,
      }

    case "tool_use":
      return {
        id,
        type: "sdk_message",
        content: {
          type: "tool_use",
          name: content.toolName,
          id: content.toolUseId,
          input: content.args,
        },
        timestamp,
        isStreaming,
      }

    case "tool_result":
      return {
        id,
        type: "sdk_message",
        content: {
          type: "tool_result",
          tool_use_id: content.toolUseId,
          content: content.result,
          tool_name: content.toolName,
        },
        timestamp,
        isStreaming,
      }

    case "thinking":
      return {
        id,
        type: "sdk_message",
        content: { type: "thinking", text: content.text },
        timestamp,
        isStreaming,
      }

    case "system":
      return {
        id,
        type: "sdk_message",
        content: { type: "system", text: content.text },
        timestamp,
        isStreaming,
      }

    case "file":
    case "diff":
      // Future types - store as SDK message for now
      return {
        id,
        type: "sdk_message",
        content,
        timestamp,
        isStreaming,
      }

    default: {
      // Exhaustive check
      const _exhaustive: never = content
      return {
        id,
        type: "sdk_message",
        content: _exhaustive,
        timestamp,
        isStreaming,
      }
    }
  }
}

/**
 * Convert an array of DbMessages to UIMessages.
 */
export function toUIMessages(dbMessages: DbMessage[]): UIMessage[] {
  return dbMessages.map(toUIMessage)
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract a title from the first user message content.
 * Used for auto-generating conversation titles.
 */
export function extractTitle(content: DbMessageContent): string {
  if (content.kind === "text") {
    const text = content.text.slice(0, 50).replace(/\n/g, " ").trim()
    return text || "New conversation"
  }
  return "New conversation"
}

/**
 * Check if a message content is empty or trivial.
 */
export function isEmptyContent(content: DbMessageContent): boolean {
  switch (content.kind) {
    case "text":
    case "thinking":
    case "system":
      return !content.text || content.text.trim().length === 0
    case "sdk_message":
      return content.data === null || content.data === undefined
    default:
      return false
  }
}
