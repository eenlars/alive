import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages"
import { useState } from "react"
import { ScrollableCode } from "@/components/ui/primitives/ScrollableCode"
import { ToolButton } from "@/components/ui/primitives/ToolButton"

interface ToolUseProps {
  item: ContentBlock & { type: "tool_use" }
}

export function ToolUse({ item }: ToolUseProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasInput: boolean = Boolean(item.input && typeof item.input === "object" && Object.keys(item.input).length > 0)

  return (
    <div className="my-1">
      <ToolButton onClick={() => setIsExpanded(!isExpanded)}>{item.name}</ToolButton>
      {hasInput && isExpanded && <ScrollableCode content={JSON.stringify(item.input, null, 2)} />}
    </div>
  )
}
