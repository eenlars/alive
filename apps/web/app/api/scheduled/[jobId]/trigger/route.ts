/**
 * Trigger Scheduled Task API
 *
 * Manually trigger a scheduled task to run immediately.
 */

import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { structuredErrorResponse } from "@/lib/api/responses"
import { getJob, triggerJob } from "@webalive/tools"

interface RouteContext {
  params: Promise<{ jobId: string }>
}

/**
 * POST /api/scheduled/[jobId]/trigger - Manually trigger a task
 */
export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { jobId } = await context.params
    const existing = await getJob(jobId)

    if (!existing) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404, details: { resource: "job" } })
    }

    // Verify ownership
    if (existing.userId !== user.id) {
      return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, { status: 403 })
    }

    const result = await triggerJob(jobId)

    if (!result) {
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    return NextResponse.json({
      ok: result.success,
      durationMs: result.durationMs,
      error: result.error,
      response: result.response,
    })
  } catch (error) {
    console.error("[Scheduled API] Trigger error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
