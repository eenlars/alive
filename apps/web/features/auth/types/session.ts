/**
 * Session and concurrency guards
 * These guards prevent overlapping requests and manage conversation state
 */

/** Branded key: userId::workspace(::wt/<slug>)::tabGroupId::tabId — only created by tabKey() */
export type TabSessionKey = string & { readonly __brand: "TabSessionKey" }

// Concurrency guard to prevent overlapping sessions
const activeConversations = new Set<TabSessionKey>()

// Track when each conversation was locked (for timeout detection)
const conversationLockTimestamps = new Map<TabSessionKey, number>()

// Lock timeout: 5 minutes (in milliseconds)
const LOCK_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Attempt to lock a conversation to prevent concurrent requests.
 * Returns true if acquired, false if already held.
 * Stale locks (> LOCK_TIMEOUT_MS) are auto-released.
 */
export function tryLockConversation(key: TabSessionKey): boolean {
  const existingLockTime = conversationLockTimestamps.get(key)

  if (existingLockTime !== undefined) {
    const lockAge = Date.now() - existingLockTime

    if (lockAge > LOCK_TIMEOUT_MS) {
      // Stale lock — force cleanup and fall through to re-acquire
      console.warn(`[Session] Force unlocking stale lock: ${key} (held ${Math.round(lockAge / 1000)}s)`)
      activeConversations.delete(key)
      conversationLockTimestamps.delete(key)
    } else {
      return false
    }
  }

  // Acquire lock (JS is single-threaded — no race possible between check and set)
  conversationLockTimestamps.set(key, Date.now())
  activeConversations.add(key)
  return true
}

/**
 * Release a conversation lock after request completes
 * Should be called in finally block to ensure cleanup
 */
export function unlockConversation(key: TabSessionKey): void {
  activeConversations.delete(key)
  conversationLockTimestamps.delete(key)
}

/**
 * Check if a conversation is currently locked/in-progress
 */
export function isConversationLocked(key: TabSessionKey): boolean {
  return activeConversations.has(key)
}

/**
 * Check if a value is a valid session ID (non-empty string)
 */
export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Check if session exists (result of session store lookup)
 */
export function hasExistingSession(sessionId: string | null): sessionId is string {
  return sessionId !== null && sessionId.length > 0
}

/**
 * Periodic cleanup of stale conversation locks
 * Runs every minute to prevent memory leaks from abandoned locks
 *
 * Note: This runs in Node.js runtime (not edge), so setInterval is safe.
 * Each server instance maintains its own lock state.
 */
function cleanupStaleLocks() {
  const now = Date.now()
  let cleanedCount = 0

  for (const [key, timestamp] of conversationLockTimestamps.entries()) {
    if (now - timestamp > LOCK_TIMEOUT_MS) {
      console.warn(`[Session] Auto-unlocking stale conversation lock: ${key}`)
      console.warn(
        `[Session] Lock was held for ${Math.round((now - timestamp) / 1000)}s (timeout: ${LOCK_TIMEOUT_MS / 1000}s)`,
      )
      activeConversations.delete(key)
      conversationLockTimestamps.delete(key)
      cleanedCount++
    }
  }

  if (cleanedCount > 0) {
    console.log(`[Session] Cleaned up ${cleanedCount} stale lock(s)`)
  }
}

// Periodic cleanup in server runtime only (skip in tests to avoid leaked timers)
if (typeof setInterval !== "undefined" && typeof process !== "undefined" && !process.env.VITEST) {
  setInterval(cleanupStaleLocks, 60 * 1000)
}

/**
 * Debug function: Get all currently locked conversations
 * Returns array of lock keys with their ages
 */
export function getLockedConversations(): Array<{ key: TabSessionKey; ageMs: number }> {
  const now = Date.now()
  const locks: Array<{ key: TabSessionKey; ageMs: number }> = []

  for (const [key, timestamp] of conversationLockTimestamps.entries()) {
    locks.push({
      key,
      ageMs: now - timestamp,
    })
  }

  return locks
}
