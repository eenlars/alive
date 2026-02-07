/**
 * Trigger Automation API
 *
 * Manually trigger an automation job to run immediately.
 * This bypasses the schedule and runs the job now.
 */

import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { getSupabaseCredentials } from "@/lib/env/server"
import { ErrorCodes } from "@/lib/error-codes"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/automations/[id]/trigger - Manually trigger an automation
 */
export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { id } = await context.params
    const { url, key } = getSupabaseCredentials("service")
    const supabase = createClient(url, key, { db: { schema: "app" } })

    // Get the job with site info
    const { data: job, error: jobError } = await supabase
      .from("automation_jobs")
      .select("*, domains:site_id (hostname, port)")
      .eq("id", id)
      .single()

    if (jobError || !job) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404, details: { resource: "automation" } })
    }

    // Verify ownership
    if (job.user_id !== user.id) {
      return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, { status: 403 })
    }

    // Check if already running
    if (job.running_at) {
      return structuredErrorResponse(ErrorCodes.AUTOMATION_ALREADY_RUNNING, {
        status: 409,
        details: { startedAt: job.running_at },
      })
    }

    const hostname = (job.domains as any)?.hostname
    if (!hostname) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404, details: { resource: "site" } })
    }

    // Pre-execution validation
    const { validateActionPrompt, validateWorkspace } = await import("@/lib/automation/validation")

    // Validate that job has a prompt
    const promptCheck = validateActionPrompt(job.action_type, job.action_prompt)
    if (!promptCheck.valid) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { message: promptCheck.error },
      })
    }

    // Validate workspace exists
    const wsCheck = await validateWorkspace(hostname)
    if (!wsCheck.valid) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { message: wsCheck.error },
      })
    }

    console.log(`[Automation Trigger] Enqueuing job "${job.name}" for site ${hostname}`)

    // Enqueue via pg-boss for immediate execution
    const { enqueueAutomation } = await import("@webalive/job-queue")
    const pgBossJobId = await enqueueAutomation({
      jobId: job.id,
      userId: job.user_id,
      orgId: job.org_id,
      workspace: hostname,
      prompt: job.action_prompt,
      timeoutSeconds: job.action_timeout_seconds || 300,
      model: job.action_model || undefined,
      thinkingPrompt: job.action_thinking || undefined,
      skills: job.skills || undefined,
    })

    return NextResponse.json({
      ok: true,
      queued: true,
      pgBossJobId,
      message: `Automation "${job.name}" has been queued for immediate execution.`,
    })
  } catch (error) {
    console.error("[Automation Trigger] Error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
