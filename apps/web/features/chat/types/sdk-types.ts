import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"

// Re-export types for use in other modules
export type { SDKAssistantMessage, SDKMessage, SDKResultMessage, SDKSystemMessage, SDKUserMessage }

// Re-export guards and helpers from new location
export {
  extractSessionId,
  getMessageStreamData,
  isErrorResultMessage,
  isSDKAssistantMessage,
  isSDKResultMessage,
  isSDKSystemMessage,
  isSDKUserMessage,
} from "@/features/chat/types/sdk"
