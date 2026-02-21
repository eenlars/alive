import { appendFileSync, mkdirSync } from "node:fs"
import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, requireSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { tabKey } from "@/features/auth/lib/sessionStore"
import { normalizeWorktreeSlug, WORKTREE_SLUG_REGEX } from "@/features/workspace/lib/worktree-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { cancelStream, cancelStreamByConversationKey } from "@/lib/stream/cancellation-registry"

/**
 * Cancel Stream Endpoint
 *
 * Allows explicit cancellation of active streams via separate HTTP request.
 * This is the production-safe way to handle cancellation when proxy layers
 * (Cloudflare, Caddy) prevent req.signal from working correctly.
 *
 * Flow:
 * 1. Client sends POST with requestId (primary) OR tabId + workspace (fallback)
 * 2. Verify user owns the stream (security)
 * 3. Trigger cancellation via registry
 * 4. Stream breaks immediately, releases lock, cleans up child process
 *
 * Fallback (super-early Stop):
 * When user clicks Stop before receiving X-Request-Id header, client sends
 * tabId instead. We build tabKey and search registry by that.
 *
 * Security:
 * - Requires authenticated session
 * - User can only cancel their own streams
 */

// Debug logging to file for cancel investigation
const CANCEL_DEBUG_LOG = "/var/log/alive/cancel-debug.log"
let cancelDebugLogFileEnabled = true

interface CancelDebugEntry {
  timestamp: string
  source: "sendBeacon" | "fetch" | "unknown"
  userId: string
  requestId?: string
  tabId?: string
  tabGroupId?: string
  workspace?: string
  worktree?: string
  userAgent?: string
  referer?: string
  contentType?: string
  origin?: string
  clientStack?: string
  result: "cancelled" | "already_complete" | "error" | "unauthorized"
  errorMessage?: string
}

function logCancelDebug(entry: CancelDebugEntry): void {
  if (!cancelDebugLogFileEnabled) {
    return
  }

  try {
    // Ensure log directory exists
    mkdirSync("/var/log/alive", { recursive: true })

    const logLine = `${JSON.stringify(entry)}\n`
    appendFileSync(CANCEL_DEBUG_LOG, logLine)
  } catch (err) {
    // Don't let logging failures break the endpoint
    cancelDebugLogFileEnabled = false
    console.error("[Cancel Debug] Failed to write to log file, disabling file logging for this process:", err)
    Sentry.captureException(err)
  }
}

function detectCancelSource(req: NextRequest): "sendBeacon" | "fetch" | "unknown" {
  // sendBeacon typically sends with these characteristics:
  // - Content-Type: application/json (from Blob)
  // - No custom headers (sendBeacon can't set headers)
  // - Sec-Fetch-Mode: no-cors (in some browsers)
  //
  // fetch typically has:
  // - Content-Type: application/json
  // - Can include custom headers
  // - Sec-Fetch-Mode: cors

  const secFetchMode = req.headers.get("sec-fetch-mode")
  const _secFetchDest = req.headers.get("sec-fetch-dest")

  // sendBeacon in some browsers sets sec-fetch-mode to "no-cors"
  if (secFetchMode === "no-cors") {
    return "sendBeacon"
  }

  // If we have sec-fetch-mode: cors, it's likely a regular fetch
  if (secFetchMode === "cors") {
    return "fetch"
  }

  // Check for presence of headers that sendBeacon can't set
  // (this is a heuristic, not 100% reliable)
  const hasCustomHeaders = req.headers.has("x-custom-header")
  if (hasCustomHeaders) {
    return "fetch"
  }

  return "unknown"
}

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString()
  console.log("[Cancel Stream] ===== CANCEL ENDPOINT HIT =====")

  // Capture request metadata for debugging
  const source = detectCancelSource(req)
  const userAgent = req.headers.get("user-agent") ?? undefined
  const referer = req.headers.get("referer") ?? undefined
  const contentType = req.headers.get("content-type") ?? undefined
  const origin = req.headers.get("origin") ?? undefined
  const secFetchMode = req.headers.get("sec-fetch-mode")
  const _secFetchDest = req.headers.get("sec-fetch-dest")

  console.log(`[Cancel Stream] Source detection: ${source}`)
  console.log(`[Cancel Stream] Headers: sec-fetch-mode=${secFetchMode}, sec-fetch-dest=${_secFetchDest}`)
  console.log(`[Cancel Stream] Referer: ${referer}`)
  console.log(`[Cancel Stream] User-Agent: ${userAgent?.substring(0, 100)}`)

  try {
    // Get authenticated user
    const user = await requireSessionUser()
    console.log("[Cancel Stream] User authenticated:", user.id)

    // Parse request body
    let body: Record<string, unknown>
    try {
      const parsedBody = await req.json()
      if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
        return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
          message: "Request body must be a JSON object",
        })
      }
      body = parsedBody
    } catch (_err) {
      // Expected: malformed JSON body
      return createErrorResponse(ErrorCodes.INVALID_JSON, 400)
    }

    const requestId = typeof body.requestId === "string" ? body.requestId : undefined
    const tabId = typeof body.tabId === "string" ? body.tabId : undefined
    const tabGroupId = typeof body.tabGroupId === "string" ? body.tabGroupId : undefined
    const clientStack = typeof body.clientStack === "string" ? body.clientStack : undefined
    const workspace = typeof body.workspace === "string" ? body.workspace : undefined

    // Validate and normalize worktree to prevent session key corruption
    // A malformed worktree containing "::" would break parseKey() in sessionStore
    let worktree: string | undefined = typeof body.worktree === "string" ? body.worktree : undefined
    if (worktree) {
      worktree = normalizeWorktreeSlug(worktree)
      if (!WORKTREE_SLUG_REGEX.test(worktree) || ["user", "worktrees", ".", ".."].includes(worktree)) {
        console.warn(`[Cancel Stream] Invalid worktree slug rejected: ${body.worktree}`)
        return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
          message: "Invalid worktree slug. Use lowercase letters, numbers, and hyphens (max 49 chars).",
        })
      }
    }

    console.log("[Cancel Stream] Request body:", JSON.stringify({ requestId, tabId, tabGroupId, workspace, worktree }))

    // Log if client sent a stack trace (for debugging where cancel originated)
    if (clientStack) {
      console.log("[Cancel Stream] Client stack trace:", clientStack)
    }

    // Base debug entry (will be updated with result)
    const debugEntry: CancelDebugEntry = {
      timestamp,
      source,
      userId: user.id,
      requestId,
      tabId,
      tabGroupId,
      workspace,
      worktree,
      userAgent,
      referer,
      contentType,
      origin,
      clientStack,
      result: "error", // Default, will be overwritten
    }

    // Validate: must have either requestId OR (tabId + workspace)
    if (requestId) {
      // Primary path: Cancel by requestId
      console.log(`[Cancel Stream] User ${user.id} cancelling request: ${requestId}`)

      try {
        // Await cancel - Promise resolves when cleanup is complete (lock released)
        const cancelled = await cancelStream(requestId, user.id)

        if (cancelled) {
          console.log(`[Cancel Stream] Successfully cancelled and cleanup complete: ${requestId}`)
          debugEntry.result = "cancelled"
          logCancelDebug(debugEntry)
          return NextResponse.json({ ok: true, status: "cancelled", requestId })
        } else {
          // Not found - likely already completed
          console.log(`[Cancel Stream] Request not found (already complete): ${requestId}`)
          debugEntry.result = "already_complete"
          logCancelDebug(debugEntry)
          return NextResponse.json({ ok: true, status: "already_complete", requestId })
        }
      } catch (error) {
        // Authorization error (trying to cancel another user's stream)
        if (error instanceof Error && error.message.includes("Unauthorized")) {
          console.warn(`[Cancel Stream] Unauthorized attempt by ${user.id} for request: ${requestId}`)
          debugEntry.result = "unauthorized"
          debugEntry.errorMessage = error.message
          logCancelDebug(debugEntry)
          return createErrorResponse(ErrorCodes.FORBIDDEN, 403)
        }

        throw error
      }
    } else if (tabId) {
      // Fallback path: Cancel by tabId (super-early Stop case)

      // tabGroupId is required to build the correct lock key
      if (!tabGroupId) {
        console.warn("[Cancel Stream] Missing tabGroupId for tabId fallback cancel")
        return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
          message: "tabGroupId is required when cancelling by tabId",
        })
      }

      // Security: Verify workspace authorization before using it
      const verifiedWorkspace = await verifyWorkspaceAccess(user, body, "[Cancel Stream]")
      if (!verifiedWorkspace) {
        console.warn(`[Cancel Stream] User ${user.id} not authenticated for workspace`)
        return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401)
      }

      const tabKeyValue = tabKey({
        userId: user.id,
        workspace: verifiedWorkspace,
        worktree,
        tabGroupId,
        tabId,
      })
      console.log(
        `[Cancel Stream] Building tabKey with: userId=${user.id}, workspace=${verifiedWorkspace}, tabGroupId=${tabGroupId}, tabId=${tabId}`,
      )
      console.log(`[Cancel Stream] Result tabKey: ${tabKeyValue}`)
      console.log(`[Cancel Stream] User ${user.id} cancelling by tabKey (super-early Stop): ${tabKeyValue}`)

      try {
        // Await cancel - Promise resolves when cleanup is complete (lock released)
        // Note: cancelStreamByConversationKey name is legacy - it now searches by tabKey
        const cancelled = await cancelStreamByConversationKey(tabKeyValue, user.id)

        if (cancelled) {
          console.log(`[Cancel Stream] Successfully cancelled by tabKey and cleanup complete: ${tabKeyValue}`)
          debugEntry.result = "cancelled"
          logCancelDebug(debugEntry)
          return NextResponse.json({ ok: true, status: "cancelled", tabId })
        } else {
          // Not found - likely already completed or never started
          console.log(`[Cancel Stream] Tab not found (already complete): ${tabKeyValue}`)
          debugEntry.result = "already_complete"
          logCancelDebug(debugEntry)
          return NextResponse.json({ ok: true, status: "already_complete", tabId })
        }
      } catch (error) {
        // Authorization error (trying to cancel another user's stream)
        if (error instanceof Error && error.message.includes("Unauthorized")) {
          console.warn(`[Cancel Stream] Unauthorized attempt by ${user.id} for tab: ${tabKeyValue}`)
          debugEntry.result = "unauthorized"
          debugEntry.errorMessage = error.message
          logCancelDebug(debugEntry)
          return createErrorResponse(ErrorCodes.FORBIDDEN, 403)
        }

        throw error
      }
    } else {
      // Invalid request - missing required parameters
      logCancelDebug({
        timestamp,
        source,
        userId: user.id,
        userAgent,
        referer,
        contentType,
        origin,
        result: "error",
        errorMessage: "Missing requestId or tabId",
      })
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        message: "Either requestId or tabId is required",
      })
    }
  } catch (error) {
    console.error("[Cancel Stream] Error processing cancellation:", error)
    Sentry.captureException(error)
    // Log even if we don't have a user (auth failure case)
    logCancelDebug({
      timestamp,
      source,
      userId: "unknown",
      userAgent,
      referer,
      contentType,
      origin,
      result: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    })
    return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
      message: "Failed to process cancellation request",
      details: { error: error instanceof Error ? error.message : "Unknown error" },
    })
  }
}
