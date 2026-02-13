/**
 * Request Abort Handler (TEST-ONLY UTILITY)
 *
 * ⚠️ NOT USED IN PRODUCTION ⚠️
 *
 * This module is used ONLY in test files to simulate HTTP abort behavior.
 * Production code does NOT use this (see route.ts:360 for explanation).
 *
 * Why not production?
 * - Turbopack tree-shaking removes it during build
 * - Server-side req.signal doesn't work through Cloudflare/Caddy proxies
 * - Production uses explicit POST /api/claude/stream/cancel endpoint instead
 *
 * Test files that use this:
 * - lib/__tests__/stream-abort-then-send.test.ts
 * - lib/__tests__/stream-http-abort-integration.test.ts
 * - lib/stream/__tests__/abort-handler.test.ts
 *
 * Documentation: See docs/streaming/cancellation-architecture.md
 *
 * ---
 *
 * Original purpose (now handled by explicit cancel endpoint):
 * When a client aborts an HTTP request (e.g., user clicks "stop"):
 * 1. Trigger stream cancellation (which kills the child process)
 * 2. Release the conversation lock (idempotent)
 * 3. Log the cancellation event
 */

import * as Sentry from "@sentry/nextjs"
import { type TabSessionKey, unlockConversation } from "@/features/auth/lib/sessionStore"

/**
 * Configuration for abort handler
 */
interface AbortHandlerConfig {
  signal: AbortSignal | null
  stream: ReadableStream<Uint8Array>
  conversationKey: TabSessionKey
  requestId: string
}

/**
 * Set up abort listener on the request signal
 *
 * Handles:
 * - Stream cancellation (stops reading, kills child process via SIGTERM)
 * - Conversation lock release (idempotent)
 * - Error logging
 *
 * IMPORTANT: This must be called AFTER the stream is created, to ensure
 * the stream exists when/if the abort listener is invoked.
 *
 * @param config - Abort handler configuration
 */
export function setupAbortHandler(config: AbortHandlerConfig): void {
  const { signal, stream, conversationKey, requestId } = config

  if (!signal) {
    console.warn(`[Abort Handler ${requestId}] No abort signal available`)
    return
  }

  signal.addEventListener(
    "abort",
    () => {
      try {
        console.log(`[Abort Handler ${requestId}] Request aborted by client`)

        // Cancel the stream, which triggers:
        // 1. Stream's cancel() handler
        // 2. Cancellation of childStream
        // 3. SIGTERM sent to child process
        // 4. Child process graceful shutdown (or SIGKILL after 5s)
        stream.cancel().catch(error => {
          console.error(`[Abort Handler ${requestId}] Failed to cancel stream on abort:`, error)
          Sentry.captureException(error)
        })

        // Release lock (will be called again in finally block, but idempotent)
        unlockConversation(conversationKey)
        console.log(`[Abort Handler ${requestId}] Conversation lock released for: ${conversationKey}`)
      } catch (error) {
        console.error(`[Abort Handler ${requestId}] Failed to handle abort:`, error)
        Sentry.captureException(error)
      }
    },
    { once: true },
  )
}
