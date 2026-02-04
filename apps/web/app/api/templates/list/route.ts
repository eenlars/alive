/**
 * Super Templates List API
 * Returns available Alive Super Templates from filesystem frontmatter
 */

import { listTemplates } from "@webalive/tools"
import { NextResponse } from "next/server"
import { createErrorResponse } from "@/features/auth/lib/auth"
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
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
      exception: error instanceof Error ? error.message : String(error),
    })
  }
}
