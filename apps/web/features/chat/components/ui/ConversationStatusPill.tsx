/**
 * ConversationStatusPill - Tiny inline status indicator for conversation sidebar items.
 *
 * States:
 * - Working (streaming + tools running): emerald dot + label
 * - Thinking (streaming + no tools):    amber dot + label
 * - Idle (no stream):                   renders nothing
 */

import { cn } from "@/lib/utils"

interface ConversationStatusPillProps {
  isStreaming: boolean
  hasPendingTools: boolean
}

export function ConversationStatusPill({ isStreaming, hasPendingTools }: ConversationStatusPillProps) {
  if (!isStreaming) return null

  const isWorking = hasPendingTools

  return (
    <span className={cn("inline-flex items-center gap-1 shrink-0", "animate-in fade-in duration-200")}>
      {/* Pulsing dot */}
      <span className="relative flex h-1.5 w-1.5">
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-60 animate-ping",
            isWorking ? "bg-emerald-500" : "bg-amber-500",
          )}
        />
        <span
          className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", isWorking ? "bg-emerald-500" : "bg-amber-500")}
        />
      </span>

      {/* Label */}
      <span className="text-[10px] leading-none font-medium text-black/30 dark:text-white/30">
        {isWorking ? "Working" : "Thinking"}
      </span>
    </span>
  )
}
