/**
 * Error Logging API
 *
 * POST /api/logs/error - Submit an error from frontend
 * GET /api/logs/error - Query recent errors (admin only)
 *
 * This provides a centralized place to capture and diagnose errors
 * from both frontend JavaScript and backend API routes.
 */

import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { errorLogger } from "@/lib/error-logger"

/**
 * POST /api/logs/error
 *
 * Submit an error from the frontend
 *
 * Body: {
 *   category: string,      // 'oauth', 'api', 'ui', etc.
 *   message: string,       // Human-readable error message
 *   details?: object,      // Structured error details
 *   stack?: string,        // Stack trace if available
 *   url?: string,          // Page URL where error occurred
 * }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody: unknown = await req.json()
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return structuredErrorResponse(ErrorCodes.VALIDATION_ERROR, {
        status: 400,
        details: { reason: "body must be a JSON object" },
      })
    }

    const body = rawBody as {
      category?: unknown
      message?: unknown
      details?: unknown
      stack?: unknown
      url?: unknown
    }

    // Validate required fields
    if (!body.category || typeof body.category !== "string") {
      return structuredErrorResponse(ErrorCodes.VALIDATION_ERROR, {
        status: 400,
        details: { reason: "category is required and must be a string" },
      })
    }

    if (!body.message || typeof body.message !== "string") {
      return structuredErrorResponse(ErrorCodes.VALIDATION_ERROR, {
        status: 400,
        details: { reason: "message is required and must be a string" },
      })
    }

    // Get user info if available (but don't require auth for error logging)
    let userId: string | undefined
    try {
      const user = await getSessionUser()
      userId = user?.id
    } catch (_err) {
      // Anonymous error logging is OK
    }

    // Capture the error
    const entry = errorLogger.capture({
      category: body.category,
      source: "frontend",
      message: body.message,
      details: typeof body.details === "object" && body.details !== null ? (body.details as Record<string, unknown>) : undefined,
      stack: typeof body.stack === "string" ? body.stack : undefined,
      url: typeof body.url === "string" ? body.url : undefined,
      userId,
      userAgent: req.headers.get("user-agent") || undefined,
    })

    return NextResponse.json({ ok: true, id: entry.id })
  } catch (error) {
    console.error("[ErrorLog API] Failed to log error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}

/**
 * GET /api/logs/error
 *
 * Query recent errors (superadmin only)
 *
 * Query params:
 *   category?: string      // Filter by category
 *   source?: string        // 'frontend' or 'backend'
 *   limit?: number         // Max results (default 50)
 *   since?: string         // ISO timestamp
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Require superadmin access
    const user = await getSessionUser()
    if (!user || !user.isSuperadmin) {
      return structuredErrorResponse(ErrorCodes.FORBIDDEN, { status: 403 })
    }

    const { searchParams } = new URL(req.url)

    const options: Parameters<typeof errorLogger.query>[0] = {}

    const category = searchParams.get("category")
    if (category) options.category = category

    const source = searchParams.get("source")
    if (source === "frontend" || source === "backend") {
      options.source = source
    }

    const limit = searchParams.get("limit")
    options.limit = limit ? Math.min(parseInt(limit, 10), 200) : 50

    const since = searchParams.get("since")
    if (since) {
      const sinceDate = new Date(since)
      if (!isNaN(sinceDate.getTime())) {
        options.since = sinceDate
      }
    }

    const errors = errorLogger.query(options)
    const stats = errorLogger.stats()

    return NextResponse.json({
      errors,
      stats,
      total: errors.length,
    })
  } catch (error) {
    console.error("[ErrorLog API] Failed to query errors:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
