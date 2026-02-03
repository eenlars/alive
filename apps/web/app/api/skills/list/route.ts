/**
 * Skills List API
 * Returns available skills from filesystem (SKILL.md files)
 */

import { listGlobalSkills } from "@alive-brug/tools"
import { NextResponse } from "next/server"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"

/**
 * GET - Get all available global skills
 * Public endpoint - no authentication required
 * Skills are read from /etc/claude-code/skills/ and cached via Next.js
 */
export async function GET() {
  try {
    const skills = await listGlobalSkills()

    return NextResponse.json(
      { skills },
      {
        headers: {
          // Cache for 5 minutes, revalidate in background
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    )
  } catch (error) {
    console.error("[Skills List API] Error:", error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
      exception: error instanceof Error ? error.message : String(error),
    })
  }
}
