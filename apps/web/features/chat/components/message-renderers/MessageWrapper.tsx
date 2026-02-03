"use client"

/**
 * MessageWrapper Component
 *
 * Wraps individual messages with hover actions like delete.
 * Button positioned to the right on desktop (hidden on mobile).
 * Uses opacity + pointer-events for smooth fade without layout shift.
 */

import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useDexieMessageActions } from "@/lib/db/dexieMessageStore"
import { cn } from "@/lib/utils"

interface MessageWrapperProps {
  messageId: string
  tabId: string
  /** Whether this message can be deleted (has previous assistant message) */
  canDelete: boolean
  children: React.ReactNode
}

export function MessageWrapper({ messageId, tabId, canDelete, children }: MessageWrapperProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const { deleteMessagesAfter } = useDexieMessageActions()

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)

    console.log("[MessageWrapper] Deleting message:", { messageId, tabId, canDelete })

    try {
      const resumeUuid = await deleteMessagesAfter(messageId, tabId)
      if (resumeUuid) {
        console.log("[MessageWrapper] Messages deleted, will resume at:", resumeUuid)
      } else {
        console.warn("[MessageWrapper] Could not delete messages (no previous assistant)")
      }
    } catch (error) {
      console.error("[MessageWrapper] Delete failed:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  // Button to the RIGHT of message (horizontal flex layout)
  // Only show button container on desktop when canDelete is true
  return (
    <div className={cn("group flex items-start", canDelete && "gap-1")}>
      {/* Message content - takes available space */}
      <div className="min-w-0 flex-1">{children}</div>

      {/* Delete button - to the right, shown on hover (desktop only) */}
      {canDelete && (
        <div
          className={cn(
            // Fixed width container so layout doesn't shift
            "w-8 flex-shrink-0",
            // Desktop only
            "hidden md:flex",
            // Center the button
            "items-start justify-center pt-1",
          )}
        >
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className={cn(
              "p-1.5 rounded-md",
              // Colors
              "text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400",
              "hover:bg-red-50 dark:hover:bg-red-950/30",
              // Hidden by default, shown on group hover
              "opacity-0 pointer-events-none",
              "group-hover:opacity-100 group-hover:pointer-events-auto",
              "transition-opacity duration-150",
              // Loading state
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            title="Delete this message and all messages after it"
            aria-label="Delete message"
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  )
}
