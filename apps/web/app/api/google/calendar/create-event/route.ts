/**
 * Google Calendar Create Event API
 *
 * Creates an event in Google Calendar when user clicks Create button.
 * Uses stored OAuth token from user's Google Calendar connection.
 */

import { calendar_v3, auth as gauth } from "@googleapis/calendar"
import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { getOAuthInstance } from "@/lib/oauth/oauth-instances"

// Validation schema for event creation
const CreateEventRequestSchema = z.object({
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
  calendarId: z.string().default("primary"),
  transparency: z.enum(["opaque", "transparent"]).optional(),
  recurrence: z.array(z.string()).optional(),
})

type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>

interface CreateEventResponse {
  ok: true
  eventId: string
  calendarId: string
  htmlLink: string
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    // 2. Parse and validate request body
    const bodyData = await req.json()
    let body: CreateEventRequest
    try {
      body = CreateEventRequestSchema.parse(bodyData)
    } catch (error) {
      const message = error instanceof z.ZodError ? error.issues[0].message : "Invalid request body"
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, { reason: message })
    }

    // 3. Validate start < end
    const startTime = new Date(body.start.dateTime).getTime()
    const endTime = new Date(body.end.dateTime).getTime()
    if (startTime >= endTime) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        reason: "Event start time must be before end time",
      })
    }

    // 4. Get Google Calendar OAuth token
    const oauthManager = getOAuthInstance("google")
    let accessToken: string
    try {
      accessToken = await oauthManager.getAccessToken(user.id, "google")
    } catch (error) {
      console.error("[Calendar Create] Failed to get OAuth token:", error)
      Sentry.captureException(error)
      return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 403, {
        reason: "Google Calendar not connected. Please connect in Settings.",
      })
    }

    // 5. Create Calendar client
    const oauth2Client = new gauth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const calendar = new calendar_v3.Calendar({ auth: oauth2Client })

    // 6. Create event
    const response = await calendar.events.insert({
      calendarId: body.calendarId,
      requestBody: {
        summary: body.summary,
        description: body.description,
        start: {
          dateTime: body.start.dateTime,
          timeZone: body.start.timeZone,
        },
        end: {
          dateTime: body.end.dateTime,
          timeZone: body.end.timeZone,
        },
        location: body.location,
        attendees: body.attendees?.map(att => ({
          email: att.email,
          optional: att.optional || false,
        })),
        recurrence: body.recurrence,
        transparency: body.transparency,
      },
    })

    if (!response.data.id) {
      return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, {
        reason: "Google Calendar API did not return event ID",
      })
    }

    console.log(`[Calendar Create] Event created by user ${user.id}, ID: ${response.data.id}`)

    const result: CreateEventResponse = {
      ok: true,
      eventId: response.data.id,
      calendarId: body.calendarId,
      htmlLink: response.data.htmlLink || "",
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Calendar Create] Error:", error)
    Sentry.captureException(error)
    const message = error instanceof Error ? error.message : "Failed to create event"
    return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, { reason: message })
  }
}
