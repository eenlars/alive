import { isStreamClientVisibleTool } from "@webalive/shared"
import { MessageErrorBoundary } from "@/features/chat/components/MessageErrorBoundary"
import { AgentManagerMessage } from "@/features/chat/components/message-renderers/AgentManagerMessage"
import { AssistantMessage } from "@/features/chat/components/message-renderers/AssistantMessage"
import { AuthStatusMessage } from "@/features/chat/components/message-renderers/AuthStatusMessage"
import {
  CompactBoundaryMessage,
  CompactingMessage,
} from "@/features/chat/components/message-renderers/CompactIndicator"
import { CompleteMessage } from "@/features/chat/components/message-renderers/CompleteMessage"
import { ErrorResultMessage } from "@/features/chat/components/message-renderers/ErrorResultMessage"
import { InterruptMessage } from "@/features/chat/components/message-renderers/InterruptMessage"
import { ResultMessage } from "@/features/chat/components/message-renderers/ResultMessage"
import { StartMessage } from "@/features/chat/components/message-renderers/StartMessage"
import { SystemMessage } from "@/features/chat/components/message-renderers/SystemMessage"
import { ToolProgressMessage } from "@/features/chat/components/message-renderers/ToolProgressMessage"
import { ToolResultMessage } from "@/features/chat/components/message-renderers/ToolResultMessage"
import { UserMessage } from "@/features/chat/components/message-renderers/UserMessage"
import type {
  BridgeCompleteMessage,
  BridgeInterruptMessage,
  BridgeStartMessage,
} from "@/features/chat/lib/streaming/ndjson"
import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from "@/features/chat/types/sdk-types"
import {
  type AgentManagerContent,
  type AuthStatusContent,
  COMPONENT_TYPE,
  getAssistantErrorResultMessage,
  getMessageComponentType,
  isErrorResultMessage,
  isSDKAssistantMessage,
  type ToolProgressContent,
  type UIMessage,
} from "./message-parser"

/**
 * Check if a message should be rendered (has visible content)
 * Used to filter out empty wrapper divs from messages that render to null
 */
export function shouldRenderMessage(message: UIMessage, isDebugMode: boolean): boolean {
  const componentType = getMessageComponentType(message)

  // These always render to null - filter them out entirely
  if (componentType === COMPONENT_TYPE.COMPLETE) return false
  if (componentType === COMPONENT_TYPE.TOOL_PROGRESS) return false
  if (componentType === COMPONENT_TYPE.START) return false

  // System messages only show in debug mode
  if (componentType === COMPONENT_TYPE.SYSTEM) return isDebugMode

  // Result messages (SDK internal) only show in debug mode unless error
  if (componentType === COMPONENT_TYPE.RESULT) {
    if (message.type === "sdk_message" && isErrorResultMessage(message.content)) {
      return true
    }
    return isDebugMode
  }

  // Assistant messages: check if they have any visible content
  // (non-empty text blocks or tool_use in debug mode)
  if (componentType === COMPONENT_TYPE.ASSISTANT) {
    const content = message.content as SDKAssistantMessage
    if (getAssistantErrorResultMessage(content)) {
      return true
    }
    if (!content.message?.content) return false

    return content.message.content.some(item => {
      if (item.type === "text") return item.text.trim().length > 0
      if (item.type === "tool_use") return isDebugMode
      return false
    })
  }

  // Tool result messages: only render if at least one result is client-visible
  // Prevents empty MessageWrapper blocks for hidden tools (EnterPlanMode, Skill, etc.)
  if (componentType === COMPONENT_TYPE.TOOL_RESULT) {
    const content = message.content as SDKUserMessage
    const items = content.message?.content
    if (!Array.isArray(items) || items.length === 0) return false
    return items.some((item: { type: string; tool_name?: string }) => {
      if (item.type === "tool_result") {
        if (!item.tool_name) return true
        return isStreamClientVisibleTool(item.tool_name)
      }
      if (item.type === "image") return true
      return false
    })
  }

  // Everything else renders
  return true
}

interface RenderMessageOptions {
  tabId?: string
  /** Callback to send a message to the chat (for interactive tools like clarification questions) */
  onSubmitAnswer?: (message: string) => void
}

export function renderMessage(message: UIMessage, options?: RenderMessageOptions): React.ReactNode {
  return <MessageErrorBoundary messageId={message.id}>{renderMessageContent(message, options)}</MessageErrorBoundary>
}

function renderMessageContent(message: UIMessage, options?: RenderMessageOptions): React.ReactNode {
  // Check for error result messages first (before component type routing)
  if (message.type === "sdk_message") {
    if (isErrorResultMessage(message.content)) {
      return <ErrorResultMessage content={message.content} />
    }

    // Backward-compatible rendering for stored assistant billing_error messages
    const sdkContent = message.content as SDKMessage
    if (isSDKAssistantMessage(sdkContent)) {
      const assistantErrorResult = getAssistantErrorResultMessage(sdkContent)
      if (assistantErrorResult) {
        return <ErrorResultMessage content={assistantErrorResult} />
      }
    }
  }

  const componentType = getMessageComponentType(message)

  switch (componentType) {
    case COMPONENT_TYPE.USER: {
      const userContent = typeof message.content === "string" ? message.content : JSON.stringify(message.content)
      return <UserMessage content={userContent} attachments={message.attachments} />
    }

    case COMPONENT_TYPE.START:
      return (
        <StartMessage
          data={message.content as BridgeStartMessage["data"]}
          timestamp={message.timestamp.toISOString()}
        />
      )

    case COMPONENT_TYPE.SYSTEM:
      return <SystemMessage content={message.content as SDKSystemMessage} />

    case COMPONENT_TYPE.ASSISTANT:
      return <AssistantMessage content={message.content as SDKAssistantMessage} />

    case COMPONENT_TYPE.TOOL_RESULT:
      return (
        <ToolResultMessage
          content={message.content as SDKUserMessage}
          tabId={options?.tabId}
          onSubmitAnswer={options?.onSubmitAnswer}
        />
      )

    case COMPONENT_TYPE.RESULT:
      return <ResultMessage content={message.content as SDKResultMessage} />

    case COMPONENT_TYPE.COMPLETE:
      return <CompleteMessage data={message.content as BridgeCompleteMessage["data"]} />

    case COMPONENT_TYPE.COMPACT_BOUNDARY:
      // SDK system message with compact_boundary subtype - no typed interface in SDK
      return <CompactBoundaryMessage data={message.content as any} />

    case COMPONENT_TYPE.COMPACTING:
      return <CompactingMessage />

    case COMPONENT_TYPE.TOOL_PROGRESS:
      return <ToolProgressMessage content={message.content as ToolProgressContent} />

    case COMPONENT_TYPE.AUTH_STATUS:
      return <AuthStatusMessage content={message.content as AuthStatusContent} />

    case COMPONENT_TYPE.INTERRUPT:
      return <InterruptMessage data={message.content as BridgeInterruptMessage["data"]} />

    case COMPONENT_TYPE.AGENT_MANAGER: {
      const content = message.content as AgentManagerContent
      return <AgentManagerMessage status={content.status} message={content.message} />
    }

    default:
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded">
          <div className="font-medium mb-1">Unknown Message Type</div>
          <pre className="text-xs">{JSON.stringify(message.content, null, 2)}</pre>
        </div>
      )
  }
}
