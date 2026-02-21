import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { handleBody, isHandleBodyError } from "@/lib/api/server"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { addFeedbackEntry } from "@/lib/feedback"
import { generateRequestId } from "@/lib/utils"

/**
 * POST /api/feedback
 * Submit user feedback (no authentication required for simplicity)
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  try {
    const parsed = await handleBody("feedback", req)
    if (isHandleBodyError(parsed)) {
      addCorsHeaders(parsed, origin)
      return parsed
    }

    const { feedback, email, workspace, conversationId, userAgent } = parsed

    // Add feedback entry to storage
    const entry = await addFeedbackEntry({
      feedback,
      email,
      workspace: workspace || "unknown",
      conversationId,
      userAgent: userAgent || req.headers.get("user-agent") || undefined,
    })

    console.log(`[Feedback] New feedback received from workspace: ${entry.workspace} (ID: ${entry.id})`)

    return createCorsSuccessResponse(origin, {
      id: entry.id,
      timestamp: entry.timestamp,
    })
  } catch (error) {
    console.error("[Feedback] Error saving feedback:", error)
    Sentry.captureException(error)

    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
      requestId,
      details: { exception: error instanceof Error ? error.message : "Unknown error" },
    })
  }
}

/**
 * OPTIONS /api/feedback
 * CORS preflight
 */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin")
  const res = new NextResponse(null, { status: 204 })
  addCorsHeaders(res, origin)
  return res
}
