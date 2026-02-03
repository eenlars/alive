import type { UIMessage } from "@/features/chat/lib/message-parser"
import type { SDKMessage } from "@/features/chat/types/sdk-types"
import { isSDKAssistantMessage, isSDKResultMessage } from "@/features/chat/types/sdk-types"

/**
 * Check if a message is primarily a text message (user message or assistant with only text)
 * Used for grouping messages in the UI
 */
export function isTextMessage(message: UIMessage): boolean {
  // User messages are always text
  if (message.type === "user") return true

  // Agent manager messages should be displayed prominently (not collapsed)
  if (message.type === "agent_manager") return true

  // Interrupt messages (user stopped) should be visible
  if (message.type === "interrupt") return true

  // Context compaction notices should be visible
  if (message.type === "compact_boundary") return true

  // Assistant messages with only text content (no tools)
  if (message.type === "sdk_message") {
    const sdkContent = message.content as SDKMessage
    if (isSDKAssistantMessage(sdkContent)) {
      const content = sdkContent.message?.content || []
      return content.length === 1 && content[0]?.type === "text"
    }
  }

  return false
}

export function isCompletionMessage(message: UIMessage): boolean {
  if (message.type === "complete" || message.type === "result") {
    return true
  }

  if (message.type === "sdk_message" && isSDKResultMessage(message.content as SDKMessage)) {
    return true
  }

  return false
}
