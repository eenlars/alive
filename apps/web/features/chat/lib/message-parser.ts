import type { Attachment } from "@/features/chat/components/ChatInput/types"
import {
  type BridgeCompleteMessage,
  type BridgeErrorMessage,
  type BridgeInterruptSource,
  type BridgeMessageEvent,
  type BridgeStartMessage,
  BridgeStreamType,
} from "@/features/chat/lib/streaming/ndjson"
import type { SDKAssistantMessage, SDKMessage, SDKUserMessage } from "@/features/chat/types/sdk-types"
import {
  isErrorResultMessage,
  isSDKAssistantMessage,
  isSDKResultMessage,
  isSDKSystemMessage,
  isSDKUserMessage,
} from "@/features/chat/types/sdk-types"
import {
  isCompleteEvent,
  isDoneEvent,
  isErrorEvent,
  isInterruptEvent,
  isMessageEvent,
  isPingEvent,
  isStartEvent,
} from "@/features/chat/types/stream"
import { getErrorHelp, getErrorMessage } from "@/lib/error-codes"
import type { StreamingStoreState } from "@/lib/stores/streamingStore"

export type StartEventData = BridgeStartMessage["data"]

export type MessageEventData = BridgeMessageEvent["data"]

export type CompleteEventData = BridgeCompleteMessage["data"]

export type ErrorEventData = BridgeErrorMessage["data"]

export type PingEventData = Record<string, never>

export type DoneEventData = Record<string, never>

export interface InterruptEventData {
  message: string
  source: BridgeInterruptSource
}

export interface StreamEvent {
  type: BridgeStreamType
  requestId: string
  timestamp: string
  data:
    | StartEventData
    | MessageEventData
    | CompleteEventData
    | ErrorEventData
    | PingEventData
    | DoneEventData
    | InterruptEventData
}

// Agent Manager message status types
export type AgentManagerStatus = "stop" | "done" | "suggestion"

// Agent Manager message content
export interface AgentManagerContent {
  status: AgentManagerStatus
  message: string
}

// Tool progress message content (from SDK)
export interface ToolProgressContent {
  type: "tool_progress"
  tool_use_id: string
  tool_name: string
  parent_tool_use_id: string | null
  elapsed_time_seconds: number
  uuid: string
  session_id: string
}

// Auth status message content (from SDK)
export interface AuthStatusContent {
  type: "auth_status"
  isAuthenticating: boolean
  output: string[]
  error?: string
  uuid: string
  session_id: string
}

// Message types for UI
export type UIMessage = {
  id: string
  type:
    | "user"
    | "start"
    | "sdk_message"
    | "result"
    | "complete"
    | "compact_boundary"
    | "compacting"
    | "tool_progress"
    | "auth_status"
    | "interrupt"
    | "agent_manager"
  content: unknown
  timestamp: Date
  isStreaming?: boolean
  /** Structured attachments for user messages (images, PDFs, supertemplates) */
  attachments?: Attachment[]
}

// Parse stream event into UI message
// Now conversation-scoped to avoid tool mapping collisions across conversations
export function parseStreamEvent(
  event: StreamEvent,
  conversationId?: string,
  streamingActions?: StreamingStoreState["actions"],
): UIMessage | null {
  const baseMessage = {
    timestamp: new Date(event.timestamp),
  }

  if (isStartEvent(event)) {
    return {
      id: `${event.requestId}-start`,
      type: "start",
      content: event.data,
      ...baseMessage,
    }
  }

  if (isMessageEvent(event)) {
    const content = event.data.content as SDKMessage

    // Check for system message with compact_boundary or status subtype
    if (content.type === "system") {
      const systemMsg = content as any // SDK system messages may have subtype for context compaction
      if (systemMsg.subtype === "compact_boundary") {
        console.log(
          `[MessageParser] Context compaction triggered at ${systemMsg.compact_metadata?.pre_tokens || "unknown"} tokens`,
        )
        return {
          id: `${event.requestId}-compact-${systemMsg.uuid}`,
          type: "compact_boundary",
          content: content,
          ...baseMessage,
        }
      }
      // Handle status messages (e.g., compacting in progress)
      if (systemMsg.subtype === "status" && systemMsg.status === "compacting") {
        return {
          id: `${event.requestId}-compacting-${systemMsg.uuid}`,
          type: "compacting",
          content: content,
          ...baseMessage,
        }
      }
      // Ignore other status messages (e.g., status: null for session updates)
      if (systemMsg.subtype === "status") {
        return null
      }
    }

    // Handle tool_progress messages (elapsed time for long-running tools)
    if (content.type === "tool_progress") {
      const progressMsg = content as ToolProgressContent
      // Update the pending tool's elapsed time
      if (conversationId && streamingActions) {
        streamingActions.updateToolProgress(conversationId, progressMsg.tool_use_id, progressMsg.elapsed_time_seconds)
      }
      return {
        id: `${event.requestId}-progress-${progressMsg.tool_use_id}-${progressMsg.elapsed_time_seconds}`,
        type: "tool_progress",
        content: progressMsg,
        ...baseMessage,
      }
    }

    // Handle auth_status messages (OAuth authentication progress)
    if (content.type === "auth_status") {
      const authMsg = content as AuthStatusContent
      return {
        id: `${event.requestId}-auth-${authMsg.uuid}`,
        type: "auth_status",
        content: authMsg,
        ...baseMessage,
      }
    }

    // Track tool uses per conversation (not globally)
    // Also track tool inputs so we can display them in tool results (e.g., comment body)
    // Mark tools as pending when they start executing
    if (conversationId && streamingActions && isSDKAssistantMessage(content)) {
      const assistantMsg = content as SDKAssistantMessage
      if (assistantMsg.message?.content && Array.isArray(assistantMsg.message.content)) {
        assistantMsg.message.content.forEach(item => {
          if (item.type === "tool_use" && item.id && item.name) {
            streamingActions.recordToolUse(conversationId, item.id, item.name, item.input)
            // Mark as pending so UI can show "running" state
            streamingActions.markToolPending(conversationId, item.id, item.name, item.input)
          }
        })
      }
    }

    // Lookup tool names and inputs from per-conversation store
    // Mark tools as complete when their result arrives
    if (conversationId && streamingActions && isSDKUserMessage(content)) {
      const userMsg = content as SDKUserMessage
      if (userMsg.message?.content && Array.isArray(userMsg.message.content)) {
        userMsg.message.content.forEach(item => {
          if (item.type === "tool_result" && item.tool_use_id) {
            // Augment SDK ToolResultBlockParam with tool_name and tool_input for UI rendering
            // SDK doesn't include these in tool_result, so we add them client-side
            ;(item as any).tool_name = streamingActions.getToolName(conversationId, item.tool_use_id) || "Tool"
            ;(item as any).tool_input = streamingActions.getToolInput(conversationId, item.tool_use_id)
            // Mark as complete - removes from pending list
            streamingActions.markToolComplete(conversationId, item.tool_use_id)
          }
        })
      }
    }

    return {
      id: `${event.requestId}-${event.data.messageCount}`,
      type: "sdk_message",
      content: content,
      ...baseMessage,
    }
  }

  if (isCompleteEvent(event)) {
    return {
      id: `${event.requestId}-complete`,
      type: "complete",
      content: event.data,
      ...baseMessage,
    }
  }

  if (isErrorEvent(event)) {
    const errorData = event.data
    const errorCode = errorData.code || errorData.error

    const details = typeof errorData.details === "object" ? errorData.details : undefined
    const userMessage = getErrorMessage(errorCode, details) || errorData.message
    const helpText = getErrorHelp(errorCode, details)

    let fullMessage = userMessage
    if (helpText) {
      fullMessage += `\n\n${helpText}`
    }
    // Show error ID for log correlation (not full details - those stay in backend logs)
    fullMessage += `\n\n_Error ID: ${event.requestId}_`

    return {
      id: `${event.requestId}-error`,
      type: "sdk_message",
      content: {
        type: "result",
        is_error: true,
        result: fullMessage,
        error_code: errorCode,
      },
      ...baseMessage,
    }
  }

  // SESSION events are server-side only - never reach client
  // They're intercepted in route.ts for session storage
  if (event.type === BridgeStreamType.SESSION) {
    console.warn("[MessageParser] SESSION event reached client - this should not happen")
    return null
  }

  if (isPingEvent(event)) {
    return null
  }

  if (isDoneEvent(event)) {
    return {
      id: `${event.requestId}-done`,
      type: "complete",
      content: { message: "Stream completed" },
      ...baseMessage,
    }
  }

  if (isInterruptEvent(event)) {
    return {
      id: `${event.requestId}-interrupt`,
      type: "interrupt",
      content: event.data,
      ...baseMessage,
    }
  }

  return null
}

// Re-export the type guard functions for use in other modules
export {
  isCompleteEvent,
  isDoneEvent,
  isErrorEvent,
  isErrorResultMessage,
  isInterruptEvent,
  isMessageEvent,
  isPingEvent,
  isSDKAssistantMessage,
  isSDKResultMessage,
  isSDKSystemMessage,
  isSDKUserMessage,
  isStartEvent,
}

/**
 * Component types for message routing
 */
export const COMPONENT_TYPE = {
  USER: "user",
  START: "start",
  COMPLETE: "complete",
  COMPACT_BOUNDARY: "compact_boundary",
  COMPACTING: "compacting",
  TOOL_PROGRESS: "tool_progress",
  AUTH_STATUS: "auth_status",
  INTERRUPT: "interrupt",
  SYSTEM: "system",
  ASSISTANT: "assistant",
  TOOL_RESULT: "tool_result",
  RESULT: "result",
  AGENT_MANAGER: "agent_manager",
  UNKNOWN: "unknown",
} as const

export type ComponentType = (typeof COMPONENT_TYPE)[keyof typeof COMPONENT_TYPE]

// Get message component type for routing
export function getMessageComponentType(message: UIMessage): ComponentType {
  if (message.type === "user") return COMPONENT_TYPE.USER
  if (message.type === "start") return COMPONENT_TYPE.START
  if (message.type === "complete") return COMPONENT_TYPE.COMPLETE
  if (message.type === "compact_boundary") return COMPONENT_TYPE.COMPACT_BOUNDARY
  if (message.type === "compacting") return COMPONENT_TYPE.COMPACTING
  if (message.type === "tool_progress") return COMPONENT_TYPE.TOOL_PROGRESS
  if (message.type === "auth_status") return COMPONENT_TYPE.AUTH_STATUS
  if (message.type === "interrupt") return COMPONENT_TYPE.INTERRUPT
  if (message.type === "agent_manager") return COMPONENT_TYPE.AGENT_MANAGER

  if (message.type === "sdk_message") {
    const sdkMsg = message.content as SDKMessage

    // Detect compacting messages reloaded from Dexie (stored as sdk_message)
    if (sdkMsg.type === "system" && (sdkMsg as any).subtype === "status" && (sdkMsg as any).status === "compacting") {
      return COMPONENT_TYPE.COMPACTING
    }

    if (isSDKSystemMessage(sdkMsg)) return COMPONENT_TYPE.SYSTEM
    if (isSDKAssistantMessage(sdkMsg)) return COMPONENT_TYPE.ASSISTANT
    if (isSDKUserMessage(sdkMsg)) return COMPONENT_TYPE.TOOL_RESULT
    if (isSDKResultMessage(sdkMsg)) return COMPONENT_TYPE.RESULT
  }

  if (message.type === "result") return COMPONENT_TYPE.RESULT

  return COMPONENT_TYPE.UNKNOWN
}
