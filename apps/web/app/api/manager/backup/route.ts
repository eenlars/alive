import * as Sentry from "@sentry/nextjs"
import { backupWebsites } from "@webalive/site-controller/dist/backup"
import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { getRequestId } from "@/lib/request-id"

/**
 * POST /api/manager/backup
 *
 * Backup websites to GitHub (eenlars/all_websites)
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    console.log("[Manager] Starting website backup to GitHub")
    const stats = await backupWebsites()

    console.log("[Manager] Website backup completed successfully")

    return createCorsSuccessResponse(origin, {
      stats,
      message: "Websites backed up to GitHub successfully",
      requestId,
    })
  } catch (error) {
    console.error("[Manager] Website backup failed:", error)
    Sentry.captureException(error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
