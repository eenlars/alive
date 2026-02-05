/**
 * Schedule Resumption API
 *
 * Called by the schedule_resumption MCP tool to enqueue a delayed
 * conversation resumption via pg-boss.
 *
 * Authentication: Session cookie via ALIVE_SESSION_COOKIE (same as other MCP tool API calls)
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { scheduleResumption } from "@webalive/job-queue"
import { tabKey, sessionStore } from "@/features/auth/lib/sessionStore"
import { createErrorResponse, isWorkspaceAuthenticated, requireSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"

const ScheduleResumptionSchema = z.object({
  workspaceRoot: z.string().min(1),
  delayMinutes: z.number().int().min(1).max(1440),
  reason: z.string().min(1).max(500),
  resumeMessage: z.string().max(2000).optional(),
  tabId: z.string().min(1),
  tabGroupId: z.string().min(1),
})

export async function POST(req: Request) {
  const requestId = crypto.randomUUID()

  try {
    const user = await requireSessionUser()

    const body = await req.json()
    const parseResult = ScheduleResumptionSchema.safeParse(body)
    if (!parseResult.success) {
      return createErrorResponse(ErrorCodes.VALIDATION_ERROR, 400, {
        requestId,
        details: parseResult.error.issues,
      })
    }

    const { workspaceRoot, delayMinutes, reason, resumeMessage, tabId, tabGroupId } = parseResult.data

    // Extract workspace domain from workspaceRoot
    // workspaceRoot is like "/srv/webalive/sites/example.alive.best/user/src"
    const workspaceMatch = workspaceRoot.match(/\/sites\/([^/]+)/)
    const workspace = workspaceMatch?.[1]

    if (!workspace) {
      return createErrorResponse(ErrorCodes.WORKSPACE_INVALID, 400, { requestId })
    }

    // Verify workspace access
    const hasAccess = await isWorkspaceAuthenticated(workspace)
    if (!hasAccess) {
      return createErrorResponse(ErrorCodes.FORBIDDEN, 403, { requestId })
    }

    // Build session key and verify session exists
    const sessionKey = tabKey({
      userId: user.id,
      workspace,
      tabGroupId,
      tabId,
    })

    const existingSession = await sessionStore.get(sessionKey)
    if (!existingSession) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 404, { requestId })
    }

    const now = new Date()
    const resumeAt = new Date(now.getTime() + delayMinutes * 60 * 1000)
    const message = resumeMessage || `Resuming conversation: ${reason}`

    const jobId = await scheduleResumption(
      {
        sessionKey,
        userId: user.id,
        workspace,
        tabId,
        tabGroupId,
        message,
        reason,
        scheduledAt: now.toISOString(),
      },
      delayMinutes * 60, // Convert to seconds for pg-boss
    )

    console.log(`[ScheduleResumption ${requestId}] Scheduled for ${workspace} in ${delayMinutes}min (jobId: ${jobId})`)

    return NextResponse.json({
      ok: true,
      message: `Scheduled resumption in ${delayMinutes} minute(s)`,
      scheduledAt: now.toISOString(),
      resumeAt: resumeAt.toISOString(),
      jobId,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401, { requestId })
    }
    console.error(`[ScheduleResumption ${requestId}] Error:`, error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}
