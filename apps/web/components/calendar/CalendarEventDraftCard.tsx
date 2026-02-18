/**
 * CalendarEventDraftCard Component
 *
 * Clean calendar event compose UI. Claude drafts events, user creates them.
 * Pattern matches EmailDraftCard but for calendar events.
 */

"use client"

import { AlertTriangle, Calendar, Check, Loader2, Users, X } from "lucide-react"
import { type KeyboardEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import { toApiDateTime, toDateTimeLocalValue } from "./dateTime"
import type { EventDraft } from "./types"

interface CalendarEventDraftCardProps {
  draft: EventDraft
  onCreate: (eventData: EventDraft) => Promise<void>
  onDraftChange?: (eventData: EventDraft) => void
  actionsDisabled?: boolean
  isCalendarConnected?: boolean
  tabId?: string
  toolUseId?: string
  onSubmitAnswer?: (message: string) => void
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function AttendeeField({
  attendees,
  onChange,
}: {
  attendees: Array<{ email: string; optional?: boolean }>
  onChange: (attendees: Array<{ email: string; optional?: boolean }>) => void
}) {
  const [inputValue, setInputValue] = useState("")

  const addAttendee = () => {
    const email = inputValue.trim()
    if (!email || !isValidEmail(email) || attendees.some(a => a.email === email)) {
      return false
    }
    onChange([...attendees, { email, optional: false }])
    setInputValue("")
    return true
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addAttendee()
    } else if (e.key === "Backspace" && !inputValue && attendees.length > 0) {
      onChange(attendees.slice(0, -1))
    }
  }

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-200 dark:border-zinc-700">
      <Users className="w-4 h-4 text-zinc-400 flex-shrink-0" />
      <div className="flex-1 flex flex-wrap items-center gap-1.5">
        {attendees.map((attendee, idx) => (
          <span
            key={`${attendee.email}-${idx}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
          >
            {attendee.email}
            {attendee.optional && <span className="text-xs">(optional)</span>}
            <button
              type="button"
              onClick={() => onChange(attendees.filter((_, i) => i !== idx))}
              className="hover:text-blue-900 dark:hover:text-blue-100"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="email"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addAttendee()}
          placeholder={attendees.length === 0 ? "Add attendees..." : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 outline-none"
        />
      </div>
    </div>
  )
}

function CalendarDisconnectedWarning() {
  return (
    <div className="flex items-center gap-2 p-2 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>Google Calendar not connected.</span>
      <a href="/chat?settings=integrations" className="underline hover:no-underline">
        Connect
      </a>
    </div>
  )
}

export function CalendarEventDraftCard({
  draft: initialDraft,
  onCreate,
  onDraftChange,
  actionsDisabled = false,
  isCalendarConnected = true,
  tabId: _tabId,
  toolUseId: _toolUseId,
  onSubmitAnswer: _onSubmitAnswer,
}: CalendarEventDraftCardProps) {
  const [draft, setDraft] = useState<EventDraft>(initialDraft)
  const [isCreating, setIsCreating] = useState(false)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDraftChange = (newDraft: EventDraft) => {
    setDraft(newDraft)
    setError(null)
    onDraftChange?.(newDraft)
  }

  const handleCreate = async () => {
    // Validate
    if (!draft.summary?.trim()) {
      setError("Event title is required")
      return
    }

    const startTime = new Date(draft.start.dateTime).getTime()
    const endTime = new Date(draft.end.dateTime).getTime()

    if (startTime >= endTime) {
      setError("Event start time must be before end time")
      return
    }

    setError(null)
    setIsCreating(true)

    try {
      await onCreate(draft)
      // Event created - show success state
      setCreatedEventId(draft.summary) // Use title as identifier
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create event"
      setError(message)
      setIsCreating(false)
    }
  }

  if (!isCalendarConnected) {
    return (
      <div className="border border-amber-200 dark:border-amber-900 rounded-lg p-4 space-y-3 bg-white dark:bg-zinc-900">
        <CalendarDisconnectedWarning />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your Google Calendar in Settings to create events.
        </p>
      </div>
    )
  }

  if (createdEventId) {
    return (
      <div className="border border-green-200 dark:border-green-900 rounded-lg p-4 bg-green-50 dark:bg-green-900/10">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
          <Check className="w-5 h-5" />
          <span className="font-medium">Event created successfully</span>
        </div>
        <p className="text-sm text-green-600 dark:text-green-400 mt-1">
          "{draft.summary}" has been added to your calendar
        </p>
      </div>
    )
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
        <Calendar className="w-4 h-4 text-zinc-500" />
        <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">New Event</h3>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        {/* Title */}
        <div>
          <input
            type="text"
            value={draft.summary}
            onChange={e => handleDraftChange({ ...draft, summary: e.target.value })}
            placeholder="Event title (required)"
            className="w-full bg-transparent text-lg font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none border-b border-zinc-200 dark:border-zinc-700 pb-2"
            disabled={isCreating || actionsDisabled}
          />
        </div>

        {/* Description */}
        <div>
          <textarea
            value={draft.description || ""}
            onChange={e => handleDraftChange({ ...draft, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full bg-transparent text-sm text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 outline-none border-b border-zinc-200 dark:border-zinc-700 pb-2 resize-none"
            rows={2}
            disabled={isCreating || actionsDisabled}
          />
        </div>

        {/* Date/Time Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              Start
              <input
                type="datetime-local"
                value={toDateTimeLocalValue(draft.start.dateTime)}
                onChange={e =>
                  handleDraftChange({
                    ...draft,
                    start: { ...draft.start, dateTime: toApiDateTime(e.target.value) },
                  })
                }
                className="w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                disabled={isCreating || actionsDisabled}
              />
            </label>
          </div>
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              End
              <input
                type="datetime-local"
                value={toDateTimeLocalValue(draft.end.dateTime)}
                onChange={e =>
                  handleDraftChange({
                    ...draft,
                    end: { ...draft.end, dateTime: toApiDateTime(e.target.value) },
                  })
                }
                className="w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                disabled={isCreating || actionsDisabled}
              />
            </label>
          </div>
        </div>

        {/* Location */}
        <div>
          <input
            type="text"
            value={draft.location || ""}
            onChange={e => handleDraftChange({ ...draft, location: e.target.value })}
            placeholder="Location (optional)"
            className="w-full px-2 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
            disabled={isCreating || actionsDisabled}
          />
        </div>

        {/* Attendees */}
        {draft.attendees && draft.attendees.length > 0 && (
          <AttendeeField
            attendees={draft.attendees}
            onChange={attendees => handleDraftChange({ ...draft, attendees })}
          />
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 p-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700">
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={isCreating || actionsDisabled || !isCalendarConnected}
          className="flex items-center gap-2"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Check className="w-3 h-3" />
              Create Event
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
