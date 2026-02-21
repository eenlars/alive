/**
 * Scheduled Task by ID API
 *
 * Endpoints for getting, updating, and deleting a specific scheduled task.
 */

import * as Sentry from "@sentry/nextjs"
import { deleteJob, getJob, updateJob } from "@webalive/tools"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { handleBody, isHandleBodyError } from "@/lib/api/server"
import { ErrorCodes } from "@/lib/error-codes"

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
      return structuredErrorResponse(ErrorCodes.SCHEDULED_JOB_NOT_FOUND, { status: 404 })
    }

    // Verify ownership
    if (job.userId !== user.id) {
      return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, { status: 403 })
    }

    return NextResponse.json({ ok: true, job })
  } catch (error) {
    console.error("[Scheduled API] GET by ID error:", error)
    Sentry.captureException(error)
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
      return structuredErrorResponse(ErrorCodes.SCHEDULED_JOB_NOT_FOUND, { status: 404 })
    }

    // Verify ownership
    if (existing.userId !== user.id) {
      return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, { status: 403 })
    }

    const parsed = await handleBody("scheduled/update", req)
    if (isHandleBodyError(parsed)) return parsed

    const { name, description, schedule, payload, enabled, deleteAfterRun } = parsed
    const updated = await updateJob(jobId, { name, description, schedule, payload, enabled, deleteAfterRun })

    if (!updated) {
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    return NextResponse.json({ ok: true, job: updated })
  } catch (error) {
    console.error("[Scheduled API] PATCH error:", error)
    Sentry.captureException(error)
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
      return structuredErrorResponse(ErrorCodes.SCHEDULED_JOB_NOT_FOUND, { status: 404 })
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
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
