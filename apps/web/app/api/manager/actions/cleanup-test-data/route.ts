import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { cleanupTestDatabase } from "@/lib/test-helpers/cleanup-test-database"
import { generateRequestId } from "@/lib/utils"

/**
 * POST /api/manager/actions/cleanup-test-data
 *
 * Clean up test users, organizations, and domains from the database
 *
 * SAFETY: Only deletes users where is_test_env = true AND email matches test patterns
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { dryRun = true } = body

    console.log(`[Manager] Starting test data cleanup (dryRun: ${dryRun})`)

    const stats = await cleanupTestDatabase(dryRun)

    console.log(`[Manager] Test cleanup ${dryRun ? "preview" : "completed"}:`, stats)

    return createCorsSuccessResponse(origin, {
      dryRun,
      stats,
      message: dryRun ? "Preview complete - no data was deleted" : "Test data cleanup completed successfully",
      requestId,
    })
  } catch (error) {
    console.error("[Manager] Test cleanup failed:", error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
