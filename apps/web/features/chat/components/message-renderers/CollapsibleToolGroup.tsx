/**
 * Collapsible group for consecutive exploration tool results.
 *
 * When Claude reads/searches many files, this collapses them into
 * a single "Explored N files" line. Expands to show individual results.
 */

"use client"

import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { getGroupSummary } from "@/features/chat/lib/group-tool-messages"
import { renderMessage } from "@/features/chat/lib/message-renderer"
import type { UIMessage } from "@/features/chat/lib/message-parser"
import { cn } from "@/lib/utils"
import { interactiveText, mutedIcon, toolIndicatorButton } from "./styles"

interface CollapsibleToolGroupProps {
  messages: UIMessage[]
  tabId?: string
  onSubmitAnswer?: (message: string) => void
}

export function CollapsibleToolGroup({ messages, tabId, onSubmitAnswer }: CollapsibleToolGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { total, breakdown } = getGroupSummary(messages)

  // "Read x8, Grep x3, Glob x1"
  const parts = Object.entries(breakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => `${name} \u00d7${count}`)

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className={cn(toolIndicatorButton, interactiveText)}
      >
        <ChevronRight
          size={12}
          className={cn(mutedIcon, "flex-shrink-0 transition-transform", isExpanded && "rotate-90")}
        />
        <span>
          Explored {total} file{total !== 1 ? "s" : ""}
        </span>
        <span className="text-black/25 dark:text-white/25">({parts.join(", ")})</span>
      </button>

      {isExpanded && (
        <div className="ml-3.5 mt-0.5 border-l border-black/10 dark:border-white/10 pl-2">
          {messages.map(message => (
            <div key={message.id}>{renderMessage(message, { onSubmitAnswer, tabId })}</div>
          ))}
        </div>
      )}
    </div>
  )
}
