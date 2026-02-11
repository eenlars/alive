/**
 * Automation Run Details API
 *
 * Get details for a specific automation run, including the full conversation log.
 */

import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { createServiceAppClient } from "@/lib/supabase/service"

interface RouteContext {
  params: Promise<{ id: string; runId: string }>
}

/**
 * GET /api/automations/[id]/runs/[runId] - Get a specific run with full conversation log
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { id: jobId, runId } = await context.params
    const supabase = createServiceAppClient()

    // Verify job ownership first
    const { data: job } = await supabase.from("automation_jobs").select("user_id").eq("id", jobId).single()

    if (!job) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { message: "Automation job not found" },
      })
    }

    if ((job as any).user_id !== user.id) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 403 })
    }

    // Get the run record
    const { data: run, error } = await supabase
      .from("automation_runs")
      .select("*")
      .eq("id", runId)
      .eq("job_id", jobId)
      .single()

    if (error || !run) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { message: "Run not found" },
      })
    }

    return NextResponse.json({
      run: {
        id: run.id,
        job_id: run.job_id,
        started_at: run.started_at,
        completed_at: run.completed_at,
        duration_ms: run.duration_ms,
        status: run.status,
        error: run.error,
        result: run.result,
        triggered_by: run.triggered_by,
        changes_made: run.changes_made,
        // Full conversation log
        messages: run.messages ?? [],
      },
    })
  } catch (error) {
    console.error("[Automations API] GET run error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
