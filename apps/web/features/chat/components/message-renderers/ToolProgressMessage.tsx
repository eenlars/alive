import type { ToolProgressContent } from "@/features/chat/lib/message-parser"
import { PulsingDot } from "../ui/PulsingDot"

interface ToolProgressMessageProps {
  content: ToolProgressContent
}

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

export function ToolProgressMessage({ content }: ToolProgressMessageProps) {
  return (
    <div className="py-1 flex items-center justify-center">
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <PulsingDot size="sm" />
          <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">{content.tool_name}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
            {formatElapsedTime(content.elapsed_time_seconds)}
          </span>
        </div>
      </div>
    </div>
  )
}
