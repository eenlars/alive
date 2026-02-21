/**
 * Google Calendar Delete Event API
 *
 * Deletes an event from Google Calendar when user confirms deletion.
 * Uses stored OAuth token from user's Google Calendar connection.
 */

import { calendar_v3, auth as gauth } from "@googleapis/calendar"
import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { getOAuthInstance } from "@/lib/oauth/oauth-instances"

// Validation schema for event deletion
const DeleteEventRequestSchema = z.object({
  calendarId: z.string().min(1, "Calendar ID required"),
  eventId: z.string().min(1, "Event ID required"),
})

type DeleteEventRequest = z.infer<typeof DeleteEventRequestSchema>

interface DeleteEventResponse {
  ok: true
  eventId: string
  calendarId: string
}

export async function DELETE(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    // 2. Parse and validate request body or URL params
    let body: DeleteEventRequest
    try {
      const bodyData = await req.json()
      body = DeleteEventRequestSchema.parse(bodyData)
    } catch (error) {
      // Try to get from URL search params as fallback
      const url = new URL(req.url)
      const calendarId = url.searchParams.get("calendarId")
      const eventId = url.searchParams.get("eventId")

      if (!calendarId || !eventId) {
        const message = error instanceof z.ZodError ? error.issues[0].message : "Invalid request body"
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, { status: 400, details: { reason: message } })
      }

      body = { calendarId, eventId }
    }

    // 3. Get Google Calendar OAuth token
    const oauthManager = getOAuthInstance("google")
    let accessToken: string
    try {
      accessToken = await oauthManager.getAccessToken(user.id, "google")
    } catch (error) {
      console.error("[Calendar Delete] Failed to get OAuth token:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTEGRATION_ERROR, {
        status: 403,
        details: { reason: "Google Calendar not connected. Please connect in Settings." },
      })
    }

    // 4. Create Calendar client
    const oauth2Client = new gauth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const calendar = new calendar_v3.Calendar({ auth: oauth2Client })

    // 5. Delete event
    await calendar.events.delete({
      calendarId: body.calendarId,
      eventId: body.eventId,
    })

    console.log(`[Calendar Delete] Event deleted by user ${user.id}, eventId: ${body.eventId}`)

    const result: DeleteEventResponse = {
      ok: true,
      eventId: body.eventId,
      calendarId: body.calendarId,
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Calendar Delete] Error:", error)
    Sentry.captureException(error)
    const message = error instanceof Error ? error.message : "Failed to delete event"
    return structuredErrorResponse(ErrorCodes.INTEGRATION_ERROR, { status: 500, details: { reason: message } })
  }
}
