/**
 * Sessions API - Agent-to-Agent Communication
 *
 * Endpoints for listing, querying, and managing chat sessions.
 * Used by A2A tools (sessions_list, sessions_send, sessions_history).
 */

import * as Sentry from "@sentry/nextjs"
import type { SessionInfo } from "@webalive/tools"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { isConversationLocked, type TabSessionKey } from "@/features/auth/types/session"
import { structuredErrorResponse } from "@/lib/api/responses"
import { handleBody, isHandleBodyError } from "@/lib/api/server"
import { ErrorCodes } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"
import { createRLSAppClient } from "@/lib/supabase/server-rls"

/**
 * GET /api/sessions - List sessions
 *
 * Query params:
 * - workspace: Filter by workspace domain
 * - activeMinutes: Only sessions active in last N minutes
 * - limit: Max sessions to return (default 50)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const userId = user.id

    const { searchParams } = new URL(req.url)
    const workspace = searchParams.get("workspace")
    const activeMinutes = searchParams.get("activeMinutes")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100)

    // Build query
    const iam = await createIamClient("service")
    let query = iam
      .from("sessions")
      .select("user_id, domain_id, tab_id, sdk_session_id, last_activity, expires_at")
      .order("last_activity", { ascending: false })
      .limit(limit)

    // Filter by user (for now, only own sessions - A2A policy checked in tool)
    query = query.eq("user_id", userId)

    // Filter by active time
    if (activeMinutes) {
      const cutoff = new Date(Date.now() - parseInt(activeMinutes, 10) * 60 * 1000)
      query = query.gte("last_activity", cutoff.toISOString())
    }

    const { data: sessions, error } = await query

    if (error) {
      console.error("[Sessions API] Query error:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.QUERY_FAILED, { status: 500 })
    }

    // Get domain hostnames for sessions
    const domainIds = [...new Set(sessions?.map(s => s.domain_id) || [])]

    let domainMap = new Map<string, string>()
    if (domainIds.length > 0) {
      const app = await createRLSAppClient()
      const { data: domains } = await app.from("domains").select("domain_id, hostname").in("domain_id", domainIds)

      if (domains) {
        domainMap = new Map(domains.map(d => [d.domain_id, d.hostname]))
      }
    }

    // Filter by workspace if specified
    let filteredSessions = sessions || []
    filteredSessions = filteredSessions.filter(s => domainMap.has(s.domain_id))
    if (workspace) {
      const targetDomainId = [...domainMap.entries()].find(([_, hostname]) => hostname === workspace)?.[0]
      if (targetDomainId) {
        filteredSessions = filteredSessions.filter(s => s.domain_id === targetDomainId)
      } else {
        filteredSessions = []
      }
    }

    // Transform to SessionInfo format
    const result: SessionInfo[] = filteredSessions.map(session => {
      const workspaceHostname = domainMap.get(session.domain_id) || "unknown"
      // Reconstruct session key format: userId::workspace::tabGroupId::tabId
      // Note: tabGroupId not stored in DB, use placeholder
      const sessionKey = `${session.user_id}::${workspaceHostname}::default::${session.tab_id}`

      return {
        sessionKey,
        sdkSessionId: session.sdk_session_id,
        workspace: workspaceHostname,
        userId: session.user_id,
        tabId: session.tab_id,
        lastActivity: session.last_activity,
        expiresAt: session.expires_at,
        isActive: isConversationLocked(sessionKey as TabSessionKey),
      }
    })

    return NextResponse.json({
      count: result.length,
      sessions: result,
    })
  } catch (err) {
    console.error("[Sessions API] Error:", err)
    Sentry.captureException(err)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}

/**
 * POST /api/sessions/send - Send message to another session
 *
 * Body:
 * - targetSessionKey: Session to send to
 * - message: Message content
 * - timeoutSeconds: How long to wait for response (0 = async)
 * - waitForReply: Whether to wait for response
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const userId = user.id

    const parsed = await handleBody("sessions/send", req)
    if (isHandleBodyError(parsed)) return parsed

    const { targetSessionKey, message } = parsed

    // Parse target session key
    const parts = targetSessionKey.split("::")
    if (parts.length !== 4) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: "targetSessionKey", reason: "Invalid session key format" },
      })
    }

    const [targetUserId, targetWorkspace, _tabGroupId, targetTabId] = parts

    // For now, only allow sending to own sessions
    // TODO: Implement A2A policy for cross-user messaging
    if (targetUserId !== userId) {
      return structuredErrorResponse(ErrorCodes.FORBIDDEN, {
        status: 403,
        details: { reason: "Cross-user session messaging not yet implemented" },
      })
    }

    // Check if target session exists
    const iam = await createIamClient("service")
    const app = await createRLSAppClient()

    // Get domain ID
    const { data: domain } = await app.from("domains").select("domain_id").eq("hostname", targetWorkspace).single()

    if (!domain) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { workspace: targetWorkspace },
      })
    }

    // Get target session
    const { data: session } = await iam
      .from("sessions")
      .select("sdk_session_id")
      .eq("user_id", targetUserId)
      .eq("domain_id", domain.domain_id)
      .eq("tab_id", targetTabId)
      .single()

    if (!session) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { resource: "Target session not found" },
      })
    }

    // Check if session is currently active (locked)
    const isActive = isConversationLocked(targetSessionKey as TabSessionKey)

    if (isActive) {
      // Session is busy - queue the message or return busy status
      // For now, return busy - TODO: implement message queue
      return NextResponse.json({
        ok: false,
        status: "busy",
        runId: crypto.randomUUID(),
        sessionKey: targetSessionKey,
        message: "Target session is currently processing. Try again later.",
      })
    }

    // TODO: Actually trigger an agent run in the target session
    // This requires:
    // 1. Calling the Claude SDK with the message
    // 2. Using the target session's SDK session ID for context
    // 3. Waiting for response if requested
    //
    // For now, return a placeholder response
    const runId = crypto.randomUUID()
    console.info(`[Sessions API] Message queued: runId=${runId} target=${targetSessionKey} length=${message.length}`)

    return NextResponse.json({
      status: "accepted",
      runId,
      sessionKey: targetSessionKey,
      message: "Session messaging is in development. Message acknowledged but not yet delivered.",
    })
  } catch (err) {
    console.error("[Sessions API] Send error:", err)
    Sentry.captureException(err)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
