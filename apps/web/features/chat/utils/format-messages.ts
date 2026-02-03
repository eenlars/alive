import type { UIMessage } from "@/features/chat/lib/message-parser"

/**
 * Format messages as readable text for copying or displaying
 * Extracts user messages and assistant text responses
 */
export function formatMessagesAsText(messages: UIMessage[]): string {
  return messages
    .map(msg => {
      if (msg.type === "user") {
        return `User: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`
      }
      if (msg.type === "sdk_message") {
        const content = msg.content as { type?: string; message?: { content?: unknown[] }; result?: string }
        if (content.type === "assistant" && content.message?.content) {
          const textBlocks = content.message.content
            .filter((block: unknown) => (block as { type?: string }).type === "text")
            .map((block: unknown) => (block as { text?: string }).text)
            .join("\n")
          return textBlocks ? `Assistant: ${textBlocks}` : null
        }
        if (content.type === "result" && content.result) {
          return `Result: ${content.result}`
        }
      }
      return null
    })
    .filter(Boolean)
    .join("\n\n")
}
