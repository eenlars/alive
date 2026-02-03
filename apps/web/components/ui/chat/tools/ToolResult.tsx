import { useState } from "react"
import { ScrollableCode } from "@/components/ui/primitives/ScrollableCode"
import { ToolButton } from "@/components/ui/primitives/ToolButton"

interface ToolResultProps {
  toolName: string
  content: unknown
  isError?: boolean
}

export function ToolResult({ toolName, content, isError = false }: ToolResultProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getDisplayContent = () => {
    if (typeof content === "string") {
      try {
        return JSON.parse(content)
      } catch {
        return content
      }
    }
    return content
  }

  const displayContent = getDisplayContent()
  const contentString = typeof displayContent === "string" ? displayContent : JSON.stringify(displayContent, null, 2)

  return (
    <div className="my-1">
      <ToolButton onClick={() => setIsExpanded(!isExpanded)} variant={isError ? "error" : "default"}>
        {toolName}
        {isError && " error"}
      </ToolButton>
      {isExpanded && <ScrollableCode content={contentString} />}
    </div>
  )
}
