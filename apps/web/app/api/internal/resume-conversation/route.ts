/**
 * Internal API: Resume Conversation
 *
 * Called by the pg-boss resume-conversation worker to inject a message
 * into an existing Claude conversation session.
 *
 * This effectively acts as an "automated Enter press" — it sends a message
 * to an existing session, causing Claude to continue the conversation.
 *
 * AUTH EXCEPTION: This endpoint uses X-Internal-Auth (shared secret) instead of
 * session cookies because it's called by the pg-boss worker process, not a browser.
 * It is NOT reachable externally — only via localhost from the same server process.
 */

import { NextResponse } from "next/server"
import { sessionStore, tabKey } from "@/features/auth/lib/sessionStore"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"

export async function POST(req: Request) {
  // Authenticate internal call (shared secret, not session cookies — see docstring)
  const internalSecret = process.env.INTERNAL_TOOLS_SECRET
  const providedSecret = req.headers.get("x-internal-auth")

  if (!internalSecret || providedSecret !== internalSecret) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  try {
    const body = await req.json()
    const { userId, workspace, tabId, tabGroupId, message, reason } = body as Record<string, string>

    if (!userId || !workspace || !tabId || !tabGroupId || !message) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        field: "userId, workspace, tabId, tabGroupId, message",
      })
    }

    // Compute canonical session key from components (don't trust raw sessionKey from body)
    const sessionKey = tabKey({ userId, workspace, tabGroupId, tabId })

    // Verify the session still exists
    const sdkSessionId = await sessionStore.get(sessionKey)
    if (!sdkSessionId) {
      console.warn(`[Internal/ResumeConversation] Session not found: ${sessionKey}`)
      return createErrorResponse(ErrorCodes.NO_SESSION, 404)
    }

    console.log(`[Internal/ResumeConversation] Resuming session ${sessionKey} (reason: ${reason})`)

    // Forward to the stream endpoint internally.
    // We call localhost to reuse ALL the existing stream logic
    // (session lookup, locking, worker pool, credits, OAuth, etc.)
    const port = process.env.PORT || "9000"
    const streamUrl = `http://localhost:${port}/api/claude/stream`

    // Build the message with context about the resumption
    const resumeMessage = `[Scheduled resumption: ${reason}]\n\n${message}`

    const streamResponse = await fetch(streamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass internal auth - the stream route will need to handle this
        "X-Internal-Auth": internalSecret,
        // Pass user context for session resolution
        "X-Internal-User-Id": userId,
      },
      body: JSON.stringify({
        message: resumeMessage,
        workspace,
        tabId,
        tabGroupId,
        conversationId: `resume-${Date.now()}`,
        // Flag this as a scheduled resumption
        isScheduledResumption: true,
      }),
      signal: AbortSignal.timeout(600_000), // 10 min max
    })

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text().catch(() => "Unknown error")
      console.error(
        `[Internal/ResumeConversation] Stream failed: ${streamResponse.status} - ${errorText.substring(0, 500)}`,
      )
      return createErrorResponse(ErrorCodes.STREAM_ERROR, streamResponse.status)
    }

    // Consume the stream to let it complete
    // We don't need to process the output — the stream route handles
    // session storage and SSE broadcasting
    const reader = streamResponse.body?.getReader()
    if (reader) {
      try {
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      } finally {
        reader.releaseLock()
      }
    }

    console.log(`[Internal/ResumeConversation] Session ${sessionKey} resumed successfully`)

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400)
    }
    console.error("[Internal/ResumeConversation] Error:", error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }
}
