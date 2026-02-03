import { getMcpToolFriendlyName } from "@webalive/shared"
import { useMemo } from "react"
import type { UIMessage } from "@/features/chat/lib/message-parser"

/**
 * Derives status text from the last assistant message when busy.
 * Shows what tool is currently being used (e.g., "Reading file.tsx", "Running npm").
 */
export function useStatusText(busy: boolean, messages: UIMessage[]): string | undefined {
  return useMemo(() => {
    if (!busy || messages.length === 0) return undefined

    // Find the last assistant message (not user/tool_result)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg?.type === "sdk_message" && msg.content) {
        const content = msg.content as {
          type?: string
          message?: { content?: unknown[] }
        }

        if (content.type !== "assistant") continue

        const blocks = content.message?.content
        if (!Array.isArray(blocks) || blocks.length === 0) continue

        const lastBlock = blocks[blocks.length - 1] as {
          type?: string
          name?: string
          input?: { file_path?: string; path?: string; pattern?: string; command?: string }
        }

        if (lastBlock?.type === "tool_use" && lastBlock.name) {
          const input = lastBlock.input
          const toolName = lastBlock.name

          // Format based on tool type
          if (toolName === "Read" && input?.file_path) {
            const fileName = input.file_path.split("/").pop()
            return `Reading ${fileName}`
          }
          if (toolName === "Edit" && input?.file_path) {
            const fileName = input.file_path.split("/").pop()
            return `Editing ${fileName}`
          }
          if (toolName === "Write" && input?.file_path) {
            const fileName = input.file_path.split("/").pop()
            return `Writing ${fileName}`
          }
          if (toolName === "Glob" && input?.pattern) {
            return `Searching ${input.pattern}`
          }
          if (toolName === "Grep" && input?.pattern) {
            return `Grep: ${input.pattern.slice(0, 20)}${input.pattern.length > 20 ? "..." : ""}`
          }
          if (toolName === "Bash" && input?.command) {
            const cmd = input.command.split(" ")[0]
            return `Running ${cmd}`
          }
          // Check for MCP tools - show friendly name
          const mcpFriendly = getMcpToolFriendlyName(toolName)
          if (mcpFriendly) {
            return `${mcpFriendly.provider}: ${mcpFriendly.action}`
          }
          return `${toolName}...`
        }
        if (lastBlock?.type === "thinking") {
          return "Thinking..."
        }
        // Found an assistant message but no actionable block, keep looking
      }
    }
    return "Working..."
  }, [busy, messages])
}
