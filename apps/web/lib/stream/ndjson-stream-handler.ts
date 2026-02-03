/**
 * NDJSON Stream Handler - Process child process output with credit charging
 *
 * ARCHITECTURE:
 * - Credits are the primary currency (stored and charged in credits)
 * - LLM tokens from Claude API are converted to credits only at charge time
 * - Example: Claude uses 1000 LLM tokens → converted to 10 credits → charged to workspace
 *
 * Responsibilities:
 * - Parse NDJSON events from child process
 * - Handle session ID storage (via optional callback)
 * - Charge workspace credits for actual LLM token usage
 * - Build typed stream messages
 * - Manage stream lifecycle and cancellation
 *
 * This module encapsulates the complete streaming pipeline: receiving raw bytes
 * from child process, parsing NDJSON, routing to session/message handlers,
 * applying credit charges, and sending typed messages to client.
 */

import type { OAuthWarning } from "@webalive/shared"
import { sessionStore, type TabSessionKey } from "@/features/auth/lib/sessionStore"
import type { BridgeErrorMessage, StreamMessage } from "@/features/chat/lib/streaming/ndjson"
import { BridgeStreamType, createWarningMessage, encodeNDJSON } from "@/features/chat/lib/streaming/ndjson"
import { isAssistantMessageWithUsage, isBridgeMessageEvent } from "@/features/chat/types/guards"
import { ErrorCodes, getErrorMessage } from "@/lib/error-codes"
import { logStreamError } from "@/lib/error-logger"
import type { ClaudeModel } from "@/lib/models/claude-models"
import { calculateCreditsToCharge } from "@/lib/models/model-pricing"
import { chargeCreditsDirectly } from "@/lib/tokens"

/**
 * Event types emitted by child process
 */
interface ChildEvent {
  type: string
  messageCount?: number
  messageType?: string
  content?: unknown
  totalMessages?: number
  result?: unknown
  sessionId?: string
}

/**
 * Shared cancellation state between registry and stream
 */
export interface CancelState {
  requested: boolean
  reader: ReadableStreamDefaultReader<Uint8Array> | null
}

/**
 * Configuration for NDJSON stream handler
 *
 * The stream handler is responsible for:
 * - Parsing NDJSON from child process
 * - Extracting and storing session IDs
 * - Building typed stream messages
 * - Charging workspace credits for actual LLM usage
 * - Managing stream lifecycle and cancellation
 */
interface StreamHandlerConfig {
  childStream: ReadableStream<Uint8Array>
  conversationKey: TabSessionKey
  requestId: string
  /**
   * Tab ID for routing responses to correct tab
   * Included in every NDJSON event so client knows where to route the message
   */
  tabId?: string
  conversationWorkspace: string
  /**
   * Token source determines credit billing:
   * - "workspace": Charge from workspace credit balance
   * - "user_provided": User provided their own API key, no charges
   */
  tokenSource: "workspace" | "user_provided"
  /**
   * The Claude model being used (for pricing calculation)
   * Required for accurate cost calculation based on model-specific pricing
   */
  model: ClaudeModel
  /**
   * Called when a session ID is received from the child process
   * Allows caller to store session ID or perform other session setup
   */
  onSessionIdReceived?: (sessionId: string) => Promise<void>
  /**
   * Called when the stream completes (success, error, or abort)
   * Used for cleanup like releasing conversation locks
   * Guaranteed to be called exactly once via finally block
   */
  onStreamComplete?: () => void
  /**
   * Shared cancellation state with registry
   * Allows explicit cancellation via separate HTTP request
   */
  cancelState: CancelState
  /**
   * OAuth warnings to inject into stream at start
   * Shows user-facing warnings for expired/revoked tokens
   */
  oauthWarnings?: OAuthWarning[]
  /**
   * Called for each message sent to client (for buffering/persistence)
   * Receives the raw NDJSON line before encoding
   */
  onMessage?: (message: StreamMessage | BridgeErrorMessage) => void
}

/**
 * Charge credits for assistant message based on model-specific pricing
 * Only charges when using workspace credits (not user API key)
 *
 * Pricing (per MTok, 1 USD = 10 credits):
 * - Opus 4.5: $5 input, $25 output
 * - Sonnet 4.5: $3/$6 input (≤200K/>200K), $15/$22.50 output
 * - Haiku 4.5: $1 input, $5 output
 *
 * ATOMIC OPERATION: Uses Supabase RPC to atomically deduct credits.
 * Returns null if insufficient credits (prevents negative balances).
 *
 * @returns { success: boolean, newBalance: number | null, insufficientCredits: boolean }
 */
async function chargeCreditsForMessage(
  message: StreamMessage,
  workspace: string,
  requestId: string,
  model: ClaudeModel,
): Promise<{ success: boolean; newBalance: number | null; insufficientCredits: boolean }> {
  if (!isBridgeMessageEvent(message) || !isAssistantMessageWithUsage(message)) {
    return { success: false, newBalance: null, insufficientCredits: false }
  }

  const usage = message.data.content.message.usage

  // Calculate credits based on model-specific pricing
  // Note: For Sonnet tiered pricing, we assume under 200K threshold for now
  // TODO: Track cumulative prompt tokens per conversation for accurate Sonnet pricing
  const creditsToCharge = calculateCreditsToCharge(model, usage.input_tokens, usage.output_tokens)

  try {
    const newBalance = await chargeCreditsDirectly(workspace, creditsToCharge)

    if (newBalance !== null) {
      console.log(
        `[NDJSON Stream ${requestId}] Charged ${creditsToCharge} credits (model: ${model}, input: ${usage.input_tokens}, output: ${usage.output_tokens}), new balance: ${newBalance} credits`,
      )
      return { success: true, newBalance, insufficientCredits: false }
    } else {
      // Atomic deduction returned null = insufficient credits
      console.warn(`[NDJSON Stream ${requestId}] Insufficient credits to charge ${creditsToCharge} credits`)
      return { success: false, newBalance: null, insufficientCredits: true }
    }
  } catch (error) {
    console.error(
      `[NDJSON Stream ${requestId}] Error charging credits:`,
      error instanceof Error ? error.message : String(error),
    )
    return { success: false, newBalance: null, insufficientCredits: false }
  }
}

/**
 * Process a single child event - handle session or message
 * Encapsulates the session/message routing logic to avoid duplication
 *
 * @returns Object indicating if this was a completion event (for early lock release)
 */
async function processChildEvent(
  childEvent: ChildEvent,
  requestId: string,
  tabId: string | undefined,
  conversationKey: TabSessionKey,
  workspace: string,
  tokenSource: "workspace" | "user_provided",
  model: ClaudeModel,
  onSessionIdReceived: ((sessionId: string) => Promise<void>) | undefined,
  controller: ReadableStreamDefaultController<Uint8Array>,
  onMessage?: (message: StreamMessage | BridgeErrorMessage) => void,
): Promise<{ isComplete: boolean }> {
  // Handle session ID storage (server-side only)
  if (childEvent.type === "bridge_session" && childEvent.sessionId) {
    console.log(
      `[NDJSON Stream ${requestId}] [SESSION DEBUG] Received bridge_session event, sessionId: ${childEvent.sessionId}`,
    )
    console.log(`[NDJSON Stream ${requestId}] [SESSION DEBUG] Storing to key: ${conversationKey}`)
    try {
      await sessionStore.set(conversationKey, childEvent.sessionId)
      console.log(`[NDJSON Stream ${requestId}] [SESSION DEBUG] Session stored successfully`)
      if (onSessionIdReceived) {
        await onSessionIdReceived(childEvent.sessionId)
      }
    } catch (sessionError) {
      console.error(
        `[NDJSON Stream ${requestId}] Error storing session ID:`,
        sessionError instanceof Error ? sessionError.message : String(sessionError),
      )
    }
    return { isComplete: false }
  }

  // Build message and send to client (includes tabId for routing)
  const message = buildStreamMessage(childEvent, requestId, tabId)

  // Only charge credits if using workspace credits (not user API key)
  if (tokenSource === "workspace") {
    // Non-blocking credit charge with atomic deduction
    // Note: We don't stop the stream on charge failure because:
    // 1. The message was already generated by Claude (we owe them)
    // 2. Better UX to complete current request, show warning
    // 3. Next request will be blocked at the upfront check
    chargeCreditsForMessage(message, workspace, requestId, model)
      .then(result => {
        if (result.insufficientCredits) {
          console.warn(
            `[NDJSON Stream ${requestId}] ⚠️  Credits exhausted mid-stream. Current message delivered but future requests will be blocked.`,
          )
        }
      })
      .catch(error => {
        console.error(`[NDJSON Stream ${requestId}] Credit charging failed:`, error)
      })
  }

  // Notify listener before sending (for buffering)
  onMessage?.(message)

  controller.enqueue(encodeNDJSON(message))

  // Signal completion when we receive bridge_complete event
  // This allows early lock release before child process finishes SDK cleanup
  const isComplete = childEvent.type === BridgeStreamType.COMPLETE
  return { isComplete }
}

/** Counter for generating unique message IDs within a request */
const messageCounters = new Map<string, number>()

/** Generate a unique message ID for idempotency */
function generateMessageId(requestId: string): string {
  const count = (messageCounters.get(requestId) ?? 0) + 1
  messageCounters.set(requestId, count)
  return `${requestId}-${count}`
}

/** Clean up message counter when stream ends */
export function cleanupMessageCounter(requestId: string): void {
  messageCounters.delete(requestId)
}

/**
 * Strip <system-reminder> tags from content
 * These tags contain internal Claude instructions that should not be shown to users
 */
function stripSystemReminders(content: unknown): unknown {
  if (typeof content === "string") {
    // Remove all <system-reminder>...</system-reminder> tags
    // Strategy: Remove the tag and preserve spacing as appropriate
    // - If tag has newlines inside OR is between newlines, preserve one newline
    // - Otherwise just remove inline (space before/after gets collapsed naturally)
    let stripped = content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, match => {
      // If the tag contains newlines, it was multiline - replace with single newline
      if (match.includes("\n")) {
        return "\n"
      }
      // Inline tag - just remove it
      return ""
    })

    // Clean up whitespace: collapse multiple spaces, trim excess newlines
    stripped = stripped.replace(/ +/g, " ") // Multiple spaces → single space
    stripped = stripped.replace(/\n{3,}/g, "\n\n") // 3+ newlines → 2 newlines

    return stripped.trim()
  }

  if (Array.isArray(content)) {
    return content.map(stripSystemReminders)
  }

  if (content && typeof content === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(content)) {
      result[key] = stripSystemReminders(value)
    }
    return result
  }

  return content
}

/**
 * Build a stream message from child event
 * Includes tabId for routing and messageId for idempotency
 */
function buildStreamMessage(
  childEvent: ChildEvent,
  requestId: string,
  tabId?: string,
): StreamMessage | BridgeErrorMessage {
  const timestamp = new Date().toISOString()
  const messageId = generateMessageId(requestId)

  if (childEvent.type === "error") {
    return {
      type: BridgeStreamType.ERROR,
      requestId,
      messageId,
      tabId,
      timestamp,
      data: {
        error: ErrorCodes.STREAM_ERROR,
        code: ErrorCodes.STREAM_ERROR,
        message: getErrorMessage(ErrorCodes.STREAM_ERROR),
        details: { error: String(childEvent) },
      },
    } as unknown as BridgeErrorMessage
  }

  return {
    type: childEvent.type,
    requestId,
    messageId,
    tabId,
    timestamp,
    data:
      childEvent.type === BridgeStreamType.MESSAGE
        ? {
            messageCount: childEvent.messageCount,
            messageType: childEvent.messageType,
            content: stripSystemReminders(childEvent.content),
          }
        : childEvent.type === BridgeStreamType.COMPLETE
          ? { totalMessages: childEvent.totalMessages, result: stripSystemReminders(childEvent.result) }
          : childEvent,
  } as StreamMessage
}

/**
 * Create an NDJSON stream from child process output
 *
 * Handles:
 * - NDJSON parsing and buffering
 * - Session ID extraction and callback invocation
 * - Message transformation and routing
 * - Token deduction for workspace-funded requests (synchronous)
 * - Error handling and recovery
 * - Graceful shutdown and cancellation
 *
 * @param config - Stream handler configuration
 * @returns ReadableStream that can be sent as HTTP response
 */
export function createNDJSONStream(config: StreamHandlerConfig): ReadableStream<Uint8Array> {
  const {
    childStream,
    conversationKey,
    requestId,
    tabId,
    conversationWorkspace,
    tokenSource,
    model,
    onSessionIdReceived,
    onStreamComplete,
    cancelState,
    oauthWarnings,
    onMessage,
  } = config

  const decoder = new TextDecoder()
  let cleanupCalled = false // Track if cleanup was already called (shared between start and cancel)

  return new ReadableStream({
    async start(controller) {
      const reader = childStream.getReader()
      cancelState.reader = reader // Store for explicit cancellation
      let buffer = ""

      // Inject OAuth warnings at the start of the stream
      if (oauthWarnings && oauthWarnings.length > 0) {
        for (const warning of oauthWarnings) {
          const warningMessage = createWarningMessage(
            requestId,
            {
              category: "oauth",
              provider: warning.provider,
              message: warning.message,
              action: "Reconnect",
            },
            tabId,
          )
          controller.enqueue(encodeNDJSON(warningMessage))
          console.log(`[NDJSON Stream ${requestId}] Injected OAuth warning for ${warning.provider}`)
        }
      }

      try {
        while (true) {
          // Check if explicitly cancelled via cancel endpoint or client abort
          // Just break - the finally block will release the lock after abort completes
          if (cancelState.requested) {
            console.log(`[NDJSON Stream ${requestId}] Breaking loop due to cancellation`)
            break
          }

          const { done, value } = await reader.read()
          if (done) {
            break
          }

          // Decode incoming data and split by newlines
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          // Process each complete NDJSON line
          for (const line of lines) {
            // Check for cancellation during processing for better responsiveness
            // Just break - the finally block will release the lock after abort completes
            if (cancelState.requested) {
              console.log(`[NDJSON Stream ${requestId}] Cancelled during line processing`)
              break
            }

            if (!line.trim()) continue

            try {
              const childEvent: ChildEvent = JSON.parse(line)
              const { isComplete } = await processChildEvent(
                childEvent,
                requestId,
                tabId,
                conversationKey,
                conversationWorkspace,
                tokenSource,
                model,
                onSessionIdReceived,
                controller,
                onMessage,
              )

              // EARLY LOCK RELEASE: Release lock immediately when complete event is received
              // Don't wait for child process SDK cleanup (MCP servers, sessions)
              // This mirrors the cancellation pattern (lines above)
              if (isComplete && !cleanupCalled) {
                console.log(`[NDJSON Stream ${requestId}] Complete event received, releasing lock early`)
                onStreamComplete?.()
                cleanupCalled = true
              }
            } catch (parseError) {
              console.error(
                `[NDJSON Stream ${requestId}] Failed to parse child output (length: ${line.length}):`,
                parseError instanceof Error ? parseError.message : String(parseError),
              )
              console.error(`[NDJSON Stream ${requestId}] Line preview:`, line.substring(0, 200))
            }
          }

          // Break outer loop if cancelled during processing
          if (cancelState.requested) break
        }

        // Process final buffered content
        if (buffer.trim()) {
          try {
            const childEvent: ChildEvent = JSON.parse(buffer)
            const { isComplete } = await processChildEvent(
              childEvent,
              requestId,
              tabId,
              conversationKey,
              conversationWorkspace,
              tokenSource,
              model,
              onSessionIdReceived,
              controller,
              onMessage,
            )

            // EARLY LOCK RELEASE: Same pattern as in the main loop
            if (isComplete && !cleanupCalled) {
              console.log(`[NDJSON Stream ${requestId}] Complete event in final buffer, releasing lock early`)
              onStreamComplete?.()
              cleanupCalled = true
            }
          } catch (_parseError) {
            console.error(`[NDJSON Stream ${requestId}] Failed to parse final buffer:`, buffer)
          }
        }

        console.log(`[NDJSON Stream ${requestId}] Child process stream complete`)
      } catch (error) {
        // Log detailed error with build info for backend tracking
        logStreamError({ requestId, workspace: conversationWorkspace, model, error })

        // Send minimal error to frontend (user sees error ID for correlation)
        const errorMessage: BridgeErrorMessage = {
          type: BridgeStreamType.ERROR,
          requestId,
          messageId: generateMessageId(requestId),
          timestamp: new Date().toISOString(),
          data: {
            error: ErrorCodes.STREAM_ERROR,
            code: ErrorCodes.STREAM_ERROR,
            message: getErrorMessage(ErrorCodes.STREAM_ERROR),
          },
        }
        controller.enqueue(encodeNDJSON(errorMessage))
      } finally {
        // Guaranteed cleanup: runs on success, error, or cancellation
        // Close the stream so client knows we're done
        // NOTE: When stream is cancelled, controller may already be closed. Wrap in try-catch
        // to ensure onStreamComplete() is ALWAYS called (critical for lock release).
        try {
          controller.close()
        } catch (closeError) {
          // Expected when stream was cancelled - controller is already closed
          console.log(
            `[NDJSON Stream ${requestId}] Controller already closed (expected on cancel):`,
            closeError instanceof Error ? closeError.message : String(closeError),
          )
        }

        // Release conversation lock and perform any other cleanup
        // Only call if not already called during explicit cancellation
        if (!cleanupCalled) {
          onStreamComplete?.()
          cleanupCalled = true
        }

        // Clean up message counter to prevent memory leak
        cleanupMessageCounter(requestId)

        console.log(`[NDJSON Stream ${requestId}] Stream finalized and cleaned up`)
      }
    },

    /**
     * Called when stream is cancelled (client abort)
     * Propagates cancellation to child process for graceful shutdown
     *
     * IMPORTANT: We do NOT release the lock here! The abort signal needs to reach
     * the worker pool first, and the worker pool's cleanup timeout (500ms) will
     * reset the worker's busy state. Only after that should the lock be released.
     * The finally block in start() handles lock release after the abort completes.
     *
     * Flow:
     * 1. Client aborts fetch
     * 2. cancel() is called → triggers abort signal via reader.cancel()
     * 3. childStream.cancel() → workerAbortController.abort()
     * 4. Worker pool manager receives abort, sends cancel to worker, sets 500ms timeout
     * 5. After worker responds or timeout fires, worker state is reset to "ready"
     * 6. reader.cancel() completes → start() loop exits → finally block releases lock
     */
    cancel() {
      console.log(`[NDJSON Stream ${requestId}] Stream cancelled by client (abort)`)

      // Set cancellation flag so start() loop can exit cleanly
      cancelState.requested = true

      // Cancel the reader - this propagates to childStream.cancel() which aborts the worker
      // The lock will be released by the finally block in start() after the abort completes
      if (cancelState.reader) {
        cancelState.reader.cancel().catch(error => {
          console.error(`[NDJSON Stream ${requestId}] Failed to cancel reader:`, error)
        })
      }
    },
  })
}
