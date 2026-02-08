/**
 * Scheduled Tasks API
 *
 * Endpoints for creating, listing, updating, and deleting scheduled tasks.
 * Used by scheduled_* tools.
 */

import { createJob, listJobs, type ScheduledJobCreate, type ScheduledJobListParams } from "@webalive/tools"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { getOrgIdForUser } from "@/lib/deployment/org-resolver"
import { ErrorCodes } from "@/lib/error-codes"

/**
 * GET /api/scheduled - List scheduled tasks
 *
 * Query params:
 * - workspace: Filter by workspace domain
 * - enabled: Filter by enabled status
 * - limit: Max results (default 50)
 * - offset: Pagination offset
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const params: ScheduledJobListParams = {
      workspace: searchParams.get("workspace") || undefined,
      enabled: searchParams.has("enabled") ? searchParams.get("enabled") === "true" : undefined,
      limit: Math.min(parseInt(searchParams.get("limit") || "50", 10), 100),
      offset: parseInt(searchParams.get("offset") || "0", 10),
    }

    const result = await listJobs(user.id, params)

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[Scheduled API] GET error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}

/**
 * POST /api/scheduled - Create a scheduled task
 *
 * Body: ScheduledJobCreate
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const body = (await req.json()) as ScheduledJobCreate

    // Validate required fields
    if (!body.name || !body.schedule || !body.payload) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: "name, schedule, payload" },
      })
    }

    if (!body.workspace) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: "workspace" },
      })
    }

    // Get user's org ID
    const orgId = await getOrgIdForUser(user.id)
    if (!orgId) {
      return structuredErrorResponse(ErrorCodes.ORG_NOT_FOUND, { status: 400 })
    }

    const job = await createJob(user.id, orgId, body)

    return NextResponse.json({ ok: true, job }, { status: 201 })
  } catch (error) {
    console.error("[Scheduled API] POST error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
