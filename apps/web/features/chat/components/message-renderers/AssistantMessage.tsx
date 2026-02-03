"use client"

/**
 * AssistantMessage Component
 *
 * Renders Claude's assistant messages from the SDK.
 *
 * IMPORTANT: Tool execution inputs (tool_use blocks) are HIDDEN from regular users.
 * Users only see:
 * - Text responses from Claude
 * - Tool results (via ToolResultMessage component)
 *
 * Tool inputs are only shown in debug mode for developers to inspect what Claude
 * is executing. This keeps the UI clean and focused on results, not process.
 *
 * To enable debug mode: Toggle debug view in settings or use debug store.
 */

import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk"
import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { OAuthErrorMessage } from "@/components/ui/chat/errors/OAuthErrorMessage"
import { MarkdownDisplay } from "@/components/ui/chat/format/MarkdownDisplay"
import { ToolInputRouter } from "@/components/ui/chat/tools/ToolInputRouter"
import { useDebugVisible } from "@/lib/stores/debug-store"
import { getToolIcon } from "@/lib/tool-icons"
import { cn } from "@/lib/utils"
import { hasMarkdown } from "@/lib/utils/markdown-utils"
import type { ContentItem } from "@/types/guards/content"
import { isTextBlock, isToolUseBlock } from "@/types/guards/content"
import { ICON_SIZE, interactiveText, monoText, mutedIcon, subtleText, toolIndicatorButton } from "./styles"

interface AssistantMessageProps {
  content: SDKAssistantMessage
}

/**
 * Detects OAuth/authentication errors in error messages
 */
function isOAuthError(text: string): boolean {
  return (
    text.includes("authentication_error") &&
    (text.includes("OAuth token has expired") || text.includes("Please run /login"))
  )
}

export function AssistantMessage({ content }: AssistantMessageProps) {
  return (
    <>
      {content.message.content.map((item, index) => (
        <ToolUseItem key={index} item={item} />
      ))}
    </>
  )
}

function ToolUseItem({ item }: { item: ContentItem }): React.ReactNode {
  const isDebugMode = useDebugVisible()
  if (isTextBlock(item)) {
    const text = item.text

    // Check for OAuth/authentication errors first
    if (isOAuthError(text)) {
      return <OAuthErrorMessage />
    }

    // Use MarkdownDisplay if the text contains markdown, otherwise render plain text
    // Text messages get more vertical spacing than tool results
    if (hasMarkdown(text)) {
      return (
        <div className="mb-4">
          <MarkdownDisplay content={text} />
        </div>
      )
    }

    return (
      <div className="mb-4 whitespace-pre-wrap break-words text-black dark:text-white font-normal leading-relaxed">
        {text}
      </div>
    )
  }

  if (isToolUseBlock(item)) {
    // Hide all tool_use blocks in normal mode - users only want to see results
    // In debug mode, show them for inspection
    if (!isDebugMode) {
      return null
    }

    const toolItem = item as { name: string; input: Record<string, unknown> }
    const Icon = getToolIcon(toolItem.name)

    const getActionLabel = (toolName: string) => {
      switch (toolName.toLowerCase()) {
        case "read":
          return "reading"
        case "edit":
          return "editing"
        case "write":
          return "writing"
        case "grep":
          return "searching"
        case "glob":
          return "finding"
        case "bash":
          return "running"
        case "task":
          return "delegating"
        case "webfetch":
          return "fetching"
        default:
          return toolName.toLowerCase()
      }
    }

    const getInlineDetail = (toolName: string, input: Record<string, unknown>) => {
      const name = toolName.toLowerCase()
      if (name === "read" || name === "edit" || name === "write") {
        const filePath = input.file_path as string
        if (filePath) {
          return filePath.split("/").pop() || filePath
        }
      }
      if (name === "webfetch") {
        const url = input.url as string
        if (url) {
          try {
            return new URL(url).hostname.replace(/^www\./, "")
          } catch {
            return url.length > 30 ? `${url.slice(0, 30)}...` : url
          }
        }
      }
      return null
    }

    const inlineDetail = getInlineDetail(toolItem.name, toolItem.input)

    return (
      <DebugToolItem
        toolItem={toolItem}
        icon={Icon}
        actionLabel={getActionLabel(toolItem.name)}
        inlineDetail={inlineDetail}
      />
    )
  }

  // Unhandled content type
  const unhandledItem = item as unknown as { type: string }
  return <div className="text-xs text-red-600 dark:text-red-400">Unhandled content type: {unhandledItem.type}</div>
}

function DebugToolItem({
  toolItem,
  icon: Icon,
  actionLabel,
  inlineDetail,
}: {
  toolItem: { name: string; input: Record<string, unknown> }
  icon: React.ComponentType<{ size?: string | number; className?: string }>
  actionLabel: string
  inlineDetail: string | null
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(toolIndicatorButton, interactiveText, "mb-2")}
      >
        <ChevronRight size={ICON_SIZE} className={cn(mutedIcon, "transition-transform", isExpanded && "rotate-90")} />
        <Icon size={ICON_SIZE} className={mutedIcon} />
        <span>{toolItem.name}</span>
        <span className={subtleText}>({actionLabel})</span>
        {inlineDetail && <span className={cn(monoText, "text-black/50 dark:text-white/50")}>{inlineDetail}</span>}
      </button>

      {isExpanded && (
        <div className="mt-2 ml-6 mb-2">
          <ToolInputRouter toolName={toolItem.name} input={toolItem.input} />
        </div>
      )}
    </>
  )
}
