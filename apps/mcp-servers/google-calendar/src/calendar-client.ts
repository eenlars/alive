/**
 * Google Calendar API Client
 *
 * Wraps the Google Calendar API with Bearer token authentication.
 * Each request uses the access token passed via HTTP Authorization header.
 */

import { auth, calendar, type calendar_v3 } from "@googleapis/calendar"
import type { Calendar, CalendarEvent, FreeBusy } from "./types.js"

/**
 * Create a Calendar client with the provided access token
 */
export function createCalendarClient(accessToken: string): calendar_v3.Calendar {
  const oauth2Client = new auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })

  return calendar({ version: "v3", auth: oauth2Client })
}

// ============================================================
// Event mapping helper (single source of truth)
// ============================================================

function mapEvent(item: calendar_v3.Schema$Event, calendarId: string): CalendarEvent {
  return {
    id: item.id || "",
    calendarId,
    summary: item.summary || "(No title)",
    description: item.description ?? undefined,
    start: {
      dateTime: item.start?.dateTime ?? undefined,
      date: item.start?.date ?? undefined,
      timeZone: item.start?.timeZone ?? undefined,
    },
    end: {
      dateTime: item.end?.dateTime ?? undefined,
      date: item.end?.date ?? undefined,
      timeZone: item.end?.timeZone ?? undefined,
    },
    location: item.location ?? undefined,
    organizer: item.organizer
      ? {
          email: item.organizer.email || "",
          displayName: item.organizer.displayName ?? undefined,
        }
      : undefined,
    attendees: item.attendees?.map(att => ({
      email: att.email || "",
      displayName: att.displayName ?? undefined,
      responseStatus: (att.responseStatus as "accepted" | "declined" | "tentative" | "needsAction") || "needsAction",
      optional: att.optional ?? undefined,
    })),
    recurrence: item.recurrence ?? undefined,
    conferenceData: item.conferenceData
      ? {
          conferenceId: item.conferenceData.conferenceId || "",
          conferenceSolution: {
            key: { type: item.conferenceData.conferenceSolution?.key?.type || "" },
            name: item.conferenceData.conferenceSolution?.name || "",
          },
          entryPoints: item.conferenceData.entryPoints?.map(ep => ({
            entryPointType: ep.entryPointType || "",
            uri: ep.uri || "",
            label: ep.label ?? undefined,
          })),
        }
      : undefined,
    htmlLink: item.htmlLink || "",
    created: item.created ?? undefined,
    updated: item.updated ?? undefined,
    transparency: (item.transparency as "opaque" | "transparent") || "opaque",
  }
}

// ============================================================
// Calendar operations
// ============================================================

export async function listCalendars(cal: calendar_v3.Calendar): Promise<Calendar[]> {
  const response = await cal.calendarList.list()

  return (response.data.items || []).map(item => ({
    id: item.id || "",
    summary: item.summary || "",
    description: item.description ?? undefined,
    timeZone: item.timeZone || "UTC",
    primaryCalendar: item.primary || false,
    backgroundColor: item.backgroundColor ?? undefined,
  }))
}

export async function getCalendar(cal: calendar_v3.Calendar, calendarId: string): Promise<Calendar> {
  const response = await cal.calendars.get({ calendarId })

  return {
    id: response.data.id || calendarId,
    summary: response.data.summary || "",
    description: response.data.description ?? undefined,
    timeZone: response.data.timeZone || "UTC",
    primaryCalendar: false,
  }
}

// ============================================================
// Event operations
// ============================================================

export async function listEvents(
  cal: calendar_v3.Calendar,
  calendarId: string,
  options?: {
    timeMin?: string
    timeMax?: string
    maxResults?: number
    showDeleted?: boolean
  },
): Promise<CalendarEvent[]> {
  const response = await cal.events.list({
    calendarId,
    timeMin: options?.timeMin,
    timeMax: options?.timeMax,
    maxResults: options?.maxResults || 25,
    showDeleted: options?.showDeleted || false,
    singleEvents: true,
    orderBy: "startTime",
  })

  return (response.data.items || []).map(item => mapEvent(item, calendarId))
}

export async function getEvent(cal: calendar_v3.Calendar, calendarId: string, eventId: string): Promise<CalendarEvent> {
  const response = await cal.events.get({ calendarId, eventId })
  return mapEvent(response.data, calendarId)
}

export async function searchEvents(
  cal: calendar_v3.Calendar,
  calendarId: string,
  query: string,
  options?: {
    timeMin?: string
    timeMax?: string
    maxResults?: number
  },
): Promise<CalendarEvent[]> {
  const response = await cal.events.list({
    calendarId,
    q: query,
    timeMin: options?.timeMin,
    timeMax: options?.timeMax,
    maxResults: options?.maxResults || 10,
    singleEvents: true,
    orderBy: "startTime",
  })

  return (response.data.items || []).map(item => mapEvent(item, calendarId))
}

// ============================================================
// Availability
// ============================================================

export async function checkAvailability(
  cal: calendar_v3.Calendar,
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<FreeBusy> {
  const response = await cal.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: calendarIds.map(id => ({ id })),
    },
  })

  return {
    calendars: Object.entries(response.data.calendars || {}).map(([calId, data]) => ({
      calendarId: calId,
      busy: (data.busy || []).map(slot => ({
        start: slot.start || "",
        end: slot.end || "",
      })),
      errors: (data.errors || []).map(err => ({
        reason: err.reason || "",
        domain: err.domain || "",
      })),
    })),
  }
}

// ============================================================
// Write operations (called only from REST API after user confirms)
// ============================================================

export async function createEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  eventData: {
    summary: string
    description?: string
    start: { dateTime: string; timeZone?: string }
    end: { dateTime: string; timeZone?: string }
    location?: string
    attendees?: Array<{ email: string; optional?: boolean }>
    recurrence?: string[]
    transparency?: "opaque" | "transparent"
  },
): Promise<CalendarEvent> {
  const response = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: eventData.summary,
      description: eventData.description,
      start: { dateTime: eventData.start.dateTime, timeZone: eventData.start.timeZone },
      end: { dateTime: eventData.end.dateTime, timeZone: eventData.end.timeZone },
      location: eventData.location,
      attendees: eventData.attendees?.map(att => ({ email: att.email, optional: att.optional })),
      recurrence: eventData.recurrence,
      transparency: eventData.transparency,
    },
  })

  return mapEvent(response.data, calendarId)
}

export async function updateEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  eventData: Partial<{
    summary: string
    description: string
    start: { dateTime: string; timeZone?: string }
    end: { dateTime: string; timeZone?: string }
    location: string
    attendees: Array<{ email: string; optional?: boolean }>
  }>,
): Promise<CalendarEvent> {
  const requestBody: calendar_v3.Schema$Event = {}
  if (eventData.summary !== undefined) requestBody.summary = eventData.summary
  if (eventData.description !== undefined) requestBody.description = eventData.description
  if (eventData.start) requestBody.start = { dateTime: eventData.start.dateTime, timeZone: eventData.start.timeZone }
  if (eventData.end) requestBody.end = { dateTime: eventData.end.dateTime, timeZone: eventData.end.timeZone }
  if (eventData.location !== undefined) requestBody.location = eventData.location
  if (eventData.attendees) {
    requestBody.attendees = eventData.attendees.map(att => ({ email: att.email, optional: att.optional }))
  }

  const response = await cal.events.update({
    calendarId,
    eventId,
    requestBody,
  })

  return mapEvent(response.data, calendarId)
}

export async function deleteEvent(cal: calendar_v3.Calendar, calendarId: string, eventId: string): Promise<void> {
  await cal.events.delete({ calendarId, eventId })
}
