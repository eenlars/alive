/**
 * Skills List API
 * Returns superadmin skills from the repo's .claude/skills/ directory.
 * Superadmin-only endpoint.
 */

import * as Sentry from "@sentry/nextjs"
import { PATHS } from "@webalive/shared"
import { listSuperadminSkills } from "@webalive/tools"
import { NextResponse } from "next/server"
import { structuredErrorResponse } from "@/lib/api/responses"
import { protectedRoute } from "@/features/auth/lib/protectedRoute"
import { ErrorCodes } from "@/lib/error-codes"

export const GET = protectedRoute(
  async () => {
    try {
      const skills = await listSuperadminSkills(PATHS.ALIVE_ROOT)

      return NextResponse.json(
        { skills },
        {
          headers: {
            "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
          },
        },
      )
    } catch (error) {
      console.error("[Skills List API] Error:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }
  },
  { requireSuperadmin: true },
)
