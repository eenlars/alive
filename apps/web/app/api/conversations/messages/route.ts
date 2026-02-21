/**
 * Messages API
 *
 * GET: Fetch messages for a specific tab (lazy loading)
 */

import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { createRLSAppClient } from "@/lib/supabase/server-rls"

// =============================================================================
// GET /api/conversations/messages?tabId=xxx&cursor=xxx&limit=xxx
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const tabId = searchParams.get("tabId")
    const cursor = searchParams.get("cursor") // ISO timestamp for pagination
    const limit = parseInt(searchParams.get("limit") || "100", 10)

    if (!tabId) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, { status: 400, details: { field: "tabId" } })
    }

    const supabase = await createRLSAppClient()

    // First verify the user has access to this tab
    const { data: tab, error: tabError } = await supabase
      .from("conversation_tabs")
      .select(`
        tab_id,
        conversations!inner (conversation_id)
      `)
      .eq("tab_id", tabId)
      .single()

    if (tabError || !tab) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404 })
    }

    // Access check is enforced by RLS through the join above.
    // If no row is visible, the request is treated as not found.

    // Fetch messages
    let query = supabase
      .from("messages")
      .select("*")
      .eq("tab_id", tabId)
      .order("seq", { ascending: true })
      .limit(limit + 1) // Fetch one extra to check if there are more

    if (cursor) {
      query = query.gt("created_at", cursor)
    }

    const { data: messages, error: msgError } = await query

    if (msgError) {
      console.error("[messages] Failed to fetch messages:", msgError)
      Sentry.captureException(msgError)
      return structuredErrorResponse(ErrorCodes.QUERY_FAILED, { status: 500 })
    }

    // Check if there are more messages
    const hasMore = messages.length > limit
    const resultMessages = hasMore ? messages.slice(0, limit) : messages

    // Transform to client format
    const transformed = resultMessages.map(m => ({
      id: m.message_id,
      tabId: m.tab_id,
      type: m.type,
      content: m.content,
      version: m.version,
      status: m.status,
      seq: m.seq,
      abortedAt: m.aborted_at ? new Date(m.aborted_at).getTime() : null,
      errorCode: m.error_code,
      createdAt: new Date(m.created_at).getTime(),
      updatedAt: new Date(m.updated_at).getTime(),
    }))

    return NextResponse.json({
      messages: transformed,
      hasMore,
      nextCursor: hasMore ? resultMessages[resultMessages.length - 1].created_at : null,
    })
  } catch (error) {
    console.error("[messages] Unexpected error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
