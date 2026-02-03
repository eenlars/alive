import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"

// Type guard for the specific system init message (the only SDKSystemMessage type)
export function isSDKSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return (
    msg.type === "system" &&
    "subtype" in msg &&
    (msg as SDKSystemMessage).subtype === "init" &&
    "session_id" in msg &&
    "uuid" in msg
  )
}

export function isSDKAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === "assistant" && "message" in msg
}

export function isSDKUserMessage(msg: SDKMessage): msg is SDKUserMessage {
  return msg.type === "user" && "message" in msg
}

export function isSDKResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === "result" && "is_error" in msg && "duration_ms" in msg
}

// Type guard for error result messages (client-side errors without duration_ms)
export function isErrorResultMessage(msg: unknown): msg is { type: "result"; is_error: true; result: string } {
  if (!msg || typeof msg !== "object") return false
  const m = msg as Record<string, unknown>
  return m.type === "result" && m.is_error === true && typeof m.result === "string"
}

// Helper to safely extract session ID from system init message
export function extractSessionId(msg: SDKMessage): string | null {
  if (isSDKSystemMessage(msg) && msg.subtype === "init") {
    return msg.session_id
  }
  return null
}

// Helper to safely get message content for streaming
export function getMessageStreamData(msg: SDKMessage) {
  return {
    messageType: msg.type,
    content: msg,
  }
}
