/**
 * Error Logging API
 *
 * POST /api/logs/error - Submit an error from frontend
 * GET /api/logs/error - Query recent errors (admin only)
 *
 * This provides a centralized place to capture and diagnose errors
 * from both frontend JavaScript and backend API routes.
 */

import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { errorLogger, type ErrorLogEntry } from "@/lib/error-logger"

// Superadmin email for querying errors
const SUPERADMIN_EMAIL = "eedenlars@gmail.com"

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
    const body = await req.json()

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
    } catch {
      // Anonymous error logging is OK
    }

    // Capture the error
    const entry = errorLogger.capture({
      category: body.category,
      source: "frontend",
      message: body.message,
      details: body.details,
      stack: body.stack,
      url: body.url,
      userId,
      userAgent: req.headers.get("user-agent") || undefined,
    })

    return NextResponse.json({ ok: true, id: entry.id })
  } catch (error) {
    console.error("[ErrorLog API] Failed to log error:", error)
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
    if (!user || user.email !== SUPERADMIN_EMAIL) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 403 })
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
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
