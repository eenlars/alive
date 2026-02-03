// Extended tool result type with our added tool_name
export interface ToolResultContent {
  type: "tool_result"
  tool_use_id: string
  content?: string
  is_error?: boolean
  tool_name?: string // Added by our parser
}

// Type guard to check if a content block is a tool result
export function isToolResult(content: unknown): content is ToolResultContent {
  if (!content || typeof content !== "object") return false
  return (content as Record<string, unknown>).type === "tool_result"
}
