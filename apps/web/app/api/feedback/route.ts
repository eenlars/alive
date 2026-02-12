import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { addFeedbackEntry } from "@/lib/feedback"
import { generateRequestId } from "@/lib/utils"

/**
 * Zod schema for feedback submission
 */
const FeedbackSchema = z.object({
  feedback: z.string().min(1).max(5000),
  email: z.string().email().optional(),
  workspace: z.string().optional(),
  conversationId: z.string().uuid().optional(),
  userAgent: z.string().optional(),
})

/**
 * POST /api/feedback
 * Submit user feedback (no authentication required for simplicity)
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  try {
    // Parse request body
    const body = await req.json().catch(() => ({}))
    const result = FeedbackSchema.safeParse(body)

    if (!result.success) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        details: { issues: result.error.issues },
      })
    }

    const { feedback, email, workspace, conversationId, userAgent } = result.data

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
