/**
 * Automation Runs API
 *
 * List all runs for a specific automation job.
 */

import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { createRLSAppClient } from "@/lib/supabase/server-rls"

interface RouteContext {
  params: Promise<{ id: string }>
}

/** Subset returned by ownership-check queries (user_id exists in DB but not yet in generated types) */
interface JobOwnershipRow {
  user_id: string
  name?: string
}

/**
 * GET /api/automations/[id]/runs - List all runs for an automation
 *
 * Query params:
 * - limit: Number of runs to return (default: 20, max: 100)
 * - offset: Number of runs to skip (default: 0)
 * - status: Filter by status (success, failure, pending, running, skipped)
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { id: jobId } = await context.params
    const supabase = await createRLSAppClient()

    // Verify job ownership first
    const { data: job } = await supabase.from("automation_jobs").select("user_id, name").eq("id", jobId).single()

    if (!job) {
      return structuredErrorResponse(ErrorCodes.AUTOMATION_JOB_NOT_FOUND, {
        status: 404,
      })
    }

    const jobRow = job as unknown as JobOwnershipRow

    if (jobRow.user_id !== user.id) {
      return structuredErrorResponse(ErrorCodes.FORBIDDEN, { status: 403 })
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 100)
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0)
    const statusFilter = searchParams.get("status")
    const validStatuses = ["pending", "running", "success", "failure", "skipped"] as const
    type RunStatus = (typeof validStatuses)[number]

    // Build query
    let query = supabase
      .from("automation_runs")
      .select("id, job_id, started_at, completed_at, duration_ms, status, error, triggered_by, changes_made, result")
      .eq("job_id", jobId)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (statusFilter && validStatuses.includes(statusFilter as RunStatus)) {
      query = query.eq("status", statusFilter as RunStatus)
    }

    const { data: runs, error, count } = await query

    if (error) {
      console.error("[Automations API] List runs error:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    return NextResponse.json({
      runs: runs ?? [],
      job: {
        id: jobId,
        name: jobRow.name,
      },
      pagination: {
        limit,
        offset,
        total: count ?? runs?.length ?? 0,
      },
    })
  } catch (error) {
    console.error("[Automations API] GET runs error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
