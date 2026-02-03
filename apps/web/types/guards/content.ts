import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk"

export type ContentItem = SDKAssistantMessage["message"]["content"][number]

// Type guards for content blocks
export function isTextBlock(item: unknown): item is Extract<ContentItem, { type: "text" }> {
  return typeof item === "object" && item !== null && (item as { type: string }).type === "text"
}

export function isToolUseBlock(item: unknown): item is Extract<ContentItem, { type: "tool_use" }> {
  return typeof item === "object" && item !== null && (item as { type: string }).type === "tool_use"
}
