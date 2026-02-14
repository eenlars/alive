import { statSync } from "node:fs"
import { DEFAULTS, filterToolsForPlanMode, SUPERADMIN, WORKER_POOL } from "@webalive/shared"
import { getWorkerPool, type WorkerToParentMessage } from "@webalive/worker-pool"
import { cookies, headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import {
  createErrorResponse,
  getSafeSessionCookie,
  requireSessionUser,
  verifyWorkspaceAccess,
} from "@/features/auth/lib/auth"
import {
  sessionStore,
  type TabSessionKey,
  tabKey,
  tryLockConversation,
  unlockConversation,
} from "@/features/auth/lib/sessionStore"
import { hasSessionCookie } from "@/features/auth/types/guards"
import { isInputSafe } from "@/features/chat/lib/formatMessage"
import { getSystemPrompt } from "@/features/chat/lib/systemPrompt"
import { ensureWorkspaceSchema } from "@/features/workspace/lib/ensure-workspace-schema"
import { resolveWorkspace } from "@/features/workspace/lib/workspace-utils"
import { getValidAccessToken, hasOAuthCredentials } from "@/lib/anthropic-oauth"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import {
  getAllowedTools,
  getDisallowedTools,
  getOAuthMcpServers,
  hasStripeMcpAccess,
  PERMISSION_MODE,
  SETTINGS_SOURCES,
  STREAM_TYPES,
} from "@/lib/claude/agent-constants.mjs"
import { addCorsHeaders } from "@/lib/cors-utils"
import { env } from "@/lib/env"
import { ErrorCodes } from "@/lib/error-codes"
import { buildAnalyzeImagePrompt, fetchAndSaveAnalyzeImages } from "@/lib/image-analyze/fetch-and-save"
import { logInput } from "@/lib/input-logger"
import { type ClaudeModel, DEFAULT_MODEL, isValidClaudeModel } from "@/lib/models/claude-models"
import { fetchOAuthTokens } from "@/lib/oauth/fetch-oauth-tokens"
import { fetchUserEnvKeys } from "@/lib/oauth/fetch-user-env-keys"
import { createRequestLogger } from "@/lib/request-logger"
import { registerCancellation, startTTLCleanup, unregisterCancellation } from "@/lib/stream/cancellation-registry"
import { type CancelState, createNDJSONStream } from "@/lib/stream/ndjson-stream-handler"
import {
  appendToStreamBuffer,
  completeStreamBuffer,
  createStreamBuffer,
  errorStreamBuffer,
} from "@/lib/stream/stream-buffer"
import { createAppClient } from "@/lib/supabase/app"
import { createRLSAppClient } from "@/lib/supabase/server-rls"
import type { TokenSource } from "@/lib/tokens"
import { getOrgCredits } from "@/lib/tokens"
import { generateRequestId } from "@/lib/utils"
import { runAgentChild } from "@/lib/workspace-execution/agent-child-runner"
import { detectServeMode } from "@/lib/workspace-execution/command-runner"
import { BodySchema } from "@/types/guards/api"

export const runtime = "nodejs"

// Start TTL cleanup on server start (once)
startTTLCleanup()

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const logger = createRequestLogger("Claude Stream", requestId)
  const startTime = Date.now()
  const timing = (label: string) => logger.log(`[TIMING] ${label}: +${Date.now() - startTime}ms`)

  logger.log("=== STREAM REQUEST START ===")
  timing("request_received")

  // Defense-in-depth: Block real API calls during E2E tests
  if (process.env.PLAYWRIGHT_TEST === "true") {
    logger.error("⛔ BLOCKED: Real API call attempted during E2E test")
    return createErrorResponse(ErrorCodes.TEST_MODE_BLOCK, 403, { requestId })
  }

  // Track lock acquisition for cleanup in error handler
  let lockAcquired = false
  let sessionKey: TabSessionKey | null = null // Tab session key: used for BOTH session persistence AND lock

  try {
    const jar = await cookies()
    logger.log("Checking session cookie...")

    if (!hasSessionCookie(jar.get(COOKIE_NAMES.SESSION))) {
      logger.log("No session cookie found")
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }
    logger.log("Session cookie verified")

    // Get user from session
    const user = await requireSessionUser()
    logger.log("User:", user.id)

    logger.log("Parsing request body...")
    let body: Record<string, unknown>
    try {
      body = await req.json()
      logger.log("Raw body keys:", Object.keys(body))
    } catch (jsonError) {
      logger.error("Failed to parse JSON body:", jsonError)
      return createErrorResponse(ErrorCodes.INVALID_JSON, 400, {
        details: { error: jsonError instanceof Error ? jsonError.message : "Unknown JSON parse error" },
        requestId,
      })
    }

    // Validate request body
    const parseResult = BodySchema.safeParse(body)
    if (!parseResult.success) {
      logger.error("Schema validation failed:", parseResult.error.issues)
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        details: { issues: parseResult.error.issues },
        requestId,
      })
    }

    const {
      message,
      workspace: requestWorkspace,
      worktree,
      conversationId,
      tabGroupId,
      tabId,
      apiKey: userApiKey,
      model: userModel,
      projectId,
      userId,
      additionalContext,
      analyzeImageUrls,
      planMode,
      resumeSessionAt,
    } = parseResult.data
    logger.log("Conversation:", conversationId)
    logger.log(
      `Message received (${message.length} chars): ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`,
    )
    if (userApiKey) {
      logger.log("User provided API key (validation already done in schema)")
    } else {
      logger.log("No user API key provided")
    }
    if (userModel) {
      logger.log("Using user-selected model:", userModel)
    }
    // Plan mode: see docs/architecture/plan-mode.md

    // Check input safety (skip for superadmins - they should never be interrupted)
    if (!user.isSuperadmin) {
      logger.log("Checking input safety...")
      const safetyCheck = await isInputSafe(message)
      if (safetyCheck === "unsafe") {
        logger.log("Input flagged as unsafe")
        return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
          message: "Your message contains inappropriate content. Please keep it professional and appropriate.",
          requestId,
        })
      }
      logger.log("Input safety check passed")
    } else {
      logger.log("Skipping input safety check (superadmin)")
    }

    const host = (await headers()).get("host") || "localhost"
    const origin = req.headers.get("origin")
    logger.log("Host:", host)

    let cwd: string
    let resolvedWorkspaceName: string | null
    let tokenSource: TokenSource
    const effectiveApiKey: string | undefined = userApiKey

    try {
      // Security: Verify workspace authorization BEFORE resolving paths
      resolvedWorkspaceName = await verifyWorkspaceAccess(user, body, `[Claude Stream ${requestId}]`)

      if (!resolvedWorkspaceName) {
        return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, { requestId })
      }
      logger.log("Workspace authentication verified for:", resolvedWorkspaceName)

      // Only after authorization, resolve workspace path
      const workspaceResult = await resolveWorkspace(host, { ...body, workspace: requestWorkspace }, requestId, origin)
      if (!workspaceResult.success) {
        return workspaceResult.response
      }
      cwd = workspaceResult.workspace

      // Ensure workspace has required directory structure (.alive/files, etc.)
      await ensureWorkspaceSchema(cwd)

      // Step 1: Get API key for authentication (user-provided OR OAuth)
      // Workers run as non-root and cannot read /root/.claude/.credentials.json,
      // so we MUST pass the API key via IPC.
      if (userApiKey) {
        logger.log("Using user-provided API key")
      } else if (hasOAuthCredentials()) {
        // OAuth: Auto-refresh expired tokens, then let SDK read credentials file
        // Workers have CLAUDE_CONFIG_DIR=/root/.claude and file has 644 permissions
        logger.log("Using OAuth credentials (SDK reads from CLAUDE_CONFIG_DIR)")
        try {
          const oauthResult = await getValidAccessToken()
          if (!oauthResult) {
            logger.log("OAuth credentials missing or unreadable")
            return createErrorResponse(ErrorCodes.OAUTH_EXPIRED, 502, {
              workspace: resolvedWorkspaceName,
              requestId,
            })
          }
          if (oauthResult.refreshed) {
            logger.log("OAuth token was expired and has been refreshed")
          }
        } catch (refreshError) {
          logger.error("OAuth token refresh failed:", refreshError)
          return createErrorResponse(ErrorCodes.OAUTH_EXPIRED, 502, {
            workspace: resolvedWorkspaceName,
            requestId,
          })
        }
        // effectiveApiKey stays undefined - worker will use OAuth
      } else {
        logger.log("No API key or OAuth credentials available")
        return createErrorResponse(ErrorCodes.INSUFFICIENT_TOKENS, 402, {
          workspace: resolvedWorkspaceName,
          requestId,
          message: "No API key available. Please provide an API key or run /login",
        })
      }

      // Step 2: Determine billing (workspace credits vs user-provided)
      const orgCredits = (await getOrgCredits(resolvedWorkspaceName)) ?? 0
      const COST_ESTIMATE = 1

      if (orgCredits >= COST_ESTIMATE) {
        tokenSource = "workspace"
        logger.log(`Billing: workspace credits (${orgCredits} available)`)
      } else if (userApiKey) {
        tokenSource = "user_provided"
        logger.log(`Billing: user-provided key (workspace has ${orgCredits} credits)`)
      } else {
        // Using OAuth - no credit deduction
        tokenSource = "user_provided"
        logger.log(`Billing: OAuth (no credit deduction, workspace has ${orgCredits} credits)`)
      }
    } catch (workspaceError) {
      logger.error("Workspace resolution failed:", workspaceError)
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_FOUND, 404, {
        host: requestWorkspace || host,
        details: {
          host,
          requestWorkspace,
          error: workspaceError instanceof Error ? workspaceError.message : "Unknown error",
        },
        requestId,
      })
    }

    logInput({
      timestamp: new Date().toISOString(),
      userId: user.id,
      tabId,
      conversationId,
      workspace: requestWorkspace ?? "default",
      cwd,
      messageLength: message.length,
      message,
      requestId,
    })

    // Verify domain exists in app.domains
    const app = user.isSuperadmin ? await createAppClient("service") : await createRLSAppClient()
    const { data: domainRecord } = await app
      .from("domains")
      .select("domain_id, hostname, port")
      .eq("hostname", resolvedWorkspaceName)
      .single()

    if (!domainRecord) {
      logger.error("Domain not found in database:", resolvedWorkspaceName)
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_FOUND, 404, {
        host: resolvedWorkspaceName,
        requestId,
      })
    }

    // Session key: each tab = one independent Claude session
    sessionKey = tabKey({
      userId: user.id,
      workspace: resolvedWorkspaceName,
      worktree,
      tabGroupId,
      tabId,
    })

    logger.log(`Domain: ${domainRecord.hostname} (port: ${domainRecord.port}, id: ${domainRecord.domain_id})`)
    logger.log("Session key:", sessionKey)
    logger.log("Attempting to lock...")

    if (!tryLockConversation(sessionKey)) {
      logger.log("❌ LOCK FAILED - Request already in progress for key:", sessionKey)
      return createErrorResponse(ErrorCodes.CONVERSATION_BUSY, 409, { requestId })
    }

    lockAcquired = true
    logger.log("✅ LOCK ACQUIRED for:", sessionKey)

    // === CANCELLATION SETUP - MUST BE IMMEDIATELY AFTER LOCK ===
    // CRITICAL: Register cancellation callback RIGHT AFTER lock acquisition.
    // There was a race condition where client could abort during async setup
    // (OAuth, session lookup, etc.) and cancel endpoint would find nothing,
    // leaving the lock held forever → 409 on next request.
    //
    // By registering immediately, cancel endpoint can always find and release the lock.
    const cancelState: CancelState = { requested: false, reader: null }
    const workerAbortController = new AbortController()
    let resolveCancelComplete: (() => void) | null = null

    registerCancellation(requestId, user.id, sessionKey, () => {
      logger.log("===== CANCEL CALLBACK INVOKED =====")
      logger.log("Cancel callback: lockKey =", sessionKey, "requestId =", requestId)

      // Return Promise that resolves when onStreamComplete is called
      // CRITICAL: Set resolveCancelComplete BEFORE triggering abort signals,
      // because reader.cancel() synchronously calls onStreamComplete() which
      // needs resolveCancelComplete to already be set!
      return new Promise<void>(resolve => {
        resolveCancelComplete = resolve

        // Now safe to trigger abort - onStreamComplete will find resolveCancelComplete
        cancelState.requested = true
        cancelState.reader?.cancel() // Interrupt blocked read - triggers onStreamComplete
        workerAbortController.abort() // Signal worker pool to cancel (500ms timeout)
        logger.log("Cancel callback: abort signals sent, waiting for cleanup to complete...")
      })
    })
    logger.log("Cancellation registered for requestId:", requestId)

    // Create stream buffer for reconnection support
    // Buffer persists to Redis so users can retrieve missed messages if they disconnect
    try {
      await createStreamBuffer(requestId, sessionKey, user.id, tabId)
      logger.log("Stream buffer created for reconnection support")
    } catch (bufferError) {
      // Non-fatal: continue without buffering if Redis unavailable
      logger.log("Stream buffer creation failed (non-fatal):", bufferError)
    }

    timing("before_session_lookup")
    logger.log(`[SESSION DEBUG] Looking up session for key: ${sessionKey}`)
    let existingSessionId: string | null
    try {
      existingSessionId = await sessionStore.get(sessionKey)
    } catch (sessionLookupError) {
      logger.error("[SESSION DEBUG] Session lookup failed:", sessionLookupError)
      throw new Error(
        `[SESSION LOOKUP FAILED] ${
          sessionLookupError instanceof Error ? sessionLookupError.message : String(sessionLookupError)
        }`,
      )
    }
    timing("after_session_lookup")
    logger.log(`[SESSION DEBUG] Existing session: ${existingSessionId ? `found (${existingSessionId})` : "none"}`)

    logger.log("Working directory:", cwd)

    // Force default model for credit users (cost management)
    // API key users can choose any model
    // Exception: Admins (set via ADMIN_EMAILS env var) can use any model
    // Exception: Users with specific enabled_models in their metadata
    const isUnrestrictedUser = user.isAdmin
    const hasModelAccess = (model: string) => isUnrestrictedUser || user.enabledModels.includes(model)

    // Determine model with proper type validation
    let effectiveModel: ClaudeModel
    if (tokenSource === "workspace" && !isUnrestrictedUser) {
      // Check if user has per-model access for their requested model
      const requestedModel = userModel || env.CLAUDE_MODEL
      if (isValidClaudeModel(requestedModel) && hasModelAccess(requestedModel)) {
        effectiveModel = requestedModel
      } else {
        // ENFORCED for org credits - always use default
        effectiveModel = DEFAULT_MODEL
      }
    } else {
      // User's choice with API key or unrestricted user
      const requestedModel = userModel || env.CLAUDE_MODEL
      effectiveModel = isValidClaudeModel(requestedModel) ? requestedModel : DEFAULT_MODEL
    }

    if (tokenSource === "workspace" && userModel && userModel !== DEFAULT_MODEL && !hasModelAccess(userModel)) {
      logger.log(`Model override: User requested ${userModel} but forcing ${DEFAULT_MODEL} for org credits`)
    }
    logger.log("Claude model:", effectiveModel)
    logger.log("User isAdmin:", user.isAdmin)
    logger.log("User isSuperadmin:", user.isSuperadmin)

    // Check if this is a superadmin accessing the Alive workspace
    const isSuperadminWorkspace = resolvedWorkspaceName === SUPERADMIN.WORKSPACE_NAME && user.isSuperadmin
    if (isSuperadminWorkspace) {
      logger.log("🔓 SUPERADMIN MODE: Alive workspace access granted")
    }

    // Admins (and superadmins who inherit admin) get 2x maxTurns
    const maxTurns = user.isAdmin ? DEFAULTS.CLAUDE_MAX_TURNS * 2 : DEFAULTS.CLAUDE_MAX_TURNS

    logger.log("Max turns limit:", maxTurns, user.isAdmin ? "(admin 2x)" : "")

    // Fetch OAuth tokens and user env keys in parallel for performance
    const [oauthResult, userEnvKeysResult] = await Promise.all([
      fetchOAuthTokens(user.id, logger),
      fetchUserEnvKeys(user.id, logger),
    ])

    const { tokens: oauthTokens, warnings: oauthWarnings } = oauthResult
    const { envKeys: userEnvKeys } = userEnvKeysResult
    const hasStripeConnection = !!oauthTokens.stripe
    const hasGmailConnection = !!oauthTokens.gmail

    // Log warnings for debugging
    if (oauthWarnings.length > 0) {
      logger.log(`OAuth warnings: ${oauthWarnings.map(w => w.provider).join(", ")}`)
    }

    // Detect if workspace is running in production mode (build) vs dev mode
    const serveMode = detectServeMode(cwd)
    const isProductionMode = serveMode === "build"
    logger.log(`Serve mode: ${serveMode} (isProduction: ${isProductionMode})`)

    // Handle analyze mode images: fetch from photobook and save to workspace
    // This allows Claude to use the Read tool to visually analyze the images
    let finalMessage = message
    if (analyzeImageUrls && analyzeImageUrls.length > 0) {
      logger.log(`Fetching ${analyzeImageUrls.length} analyze image(s)...`)
      timing("before_fetch_analyze_images")

      // Build base URL from request origin or host
      const protocol = req.headers.get("x-forwarded-proto") || "https"
      const baseUrl = origin || `${protocol}://${host}`

      const savedImages = await fetchAndSaveAnalyzeImages(analyzeImageUrls, cwd, baseUrl)
      timing("after_fetch_analyze_images")

      if (savedImages.length > 0) {
        logger.log(`Saved ${savedImages.length} image(s) for analysis`)
        finalMessage = buildAnalyzeImagePrompt(message, savedImages)
      } else {
        logger.log("No images were successfully fetched for analysis")
      }
    }

    const systemPrompt = getSystemPrompt({
      projectId,
      userId,
      workspaceFolder: cwd,
      hasStripeMcpAccess: hasStripeMcpAccess(resolvedWorkspaceName, hasStripeConnection),
      hasGmailAccess: hasGmailConnection,
      additionalContext,
      isProduction: isProductionMode,
    })

    logger.log("Spawning child process runner")

    // Get session cookie value to pass to child process for API authentication
    // Validates JWT format to prevent "jwt malformed" errors in MCP tools
    const sessionCookie = await getSafeSessionCookie(`[Claude Stream ${requestId}]`)

    let childStream: ReadableStream<Uint8Array>

    // Plan mode: Claude can only read/explore, not modify files
    // When enabled, permissionMode is set to 'plan' in the SDK
    const effectivePermissionMode = planMode ? "plan" : PERMISSION_MODE
    if (planMode) {
      logger.log("Plan mode enabled - Claude will only explore, not modify")
    }

    if (WORKER_POOL.ENABLED) {
      // === PERSISTENT WORKER POOL ===
      // Reuses workers between requests for faster response times
      logger.log("Using persistent worker pool")

      // Get workspace credentials from directory ownership
      // SUPERADMIN: Skip credentials - run as root (uid/gid = 0)
      let credentials: { uid: number; gid: number; cwd: string; workspaceKey: string }
      if (isSuperadminWorkspace) {
        logger.log("🔓 SUPERADMIN: Running as root (uid=0, gid=0)")
        credentials = {
          uid: 0,
          gid: 0,
          cwd,
          workspaceKey: resolvedWorkspaceName,
        }
      } else {
        const st = statSync(cwd)
        credentials = {
          uid: st.uid,
          gid: st.gid,
          cwd,
          workspaceKey: resolvedWorkspaceName,
        }
      }

      // Build agent config to pass to worker (worker doesn't import from apps/web)
      // Note: Internal MCP servers (alive-workspace, alive-tools) are created locally
      // in the worker because createSdkMcpServer returns function objects that cannot
      // be serialized via IPC. Only OAuth HTTP servers are passed here.
      const baseAllowedTools = getAllowedTools(cwd, user.isAdmin, isSuperadminWorkspace, isSuperadminWorkspace)
      const disallowedTools = getDisallowedTools(user.isAdmin, isSuperadminWorkspace)

      // Plan mode: filter blocked tools BEFORE sending to worker
      // See docs/architecture/plan-mode.md for why this must happen here
      const allowedTools = filterToolsForPlanMode(baseAllowedTools, !!planMode)

      // Log tool counts for debugging
      if (planMode) {
        logger.log(`Plan mode: ${allowedTools.length} tools (filtered from ${baseAllowedTools.length})`)
      }

      const agentConfig = {
        allowedTools,
        disallowedTools,
        permissionMode: effectivePermissionMode,
        settingSources: SETTINGS_SOURCES,
        oauthMcpServers: getOAuthMcpServers(oauthTokens) as Record<string, unknown>,
        streamTypes: STREAM_TYPES,
        isAdmin: user.isAdmin, // Pass to worker for permission checks
        isSuperadmin: isSuperadminWorkspace, // Superadmin has all tools, runs as root
      }

      const pool = getWorkerPool()
      timing("before_worker_pool_query")

      // Convert worker pool callback API to ReadableStream for compatibility with createNDJSONStream
      let firstMessageReceived = false
      childStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          // Helper to run query with given resume session and optional message position
          const runQuery = async (resumeId: string | undefined, resumeAtMessage: string | undefined) => {
            return pool.query(credentials, {
              requestId,
              ownerKey: user.id,
              workloadClass: "chat",
              payload: {
                message: finalMessage,
                model: effectiveModel,
                maxTurns: maxTurns,
                resume: resumeId,
                resumeSessionAt: resumeAtMessage,
                systemPrompt,
                apiKey: effectiveApiKey || undefined,
                oauthTokens,
                userEnvKeys, // User-defined environment keys for MCP servers
                agentConfig,
                sessionCookie, // Required for MCP tools to authenticate API calls
              },
              onMessage: (msg: WorkerToParentMessage) => {
                // Track first message timing
                if (!firstMessageReceived) {
                  firstMessageReceived = true
                  timing("first_message_from_worker")
                }
                // Convert worker message to NDJSON line
                if (msg.type === "message" && "content" in msg) {
                  const line = `${JSON.stringify(msg.content)}\n`
                  controller.enqueue(new TextEncoder().encode(line))
                } else if (msg.type === "complete" && "result" in msg) {
                  const line = `${JSON.stringify(msg.result)}\n`
                  controller.enqueue(new TextEncoder().encode(line))
                } else if (msg.type === "session" && "sessionId" in msg) {
                  // Session ID is handled internally by the NDJSON stream handler
                  // but we still need to emit it for session storage
                  logger.log(`[SESSION DEBUG] Received session from worker: ${msg.sessionId}`)
                  const sessionLine = `${JSON.stringify({
                    type: STREAM_TYPES.SESSION,
                    sessionId: msg.sessionId,
                  })}\n`
                  controller.enqueue(new TextEncoder().encode(sessionLine))
                  logger.log("[SESSION DEBUG] Enqueued stream_session line to childStream")
                }
              },
              signal: workerAbortController.signal,
            })
          }

          try {
            await runQuery(existingSessionId || undefined, resumeSessionAt || undefined)
            controller.close()
          } catch (err) {
            // Error recovery for stale session/message references
            // The error may come as "Claude Code process exited with code 1" with the actual
            // error message in stderr, so we check both
            const errorMessage = err instanceof Error ? err.message : String(err)
            const stderrMessage = (err as { stderr?: string })?.stderr || ""
            const combinedMessage = `${errorMessage} ${stderrMessage}`

            // NEW: Check for "message not found" error (stale resumeSessionAt)
            // This happens when the frontend sends a message ID that no longer exists in the session
            const isMessageNotFound = combinedMessage.includes("No message found with message.uuid of")

            if (isMessageNotFound && resumeSessionAt && existingSessionId && sessionKey) {
              logger.log(
                `[MESSAGE RECOVERY] Message "${resumeSessionAt}" not found in session "${existingSessionId}", retrying without resumeSessionAt...`,
              )
              try {
                // Retry with session but WITHOUT resumeSessionAt - start from session beginning
                await runQuery(existingSessionId, undefined)
                controller.close()
                return
              } catch (retryErr) {
                // If that also fails, check if it's a session not found error
                const retryErrorMessage = retryErr instanceof Error ? retryErr.message : String(retryErr)
                const retryStderrMessage = (retryErr as { stderr?: string })?.stderr || ""
                const retryCombined = `${retryErrorMessage} ${retryStderrMessage}`
                const isSessionNotFoundOnRetry =
                  retryCombined.includes("No conversation found") ||
                  (retryCombined.includes("session") && retryCombined.includes("not found"))

                if (isSessionNotFoundOnRetry) {
                  logger.log(
                    `[SESSION RECOVERY] Session "${existingSessionId}" also not found, clearing and starting fresh...`,
                  )
                  try {
                    try {
                      await sessionStore.delete(sessionKey)
                    } catch (deleteError) {
                      logger.error("[SESSION RECOVERY] Failed to clear stale session:", deleteError)
                      controller.error(deleteError)
                      return
                    }
                    await runQuery(undefined, undefined)
                    controller.close()
                    return
                  } catch (finalErr) {
                    logger.error("[SESSION RECOVERY] Final retry failed:", finalErr)
                    controller.error(finalErr)
                    return
                  }
                }

                logger.error("[MESSAGE RECOVERY] Retry without message failed:", retryErr)
                controller.error(retryErr)
                return
              }
            }

            // Check for "tool use concurrency issues" (corrupt session state — pending tool_use without tool_result)
            // Anthropic returns 400 when resuming a session with unresolved tool calls.
            // Don't auto-recover (would lose context). Instead clear the session and tell the
            // frontend so it can offer "continue in new tab" with conversation history.
            const isToolConcurrency = combinedMessage.includes("tool use concurrency")

            if (isToolConcurrency && existingSessionId && sessionKey) {
              logger.log(
                `[SESSION CORRUPT] Tool use concurrency error on session "${existingSessionId}", clearing session and notifying frontend`,
              )
              await sessionStore.delete(sessionKey)
              controller.error(
                new Error(
                  JSON.stringify({
                    ok: false,
                    error: ErrorCodes.SESSION_CORRUPT,
                    message:
                      "This conversation's session got interrupted during a tool call and can't be resumed. You can continue in a new tab with your conversation history.",
                  }),
                ),
              )
              return
            }

            // Existing: Check for "session not found" error (stale session ID)
            const isSessionNotFound =
              combinedMessage.includes("No conversation found") ||
              (combinedMessage.includes("session") && combinedMessage.includes("not found"))

            if (isSessionNotFound && existingSessionId && sessionKey) {
              logger.log(
                `[SESSION RECOVERY] Session "${existingSessionId}" not found (detected in: ${stderrMessage ? "stderr" : "message"}), clearing and retrying...`,
              )
              try {
                // Clear stale session from store
                try {
                  await sessionStore.delete(sessionKey)
                } catch (deleteError) {
                  logger.error("[SESSION RECOVERY] Failed to clear stale session:", deleteError)
                  controller.error(deleteError)
                  return
                }
                logger.log("[SESSION RECOVERY] Cleared stale session, starting fresh conversation")

                // Retry without resume - start fresh conversation
                await runQuery(undefined, undefined)
                controller.close()
                return
              } catch (retryErr) {
                logger.error("[SESSION RECOVERY] Retry failed:", retryErr)
                controller.error(retryErr)
                return
              }
            }

            logger.error("Worker pool query failed:", err)
            controller.error(err)
          }
        },
        cancel() {
          // Stream cancelled (e.g., client disconnect)
          // Note: Main cancellation path is via workerAbortController.abort() in the
          // cancellation callback. This is a fallback for direct stream cancellation.
          cancelState.requested = true
          workerAbortController.abort()
        },
      })
    } else {
      // === SPAWN-PER-REQUEST (LEGACY) ===
      logger.log("Spawning child process runner")
      if (isSuperadminWorkspace) {
        logger.log("🔓 SUPERADMIN tools (legacy): isSuperadmin=true")
      } else if (user.isAdmin) {
        logger.log(`Admin tools (legacy): isAdmin=${user.isAdmin}`)
      }

      childStream = runAgentChild(cwd, {
        message: finalMessage,
        model: effectiveModel,
        maxTurns: maxTurns,
        resume: existingSessionId || undefined,
        resumeSessionAt: resumeSessionAt || undefined,
        systemPrompt,
        apiKey: effectiveApiKey || undefined,
        sessionCookie,
        oauthTokens, // OAuth tokens for connected MCP providers (stripe, linear, etc.)
        isAdmin: user.isAdmin, // Enable Bash tools for admins
        isSuperadmin: isSuperadminWorkspace, // Superadmin has all tools, runs as root
        permissionMode: effectivePermissionMode, // Plan mode: "plan" = read-only exploration
      })
    }

    // Create NDJSON stream from child process output
    // Handles: NDJSON parsing, session ID storage, credit charging, error handling, cancellation
    const ndjsonStream = createNDJSONStream({
      childStream,
      conversationKey: sessionKey, // For Claude SDK session persistence
      requestId,
      tabId, // Tab ID for routing responses to correct tab
      conversationWorkspace: resolvedWorkspaceName,
      tokenSource,
      model: effectiveModel, // For model-specific credit calculation
      cancelState, // Pass shared cancellation state
      oauthWarnings, // OAuth warnings to inject into stream
      onMessage: message => {
        // Buffer each message for reconnection support (non-blocking)
        const streamSeq = message.streamSeq
        if (typeof streamSeq !== "number") {
          logger.log("Skipping buffer append (missing streamSeq)")
          return
        }
        appendToStreamBuffer(requestId, JSON.stringify(message), streamSeq).catch(err => {
          logger.log("Failed to buffer message (non-fatal):", err)
        })
      },
      onStreamComplete: () => {
        // Guaranteed cleanup: unregister, unlock, mark buffer complete
        unregisterCancellation(requestId)
        unlockConversation(sessionKey!)

        // Mark buffer as complete (non-blocking)
        completeStreamBuffer(requestId).catch(err => {
          logger.log("Failed to complete buffer (non-fatal):", err)
        })

        // Resolve cancel Promise if cancel was requested
        // This signals to the cancel endpoint that cleanup is complete
        if (resolveCancelComplete) {
          logger.log("Resolving cancel completion Promise")
          resolveCancelComplete()
          resolveCancelComplete = null
        }

        logger.log("Released conversation lock, unregistered cancellation, completed buffer")
      },
    })

    // Return NDJSON stream as HTTP response
    // Cancellation Architecture:
    // - Client calls POST /api/claude/stream/cancel with requestId (primary) or conversationId (fallback)
    // - Registry triggers cancelState.requested = true and reader.cancel()
    // - Stream breaks immediately and onStreamComplete releases lock
    //
    // Note: We don't use req.signal.addEventListener("abort") because it doesn't work
    // in production (Cloudflare → Caddy → Next.js proxy layers don't propagate abort).
    // See docs/streaming/cancellation-architecture.md for details.
    const response = new Response(ndjsonStream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-Id": requestId, // Send requestId in header for immediate client access
        "Access-Control-Expose-Headers": "X-Request-Id", // Allow JS to read custom header
      },
    })

    logger.log("Stream response ready, cancellation registered")
    return response
  } catch (outerError) {
    logger.error("Outer catch - request processing failed:", outerError)

    // CRITICAL: Release lock if we acquired it before the error occurred
    // This prevents deadlocks when errors happen during stream setup
    if (lockAcquired) {
      try {
        unlockConversation(sessionKey!)
        logger.log("Released lock after error")

        // Mark buffer as errored (non-blocking)
        errorStreamBuffer(requestId, outerError instanceof Error ? outerError.message : "Unknown error").catch(err => {
          logger.log("Failed to mark buffer as errored (non-fatal):", err)
        })
      } catch (unlockError) {
        logger.error("Failed to unlock conversation in error handler:", unlockError)
      }
    }

    const origin = req.headers.get("origin")
    const errorRes = createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
      details: { message: outerError instanceof Error ? outerError.message : "Unknown error" },
      requestId,
    })
    addCorsHeaders(errorRes, origin)
    return errorRes
  }
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin)
  return res
}
