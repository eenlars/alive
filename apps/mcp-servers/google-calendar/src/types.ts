/**
 * TypeScript interfaces and Zod schemas for Google Calendar
 */

import { z } from "zod"

// Calendar type
export interface Calendar {
  id: string
  summary: string
  description?: string
  timeZone: string
  primaryCalendar: boolean
  backgroundColor?: string
}

// Event type (from Google Calendar API)
export interface CalendarEvent {
  id: string
  calendarId: string
  summary: string
  description?: string
  start: {
    dateTime?: string // RFC 3339 format: "2024-02-13T15:30:00Z"
    date?: string // YYYY-MM-DD for all-day events
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
  recurrence?: string[] // iCalendar format, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"]
  conferenceData?: {
    conferenceId: string
    conferenceSolution: {
      key: {
        type: string // "hangoutsMeet", "addOn", etc.
      }
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
  transparency?: "opaque" | "transparent" // Shows as busy/free
}

// Event draft - what Claude proposes before user confirms
export interface EventDraft {
  summary: string
  description?: string
  start: {
    dateTime: string // ISO 8601 format
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
  calendarId?: string // Which calendar to create in
  transparency?: "opaque" | "transparent"
  recurrence?: string[] // iCalendar RRULE format
}

// Free/busy response
export interface FreeBusy {
  calendars: Array<{
    calendarId: string
    busy: Array<{
      start: string // ISO 8601
      end: string
    }>
    errors?: Array<{
      reason: string
      domain: string
    }>
  }>
}

// Meeting suggestion
export interface MeetingSuggestion {
  title: string
  description?: string
  attendees: Array<{
    email: string
    displayName?: string
  }>
  suggestedTimes: Array<{
    start: string // ISO 8601
    end: string
    reason: string // Why this time was suggested
  }>
  location?: string
  conferenceType?: "googleMeet" | "none"
}

// Zod validation schemas
export const EventDraftSchema = z.object({
  summary: z.string().min(1, "Event title is required"),
  description: z.string().optional(),
  start: z.object({
    dateTime: z.string().datetime("Start must be ISO 8601 datetime"),
    timeZone: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string().datetime("End must be ISO 8601 datetime"),
    timeZone: z.string().optional(),
  }),
  location: z.string().optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().email("Invalid attendee email"),
        optional: z.boolean().optional(),
      }),
    )
    .optional(),
  calendarId: z.string().optional(),
  transparency: z.enum(["opaque", "transparent"]).optional(),
  recurrence: z.array(z.string()).optional(),
})

export type ValidatedEventDraft = z.infer<typeof EventDraftSchema>

export const FreeBusyQuerySchema = z.object({
  calendarIds: z.array(z.string()).min(1, "At least one calendar ID required"),
  timeMin: z.string().datetime("timeMin must be ISO 8601 datetime"),
  timeMax: z.string().datetime("timeMax must be ISO 8601 datetime"),
})

export const SearchEventsSchema = z.object({
  query: z.string().min(1, "Search query required"),
  calendarId: z.string().default("primary"),
  timeMin: z.string().datetime().optional(),
  timeMax: z.string().datetime().optional(),
  maxResults: z.number().int().min(1).max(250).default(10),
})

export const ListEventsSchema = z.object({
  calendarId: z.string().default("primary"),
  timeMin: z.string().datetime().optional(),
  timeMax: z.string().datetime().optional(),
  maxResults: z.number().int().min(1).max(250).default(25),
  showDeleted: z.boolean().default(false),
})

export const MeetingSuggestionSchema = z.object({
  title: z.string().min(1, "Meeting title is required"),
  description: z.string().optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().email("Invalid attendee email"),
        displayName: z.string().optional(),
      }),
    )
    .min(1, "At least one attendee required"),
  suggestedTimes: z
    .array(
      z.object({
        start: z.string().datetime("Start must be ISO 8601"),
        end: z.string().datetime("End must be ISO 8601"),
        reason: z.string().min(1, "Reason for suggestion required"),
      }),
    )
    .min(1, "At least one time suggestion required"),
  location: z.string().optional(),
  conferenceType: z.enum(["googleMeet", "none"]).default("none"),
})
