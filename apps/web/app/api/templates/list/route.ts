/**
 * Super Templates List API
 * Returns available Alive Super Templates from filesystem frontmatter
 */

import * as Sentry from "@sentry/nextjs"
import { listTemplates } from "@webalive/tools"
import { NextResponse } from "next/server"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"

/**
 * GET - Get all available Super Templates
 * Public endpoint - no authentication required
 * Templates are read from filesystem and cached via Next.js
 */
export async function GET() {
  try {
    const templates = await listTemplates()

    return NextResponse.json(
      { templates },
      {
        headers: {
          // Cache for 5 minutes, revalidate in background
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    )
  } catch (error) {
    console.error("[Templates List API] Error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: {
        exception: error instanceof Error ? error.message : String(error),
      },
    })
  }
}
