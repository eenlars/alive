/**
 * Google Calendar Update Event API
 *
 * Updates an existing event in Google Calendar when user clicks Update button.
 * Uses stored OAuth token from user's Google Calendar connection.
 */

import { calendar_v3, auth as gauth } from "@googleapis/calendar"
import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { getOAuthInstance } from "@/lib/oauth/oauth-instances"

// Validation schema for event update
const UpdateEventRequestSchema = z.object({
  calendarId: z.string().min(1, "Calendar ID required"),
  eventId: z.string().min(1, "Event ID required"),
  summary: z.string().min(1, "Event title is required").optional(),
  description: z.string().optional(),
  start: z
    .object({
      dateTime: z.string().datetime("Start must be ISO 8601 datetime"),
      timeZone: z.string().optional(),
    })
    .optional(),
  end: z
    .object({
      dateTime: z.string().datetime("End must be ISO 8601 datetime"),
      timeZone: z.string().optional(),
    })
    .optional(),
  location: z.string().optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().email("Invalid attendee email"),
        optional: z.boolean().optional(),
      }),
    )
    .optional(),
  transparency: z.enum(["opaque", "transparent"]).optional(),
})

type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>

interface UpdateEventResponse {
  ok: true
  eventId: string
  calendarId: string
  htmlLink: string
}

export async function PATCH(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    // 2. Parse and validate request body
    const bodyData = await req.json()
    let body: UpdateEventRequest
    try {
      body = UpdateEventRequestSchema.parse(bodyData)
    } catch (error) {
      const message = error instanceof z.ZodError ? error.issues[0].message : "Invalid request body"
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, { reason: message })
    }

    // 3. Validate start < end if both provided
    if (body.start?.dateTime && body.end?.dateTime) {
      const startTime = new Date(body.start.dateTime).getTime()
      const endTime = new Date(body.end.dateTime).getTime()
      if (startTime >= endTime) {
        return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
          reason: "Event start time must be before end time",
        })
      }
    }

    // 4. Get Google Calendar OAuth token
    const oauthManager = getOAuthInstance("google")
    let accessToken: string
    try {
      accessToken = await oauthManager.getAccessToken(user.id, "google")
    } catch (error) {
      console.error("[Calendar Update] Failed to get OAuth token:", error)
      Sentry.captureException(error)
      return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 403, {
        reason: "Google Calendar not connected. Please connect in Settings.",
      })
    }

    // 5. Create Calendar client
    const oauth2Client = new gauth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const calendar = new calendar_v3.Calendar({ auth: oauth2Client })

    // 6. Fetch current event (to preserve fields not being updated)
    const currentEvent = await calendar.events.get({
      calendarId: body.calendarId,
      eventId: body.eventId,
    })

    // 7. Build update object (only include fields provided in request)
    const updateData: calendar_v3.Schema$Event = {
      summary: body.summary ?? currentEvent.data.summary,
      description: body.description ?? currentEvent.data.description,
      start: body.start || currentEvent.data.start,
      end: body.end || currentEvent.data.end,
      location: body.location ?? currentEvent.data.location,
      attendees:
        body.attendees?.map(att => ({
          email: att.email,
          optional: att.optional || false,
        })) ?? currentEvent.data.attendees,
      transparency: body.transparency ?? currentEvent.data.transparency,
    }

    // 8. Update event
    const response = await calendar.events.update({
      calendarId: body.calendarId,
      eventId: body.eventId,
      requestBody: updateData,
    })

    if (!response.data.id) {
      return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, {
        reason: "Google Calendar API did not return event ID",
      })
    }

    console.log(`[Calendar Update] Event updated by user ${user.id}, ID: ${response.data.id}`)

    const result: UpdateEventResponse = {
      ok: true,
      eventId: response.data.id,
      calendarId: body.calendarId,
      htmlLink: response.data.htmlLink || "",
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Calendar Update] Error:", error)
    Sentry.captureException(error)
    const message = error instanceof Error ? error.message : "Failed to update event"
    return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, { reason: message })
  }
}
