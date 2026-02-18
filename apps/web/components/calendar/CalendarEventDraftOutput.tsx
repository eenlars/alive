/**
 * Calendar Event Draft Output Component
 *
 * Renders event draft returned by compose_calendar_event tool.
 * Shows editable event card with Create Event button.
 * User must click to create - Claude does not create autonomously.
 */

"use client"

import { useCallback, useState } from "react"
import toast from "react-hot-toast"
import { CalendarEventDraftCard } from "./CalendarEventDraftCard"
import { normalizeDraftDateTimesForApi } from "./dateTime"
import type { CalendarEventDraftOutputProps, EventDraft } from "./types"

/**
 * Validates that data has the minimum structure for an event draft
 */
export function validateCalendarEventDraft(data: unknown): boolean {
  if (!data || typeof data !== "object") return false
  const d = data as Record<string, unknown>
  return typeof d.summary === "string" && d.start != null && d.end != null
}

export function CalendarEventDraftOutput({
  data,
  isError = false,
  toolUseId,
  tabId,
  onSubmitAnswer,
}: CalendarEventDraftOutputProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleCreate = useCallback(
    async (eventData: EventDraft) => {
      setIsLoading(true)
      try {
        const payload = normalizeDraftDateTimesForApi(eventData)

        const response = await fetch("/api/google/calendar/create-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.reason || "Failed to create event")
        }

        const result = await response.json()

        toast.success(`"${payload.summary}" added to your calendar`)

        if (onSubmitAnswer) {
          onSubmitAnswer(`Event created successfully: ${result.htmlLink}`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create event"
        toast.error(message)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [onSubmitAnswer],
  )

  if (isError) {
    return (
      <div className="border border-red-200 dark:border-red-900 rounded-lg p-4 bg-red-50 dark:bg-red-900/10">
        <p className="text-sm text-red-700 dark:text-red-300">
          Error processing event data: {typeof data === "string" ? data : "Invalid format"}
        </p>
      </div>
    )
  }

  return (
    <CalendarEventDraftCard
      draft={data}
      onCreate={handleCreate}
      actionsDisabled={isLoading}
      isCalendarConnected={true}
      tabId={tabId}
      toolUseId={toolUseId}
    />
  )
}
