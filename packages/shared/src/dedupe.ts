/**
 * Deduplication cache with TTL and max size limits.
 * Based on OpenClaw's implementation.
 *
 * Useful for:
 * - Preventing duplicate webhook processing
 * - Rate limiting by key
 * - Caching recent operation results
 */

export type DedupeCache = {
  /**
   * Check if a key was recently seen.
   * Returns true if duplicate (seen within TTL), false if new.
   * Automatically adds/refreshes the key in the cache.
   */
  check: (key: string | undefined | null, now?: number) => boolean
  /** Clear all entries */
  clear: () => void
  /** Get current cache size */
  size: () => number
  /** Get all keys (for debugging) */
  keys: () => string[]
  /** Check if key exists without updating it */
  has: (key: string) => boolean
  /** Remove a specific key */
  delete: (key: string) => boolean
}

export type DedupeCacheOptions = {
  /** Time-to-live in milliseconds. Entries older than this are considered expired. */
  ttlMs: number
  /** Maximum number of entries. Oldest entries are evicted when exceeded. */
  maxSize: number
}

/**
 * Create a deduplication cache.
 *
 * @example Prevent duplicate webhook processing
 * ```ts
 * const webhookDedupe = createDedupeCache({ ttlMs: 60_000, maxSize: 1000 })
 *
 * function handleWebhook(id: string, payload: unknown) {
 *   if (webhookDedupe.check(id)) {
 *     console.log('Duplicate webhook, skipping')
 *     return
 *   }
 *   // Process webhook...
 * }
 * ```
 *
 * @example Rate limiting by user
 * ```ts
 * const rateLimiter = createDedupeCache({ ttlMs: 1000, maxSize: 10000 })
 *
 * function handleRequest(userId: string) {
 *   if (rateLimiter.check(userId)) {
 *     throw new Error('Rate limited')
 *   }
 *   // Process request...
 * }
 * ```
 */
export function createDedupeCache(options: DedupeCacheOptions): DedupeCache {
  const ttlMs = Math.max(0, options.ttlMs)
  const maxSize = Math.max(0, Math.floor(options.maxSize))
  const cache = new Map<string, number>()

  // Move key to end of map (most recently used)
  const touch = (key: string, now: number) => {
    cache.delete(key)
    cache.set(key, now)
  }

  // Remove expired entries and enforce max size
  const prune = (now: number) => {
    // Remove expired entries
    const cutoff = ttlMs > 0 ? now - ttlMs : undefined
    if (cutoff !== undefined) {
      for (const [entryKey, entryTs] of cache) {
        if (entryTs < cutoff) {
          cache.delete(entryKey)
        }
      }
    }

    // Enforce max size (remove oldest entries first)
    if (maxSize <= 0) {
      cache.clear()
      return
    }
    while (cache.size > maxSize) {
      const oldestKey = cache.keys().next().value
      if (!oldestKey) {
        break
      }
      cache.delete(oldestKey)
    }
  }

  return {
    check: (key, now = Date.now()) => {
      if (!key) {
        return false
      }
      const existing = cache.get(key)
      if (existing !== undefined && (ttlMs <= 0 || now - existing < ttlMs)) {
        // Key exists and is not expired - it's a duplicate
        touch(key, now)
        return true
      }
      // Key is new or expired - add it and return false
      touch(key, now)
      prune(now)
      return false
    },
    clear: () => {
      cache.clear()
    },
    size: () => cache.size,
    keys: () => Array.from(cache.keys()),
    has: (key: string) => {
      const existing = cache.get(key)
      if (existing === undefined) {
        return false
      }
      if (ttlMs > 0 && Date.now() - existing >= ttlMs) {
        cache.delete(key)
        return false
      }
      return true
    },
    delete: (key: string) => cache.delete(key),
  }
}

/**
 * Create a dedupe cache that groups by prefix.
 * Useful for per-user or per-session deduplication.
 *
 * @example Per-user rate limiting
 * ```ts
 * const userDedupe = createPrefixedDedupeCache({ ttlMs: 1000, maxSize: 100 })
 *
 * function handleAction(userId: string, actionId: string) {
 *   if (userDedupe.check(userId, actionId)) {
 *     throw new Error('Duplicate action')
 *   }
 * }
 * ```
 */
export function createPrefixedDedupeCache(options: DedupeCacheOptions): {
  check: (prefix: string, key: string, now?: number) => boolean
  clear: (prefix?: string) => void
  size: (prefix?: string) => number
} {
  const caches = new Map<string, DedupeCache>()

  const getOrCreate = (prefix: string): DedupeCache => {
    let cache = caches.get(prefix)
    if (!cache) {
      cache = createDedupeCache(options)
      caches.set(prefix, cache)
    }
    return cache
  }

  return {
    check: (prefix, key, now) => getOrCreate(prefix).check(key, now),
    clear: prefix => {
      if (prefix) {
        caches.get(prefix)?.clear()
        caches.delete(prefix)
      } else {
        caches.clear()
      }
    },
    size: prefix => {
      if (prefix) {
        return caches.get(prefix)?.size() ?? 0
      }
      let total = 0
      for (const cache of caches.values()) {
        total += cache.size()
      }
      return total
    },
  }
}
