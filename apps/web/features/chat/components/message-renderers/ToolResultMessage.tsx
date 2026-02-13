/**
 * Tool Result Message Renderer
 *
 * Displays tool results with:
 * - Collapsed preview (from unified registry)
 * - Auto-expand based on tool config
 * - Custom renderers for rich UI
 */

import { useState } from "react"
import { ToolOutputRouter } from "@/components/ui/chat/tools/ToolOutputRouter"
import type { SDKUserMessage } from "@/features/chat/types/sdk-types"
import { useDebugVisible } from "@/lib/stores/debug-store"
import { getToolIcon } from "@/lib/tool-icons"
import { getToolPreview, shouldAutoExpand, transformToolData } from "@/lib/tools/tool-registry"
import { cn } from "@/lib/utils"
import {
  errorInteractiveText,
  filledBg,
  ICON_SIZE,
  interactiveText,
  mutedIcon,
  roundedContainer,
  toolIndicatorButton,
} from "./styles"

// Extended tool result type with our added tool_name and tool_input
interface ToolResultContent {
  type: "tool_result"
  tool_use_id: string
  content?: string
  is_error?: boolean
  tool_name?: string // Added by our parser
  tool_input?: unknown // Added by our parser - the original tool input
}

// SDK image content block (multimodal)
interface ImageContentBlock {
  type: "image"
  source: {
    type: "base64"
    media_type: string
    data: string
  }
}

// Type guard to check if a content block is a tool result
function isToolResult(content: unknown): content is ToolResultContent {
  return content !== null && typeof content === "object" && (content as any).type === "tool_result"
}

// Type guard to check if a content block is an image
function isImageContent(content: unknown): content is ImageContentBlock {
  return content !== null && typeof content === "object" && (content as any).type === "image"
}

interface ToolResultMessageProps {
  content: SDKUserMessage
  tabId?: string
  /** Callback to send a message to the chat (for interactive tools like clarification questions) */
  onSubmitAnswer?: (message: string) => void
}

export function ToolResultMessage({ content, tabId, onSubmitAnswer }: ToolResultMessageProps) {
  const messageContent = content.message.content

  return (
    <>
      {Array.isArray(messageContent) &&
        messageContent.map((result: unknown, index: number) => {
          if (isToolResult(result)) {
            return <ToolResult key={index} result={result} tabId={tabId} onSubmitAnswer={onSubmitAnswer} />
          }
          // Handle SDK image content blocks (base64 multimodal images)
          if (isImageContent(result)) {
            return <ImagePreview key={index} image={result} />
          }
          return null
        })}
    </>
  )
}

/** Render a base64 image from SDK multimodal content */
function ImagePreview({ image }: { image: ImageContentBlock }) {
  const dataUrl = `data:${image.source.media_type};base64,${image.source.data}`
  return (
    <div className={cn("mb-2 overflow-hidden inline-block", roundedContainer, filledBg)}>
      <img src={dataUrl} alt="Analysis result" className="max-w-64 max-h-64 object-contain" loading="lazy" />
    </div>
  )
}

function ToolResult({
  result,
  tabId,
  onSubmitAnswer,
}: {
  result: ToolResultContent
  tabId?: string
  onSubmitAnswer?: (message: string) => void
}) {
  const toolName = result.tool_name || "Tool Result"
  const isDebugMode = useDebugVisible()

  // Auto-expand based on tool config (errors always expand)
  const [isExpanded, setIsExpanded] = useState(() => shouldAutoExpand(toolName, result.is_error ?? false))

  const Icon = getToolIcon(toolName)

  // Parse the content to get structured tool output
  const displayContent = parseContent(result.content)

  // Get preview text from unified registry
  const transformedData = transformToolData(toolName, displayContent)
  const preview = getToolPreview(toolName, transformedData, result.tool_input)

  // In debug mode, show both exact tool name and preview
  const displayPreview = isDebugMode ? `${toolName}: ${preview}` : preview

  return (
    <>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className={cn(toolIndicatorButton, "mb-2", result.is_error ? errorInteractiveText : interactiveText)}
      >
        <Icon size={ICON_SIZE} className={cn(mutedIcon, "flex-shrink-0")} />
        <span className="truncate">
          {displayPreview}
          {result.is_error && " error"}
        </span>
      </button>
      {isExpanded && (
        <div className="mt-1 mb-2 overflow-hidden">
          <ToolOutputRouter
            toolName={toolName}
            content={displayContent}
            toolInput={result.tool_input}
            toolUseId={result.tool_use_id}
            tabId={tabId}
            onSubmitAnswer={onSubmitAnswer}
          />
        </div>
      )}
    </>
  )
}

/** Parse string content as JSON if possible */
function parseContent(content: unknown): unknown {
  if (typeof content === "string") {
    try {
      return JSON.parse(content)
    } catch {
      return content
    }
  }
  return content
}
