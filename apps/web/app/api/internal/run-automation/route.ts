/**
 * Internal API: Run Automation
 *
 * Called by the pg-boss run-automation worker to execute an automation job.
 * Delegates to the existing executor.ts which handles OAuth, credits, worker pool, etc.
 *
 * AUTH EXCEPTION: This endpoint uses X-Internal-Auth (shared secret) instead of
 * session cookies because it's called by the pg-boss worker process, not a browser.
 * It is NOT reachable externally — only via localhost from the same server process.
 */

import { NextResponse } from "next/server"
import { runAutomationJob } from "@/lib/automation/executor"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"

export async function POST(req: Request) {
  // Authenticate internal call
  const internalSecret = process.env.INTERNAL_TOOLS_SECRET
  const providedSecret = req.headers.get("x-internal-auth")

  if (!internalSecret || providedSecret !== internalSecret) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  try {
    const body = await req.json()

    const { jobId, userId, orgId, workspace, prompt, timeoutSeconds, model, thinkingPrompt, skills } = body

    if (!jobId || !userId || !orgId || !workspace || !prompt) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        field: "jobId, userId, orgId, workspace, prompt",
      })
    }

    const result = await runAutomationJob({
      jobId,
      userId,
      orgId,
      workspace,
      prompt,
      timeoutSeconds: timeoutSeconds || 300,
      model,
      thinkingPrompt,
      skills,
    })

    return NextResponse.json({
      ok: result.success,
      durationMs: result.durationMs,
      error: result.error,
      response: result.response?.substring(0, 5000), // Limit response size
    })
  } catch (error) {
    console.error("[Internal/RunAutomation] Error:", error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }
}
