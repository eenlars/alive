/**
 * Stream Reconnect Endpoint
 *
 * Allows clients to retrieve buffered messages after a disconnect.
 *
 * Use cases:
 * 1. User logs out and back in while a query is processing
 * 2. Network interruption during streaming
 * 3. Browser refresh during active conversation
 *
 * Flow:
 * 1. Client reconnects and calls this endpoint with tabId
 * 2. Server looks up any buffered output for that tab
 * 3. Returns unread messages and stream state
 * 4. Client can then resume normal operation or wait for completion
 */

import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createErrorResponse, requireSessionUser } from "@/features/auth/lib/auth"
import { tabKey } from "@/features/auth/lib/sessionStore"
import { hasSessionCookie } from "@/features/auth/types/guards"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { ErrorCodes } from "@/lib/error-codes"
import { deleteStreamBuffer, getUnreadMessages, hasActiveStream } from "@/lib/stream/stream-buffer"

export const runtime = "nodejs"

// Request body schema
const ReconnectSchema = z.object({
  tabGroupId: z.string().uuid(),
  tabId: z.string().uuid(),
  workspace: z.string().min(1),
  /** If true, deletes the buffer after returning messages (client confirms receipt) */
  acknowledge: z.boolean().optional(),
})

/**
 * POST /api/claude/stream/reconnect
 *
 * Check for and retrieve buffered stream output for a tab.
 *
 * Request body:
 * - tabId: string (UUID) - The tab to check
 * - workspace: string - The workspace domain
 * - acknowledge?: boolean - If true, deletes buffer after retrieval
 *
 * Response:
 * - hasStream: boolean - Whether there's buffered output
 * - state?: "streaming" | "complete" | "error" - Current stream state
 * - messages?: string[] - Unread messages (NDJSON lines)
 * - error?: string - Error message if state is "error"
 * - requestId?: string - Original request ID (for reference)
 */
export async function POST(req: Request) {
  try {
    const jar = await cookies()

    // Check session
    if (!hasSessionCookie(jar.get(COOKIE_NAMES.SESSION))) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 401)
    }

    const user = await requireSessionUser()

    // Parse and validate request body
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return createErrorResponse(ErrorCodes.INVALID_JSON, 400)
    }

    const parseResult = ReconnectSchema.safeParse(body)
    if (!parseResult.success) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        details: { issues: parseResult.error.issues },
      })
    }

    const { tabGroupId, tabId, workspace, acknowledge } = parseResult.data

    // Build tab key (same format as stream route)
    const tabKeyValue = tabKey({
      userId: user.id,
      workspace,
      tabGroupId,
      tabId,
    })

    // Check if there's an active stream for this tab
    const { hasStream, requestId } = await hasActiveStream(tabKeyValue)

    if (!hasStream || !requestId) {
      return NextResponse.json({
        ok: true,
        hasStream: false,
      })
    }

    // Get unread messages
    const result = await getUnreadMessages(requestId, user.id)

    if (!result) {
      // Buffer exists but couldn't read (might have expired between checks)
      return NextResponse.json({
        ok: true,
        hasStream: false,
      })
    }

    // If client acknowledges receipt and stream is complete, clean up buffer
    if (acknowledge && result.state === "complete") {
      await deleteStreamBuffer(requestId)
    }

    return NextResponse.json({
      ok: true,
      hasStream: true,
      state: result.state,
      messages: result.messages,
      error: result.error,
      requestId,
    })
  } catch (error) {
    console.error("[Reconnect] Error:", error)
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.REQUEST_PROCESSING_FAILED,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
