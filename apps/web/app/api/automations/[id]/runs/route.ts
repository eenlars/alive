/**
 * Automation Runs API
 *
 * List all runs for a specific automation job.
 */

import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { createServiceAppClient } from "@/lib/supabase/service"

interface RouteContext {
  params: Promise<{ id: string }>
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
    const supabase = createServiceAppClient()

    // Verify job ownership first
    const { data: job } = await supabase.from("automation_jobs").select("user_id, name").eq("id", jobId).single()

    if (!job) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { message: "Automation job not found" },
      })
    }

    if ((job as any).user_id !== user.id) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 403 })
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 100)
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0)
    const status = searchParams.get("status")

    // Build query
    let query = supabase
      .from("automation_runs")
      .select("id, job_id, started_at, completed_at, duration_ms, status, error, triggered_by, changes_made")
      .eq("job_id", jobId)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1)

    const VALID_STATUSES = ["pending", "running", "success", "failure", "skipped"] as const
    type RunStatus = (typeof VALID_STATUSES)[number]

    if (status) {
      if (!VALID_STATUSES.includes(status as RunStatus)) {
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
          status: 400,
          details: { message: `Invalid status filter: "${status}". Allowed: ${VALID_STATUSES.join(", ")}` },
        })
      }
      query = query.eq("status", status as RunStatus)
    }

    const { data: runs, error, count } = await query

    if (error) {
      console.error("[Automations API] List runs error:", error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    return NextResponse.json({
      runs: runs ?? [],
      job: {
        id: jobId,
        name: (job as any).name,
      },
      pagination: {
        limit,
        offset,
        total: count ?? runs?.length ?? 0,
      },
    })
  } catch (error) {
    console.error("[Automations API] GET runs error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
