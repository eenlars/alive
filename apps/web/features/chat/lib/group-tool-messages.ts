/**
 * Group consecutive exploration tool results into collapsible sections.
 *
 * When Claude explores a codebase (Read, Glob, Grep), the chat fills with
 * dozens of individual tool result rows. This utility groups consecutive
 * exploration tool results so the renderer can collapse them into a single
 * "Explored N files" line.
 */

import type { SDKUserMessage } from "@/features/chat/types/sdk-types"
import { COMPONENT_TYPE, getMessageComponentType, type UIMessage } from "./message-parser"

/** Minimal shape of a tool_result content block with our augmented tool_name */
interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  tool_name?: string
}

function isToolResultBlock(item: unknown): item is ToolResultBlock {
  return typeof item === "object" && item !== null && (item as ToolResultBlock).type === "tool_result"
}

/** Tools considered "exploration" — read-only codebase analysis */
const EXPLORATION_TOOLS = new Set(["Read", "Glob", "Grep"])

/** Minimum consecutive exploration tool results to form a group */
const MIN_GROUP_SIZE = 3

export type RenderItem =
  | { type: "single"; message: UIMessage; index: number }
  | { type: "group"; messages: UIMessage[]; startIndex: number }

/**
 * Extract tool names from a TOOL_RESULT UIMessage.
 * Returns empty array if not a tool result message.
 */
export function getToolNames(message: UIMessage): string[] {
  const componentType = getMessageComponentType(message)
  if (componentType !== COMPONENT_TYPE.TOOL_RESULT) return []

  const content = message.content as SDKUserMessage
  if (!content?.message?.content || !Array.isArray(content.message.content)) return []

  const names: string[] = []
  for (const item of content.message.content) {
    if (isToolResultBlock(item) && item.tool_name) {
      names.push(item.tool_name)
    }
  }
  return names
}

/**
 * Check if a message is an exploration-only tool result
 * (all tool results in the message are Read/Glob/Grep).
 */
function isExplorationToolResult(message: UIMessage): boolean {
  const toolNames = getToolNames(message)
  if (toolNames.length === 0) return false
  return toolNames.every(name => EXPLORATION_TOOLS.has(name))
}

/**
 * Group consecutive exploration tool result messages into collapsible sections.
 * Non-exploration messages pass through as singles.
 */
export function groupToolMessages(messages: UIMessage[]): RenderItem[] {
  const items: RenderItem[] = []
  let i = 0

  while (i < messages.length) {
    if (isExplorationToolResult(messages[i])) {
      const groupStart = i
      const groupMessages: UIMessage[] = []

      while (i < messages.length && isExplorationToolResult(messages[i])) {
        groupMessages.push(messages[i])
        i++
      }

      if (groupMessages.length >= MIN_GROUP_SIZE) {
        items.push({ type: "group", messages: groupMessages, startIndex: groupStart })
      } else {
        // Not enough to group — emit as singles
        groupMessages.forEach((msg, offset) => {
          items.push({ type: "single", message: msg, index: groupStart + offset })
        })
      }
    } else {
      items.push({ type: "single", message: messages[i], index: i })
      i++
    }
  }

  return items
}

/**
 * Build a summary for a group of exploration tool messages.
 * Returns total count and per-tool breakdown.
 */
export function getGroupSummary(messages: UIMessage[]): { total: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {}
  let total = 0

  for (const message of messages) {
    for (const name of getToolNames(message)) {
      breakdown[name] = (breakdown[name] || 0) + 1
      total++
    }
  }

  return { total, breakdown }
}
