/**
 * Scheduled Task by ID API
 *
 * Endpoints for getting, updating, and deleting a specific scheduled task.
 */

import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { structuredErrorResponse } from "@/lib/api/responses"
import { getJob, updateJob, deleteJob, type ScheduledJobUpdate } from "@alive-brug/tools"

interface RouteContext {
  params: Promise<{ jobId: string }>
}

/**
 * GET /api/scheduled/[jobId] - Get a scheduled task
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { jobId } = await context.params
    const job = await getJob(jobId)

    if (!job) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404, details: { resource: "job" } })
    }

    // Verify ownership
    if (job.userId !== user.id) {
      return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, { status: 403 })
    }

    return NextResponse.json({ ok: true, job })
  } catch (error) {
    console.error("[Scheduled API] GET by ID error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}

/**
 * PATCH /api/scheduled/[jobId] - Update a scheduled task
 *
 * Body: ScheduledJobUpdate
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
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

    const body = (await req.json()) as ScheduledJobUpdate
    const updated = await updateJob(jobId, body)

    if (!updated) {
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    return NextResponse.json({ ok: true, job: updated })
  } catch (error) {
    console.error("[Scheduled API] PATCH error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}

/**
 * DELETE /api/scheduled/[jobId] - Delete a scheduled task
 */
export async function DELETE(_req: NextRequest, context: RouteContext) {
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

    const deleted = await deleteJob(jobId)

    if (!deleted) {
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[Scheduled API] DELETE error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
