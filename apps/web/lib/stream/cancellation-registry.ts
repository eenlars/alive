/**
 * Cancellation Registry - Simple in-memory registry for stream cancellation
 *
 * Responsibilities:
 * - Store cancellation callbacks for active streams
 * - Allow explicit cancellation via requestId
 * - Cleanup completed/cancelled streams
 * - Mark stream buffers as complete on TTL expiry
 */

import { completeStreamBuffer } from "./stream-buffer"

interface CancelEntry {
  cancel: () => void | Promise<void>
  userId: string
  conversationKey: string
  requestId: string
  createdAt: number
}

/**
 * Global registry of active streams that can be cancelled
 * Key: requestId, Value: cancel callback + metadata
 */
const registry = new Map<string, CancelEntry>()

/**
 * Register a stream for cancellation
 * The cancel callback can return a Promise that resolves when cleanup is complete
 */
export function registerCancellation(
  requestId: string,
  userId: string,
  conversationKey: string,
  cancel: () => void | Promise<void>,
): void {
  console.log(`[CancellationRegistry] REGISTER: requestId=${requestId}, convKey=${conversationKey}, userId=${userId}`)
  console.log(`[CancellationRegistry] Registry size before: ${registry.size}`)
  registry.set(requestId, {
    cancel,
    userId,
    conversationKey,
    requestId,
    createdAt: Date.now(),
  })
  console.log(`[CancellationRegistry] Registry size after: ${registry.size}`)
}

/**
 * Cancel a stream by requestId
 * Returns true if stream was found and cancelled, false if not found
 * Automatically unregisters after cancelling to prevent double-cancellation
 *
 * If the cancel callback returns a Promise, this function awaits it.
 * This allows the caller to wait for cleanup to complete before proceeding.
 */
export async function cancelStream(requestId: string, userId: string): Promise<boolean> {
  const entry = registry.get(requestId)

  if (!entry) {
    return false // Already completed or never existed
  }

  // Security: only owner can cancel
  if (entry.userId !== userId) {
    throw new Error("Unauthorized: cannot cancel another user's stream")
  }

  // Await the cancel callback (may return Promise for cleanup completion)
  await entry.cancel()
  registry.delete(requestId) // Auto-cleanup after cancel
  return true
}

/**
 * Cancel a stream by conversationKey (fallback when requestId not available yet)
 * Handles super-early Stop case where user clicks Stop before receiving requestId
 * Returns true if stream was found and cancelled, false if not found
 *
 * If the cancel callback returns a Promise, this function awaits it.
 */
export async function cancelStreamByConversationKey(conversationKey: string, userId: string): Promise<boolean> {
  console.log(`[CancellationRegistry] Looking for conversationKey: ${conversationKey}`)
  console.log(`[CancellationRegistry] Registry size: ${registry.size}`)

  // Log all entries for debugging
  for (const [reqId, entry] of registry.entries()) {
    console.log(
      `[CancellationRegistry] Entry: requestId=${reqId}, convKey=${entry.conversationKey}, userId=${entry.userId}`,
    )
  }

  // Find the entry with matching conversationKey
  for (const [requestId, entry] of registry.entries()) {
    if (entry.conversationKey === conversationKey) {
      // Security: only owner can cancel
      if (entry.userId !== userId) {
        throw new Error("Unauthorized: cannot cancel another user's stream")
      }

      console.log(`[CancellationRegistry] Found match! Cancelling requestId=${requestId}`)
      // Await the cancel callback (may return Promise for cleanup completion)
      await entry.cancel()
      registry.delete(requestId) // Auto-cleanup after cancel
      return true
    }
  }

  console.log(`[CancellationRegistry] No match found for conversationKey: ${conversationKey}`)
  return false // No active stream found for this conversation
}

/**
 * Unregister a stream (called when stream completes)
 */
export function unregisterCancellation(requestId: string): void {
  const existed = registry.has(requestId)
  console.log(`[CancellationRegistry] UNREGISTER: requestId=${requestId}, existed=${existed}`)
  console.log(`[CancellationRegistry] Registry size before: ${registry.size}`)
  registry.delete(requestId)
  console.log(`[CancellationRegistry] Registry size after: ${registry.size}`)
}

/**
 * Get registry size (for testing/debugging)
 */
export function getRegistrySize(): number {
  return registry.size
}

/**
 * Debug function: Get full registry state
 * Returns array of all registered entries with their metadata
 */
export function getRegistryState(): Array<{
  requestId: string
  userId: string
  conversationKey: string
  ageMs: number
}> {
  const now = Date.now()
  const entries: Array<{
    requestId: string
    userId: string
    conversationKey: string
    ageMs: number
  }> = []

  for (const [requestId, entry] of registry.entries()) {
    entries.push({
      requestId,
      userId: entry.userId,
      conversationKey: entry.conversationKey,
      ageMs: now - entry.createdAt,
    })
  }

  return entries
}

/**
 * TTL-based cleanup for orphaned entries
 * Safety net for streams that crashed or didn't clean up properly.
 *
 * IMPORTANT: This MUST be longer than the longest realistic conversation.
 * Opus conversations with multi-tool tasks regularly run 10-20 minutes.
 * The TTL cleanup calls entry.cancel() which is the same abort path as
 * the user clicking Stop — it kills active streams, not just orphans.
 *
 * Previously set to 3 minutes which killed every Opus conversation >3min.
 * See: https://github.com/eenlars/alive/issues/126
 */
const TTL_MS = 30 * 60 * 1000 // 30 minutes
const CLEANUP_INTERVAL_MS = 1 * 60 * 1000 // 1 minute

let cleanupInterval: NodeJS.Timeout | null = null

export function startTTLCleanup(): void {
  if (cleanupInterval) {
    return // Already running
  }

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    let cleanedCount = 0

    for (const [requestId, entry] of registry) {
      if (now - entry.createdAt > TTL_MS) {
        console.warn(
          `[Registry TTL] Cleaning up stale entry: ${requestId} (age: ${Math.round((now - entry.createdAt) / 1000)}s)`,
        )
        // Try to cancel gracefully (may not work if connection is dead)
        entry.cancel()
        registry.delete(requestId)

        // CRITICAL: Mark stream buffer as complete so client doesn't show "thinking" forever
        // This is the root cause fix - without this, stale buffers stay in "streaming" state
        completeStreamBuffer(requestId).catch(err => {
          console.warn(`[Registry TTL] Failed to complete buffer for ${requestId}:`, err)
        })

        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.log(`[Registry TTL] Cleaned up ${cleanedCount} stale entries`)
    }
  }, CLEANUP_INTERVAL_MS)

  console.log("[Registry TTL] Cleanup started (check every 1min, TTL: 3min)")
}

/**
 * Stop TTL cleanup (for testing)
 */
export function stopTTLCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}
