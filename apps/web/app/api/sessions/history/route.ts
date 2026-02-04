/**
 * Sessions History API
 *
 * GET /api/sessions/history?sessionKey=...&limit=50&includeTools=false
 *
 * Fetches conversation history from a session.
 * Used by sessions_history tool.
 */

import type { SessionMessage } from "@webalive/tools"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { structuredErrorResponse } from "@/lib/api/responses"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const userId = user.id

    const { searchParams } = new URL(req.url)
    const sessionKey = searchParams.get("sessionKey")
    const _limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100)
    const _includeTools = searchParams.get("includeTools") === "true"
    const _after = searchParams.get("after")

    if (!sessionKey) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: "sessionKey" },
      })
    }

    // Parse session key
    const parts = sessionKey.split("::")
    if (parts.length !== 4) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: "sessionKey", reason: "Invalid session key format" },
      })
    }

    const [targetUserId, targetWorkspace, _tabGroupId, targetTabId] = parts

    // For now, only allow reading own sessions
    // TODO: Implement A2A policy for cross-user access
    if (targetUserId !== userId) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, {
        status: 403,
        details: { reason: "Cross-user session history not yet implemented" },
      })
    }

    // Get domain ID
    const app = await createAppClient("service")
    const { data: domain } = await app.from("domains").select("domain_id").eq("hostname", targetWorkspace).single()

    if (!domain) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { workspace: targetWorkspace },
      })
    }

    // Get session
    const iam = await createIamClient("service")
    const { data: session } = await iam
      .from("sessions")
      .select("sdk_session_id")
      .eq("user_id", targetUserId)
      .eq("domain_id", domain.domain_id)
      .eq("tab_id", targetTabId)
      .single()

    if (!session) {
      return NextResponse.json({
        sessionKey,
        messages: [],
        count: 0,
      })
    }

    // TODO: Fetch actual messages from Claude SDK session
    // The Claude SDK stores conversation history in its session.
    // We would need to:
    // 1. Load the session using Anthropic SDK
    // 2. Get the messages from the session
    // 3. Filter by includeTools and after params
    //
    // For now, return empty - actual implementation requires SDK integration

    const messages: SessionMessage[] = []

    return NextResponse.json({
      sessionKey,
      messages,
      count: messages.length,
      note: "Session history retrieval is in development. SDK integration pending.",
    })
  } catch (err) {
    console.error("[Sessions History API] Error:", err)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
