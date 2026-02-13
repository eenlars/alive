/**
 * Calendar component types
 */

export interface EventDraft {
  summary: string
  description?: string
  start: {
    dateTime: string
    timeZone?: string
  }
  end: {
    dateTime: string
    timeZone?: string
  }
  location?: string
  attendees?: Array<{
    email: string
    optional?: boolean
  }>
  calendarId?: string
  transparency?: "opaque" | "transparent"
  recurrence?: string[]
}

export interface CalendarEvent {
  id: string
  calendarId: string
  summary: string
  description?: string
  start: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  end: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  location?: string
  organizer?: {
    email: string
    displayName?: string
  }
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus: "accepted" | "declined" | "tentative" | "needsAction"
    optional?: boolean
  }>
  recurrence?: string[]
  conferenceData?: {
    conferenceId: string
    conferenceSolution: {
      key: { type: string }
      name: string
    }
    entryPoints?: Array<{
      entryPointType: string
      uri: string
      label?: string
    }>
  }
  htmlLink: string
  created?: string
  updated?: string
  transparency?: "opaque" | "transparent"
}

export interface FreeBusy {
  calendars: Array<{
    calendarId: string
    busy: Array<{
      start: string
      end: string
    }>
    errors?: Array<{
      reason: string
      message: string
    }>
  }>
}

export interface MeetingSuggestion {
  title: string
  description?: string
  attendees: Array<{
    email: string
    displayName?: string
  }>
  suggestedTimes: Array<{
    start: string
    end: string
    reason: string
  }>
  location?: string
  conferenceType?: "googleMeet" | "none"
}

export interface CalendarEventDraftOutputProps {
  data: EventDraft
  toolName: string
  isError?: boolean
  toolInput?: unknown
  toolUseId?: string
  tabId?: string
  onSubmitAnswer?: (message: string) => void
}

export interface CalendarEventDetailsOutputProps {
  data: CalendarEvent
  toolName: string
  isError?: boolean
  toolInput?: unknown
  toolUseId?: string
  tabId?: string
  onSubmitAnswer?: (message: string) => void
}

export interface AvailabilityCardProps {
  data: FreeBusy
  toolName: string
  isError?: boolean
  toolInput?: unknown
  toolUseId?: string
  tabId?: string
  onSubmitAnswer?: (message: string) => void
}

export interface MeetingProposalOutputProps {
  data: MeetingSuggestion
  toolName: string
  isError?: boolean
  toolInput?: unknown
  toolUseId?: string
  tabId?: string
  onSubmitAnswer?: (message: string) => void
}
