/**
 * Token Refresh Lock Manager
 *
 * Prevents race conditions during OAuth token refresh operations.
 *
 * Problem:
 * When multiple concurrent requests find an expired token, they all
 * attempt to refresh it simultaneously, causing:
 * - Multiple refresh API calls (wasteful)
 * - Potential refresh token invalidation
 * - Inconsistent token state
 *
 * Solution:
 * Use a mutex pattern to ensure only one refresh happens at a time
 * per user/provider combination.
 *
 * Deployment Modes:
 * - Single instance: In-memory locks (default, fast)
 * - Multi-instance: Redis distributed locks (requires REDIS_URL)
 *
 * Configuration:
 * - REFRESH_LOCK_STRATEGY: "memory" | "redis" | "auto" (default: "auto")
 *   - "memory": Force in-memory locks (single-instance only!)
 *   - "redis": Force Redis locks (requires REDIS_URL)
 *   - "auto": Use Redis if REDIS_URL is set, otherwise memory with warnings
 */

import type { RedisClient } from "@webalive/redis"
import { createRedisClient } from "@webalive/redis"

// Lock strategy types
export type LockStrategy = "memory" | "redis" | "auto"

interface RefreshPromise {
  promise: Promise<string>
  timestamp: number
}

/**
 * Interface for lock managers (allows dependency injection and testing)
 */
export interface IRefreshLockManager {
  withLock(key: string, refreshFn: () => Promise<string>): Promise<string>
  clearAll(): void
  getActiveLockCount(): number | Promise<number>
}

/**
 * In-memory lock manager for token refresh operations.
 *
 * WARNING: Only use in single-instance deployments!
 * In horizontally scaled environments, use RedisRefreshLockManager instead.
 */
export class InMemoryRefreshLockManager implements IRefreshLockManager {
  private refreshLocks = new Map<string, RefreshPromise>()
  private readonly LOCK_TTL_MS = 30000 // 30 seconds
  private hasWarnedAboutMultiInstance = false

  constructor(private readonly warnOnUse: boolean = false) {
    if (this.warnOnUse) {
      this.logMultiInstanceWarning()
    }
  }

  private logMultiInstanceWarning(): void {
    if (this.hasWarnedAboutMultiInstance) return
    this.hasWarnedAboutMultiInstance = true

    console.warn(
      "[RefreshLock] WARNING: Using in-memory locks. " +
        "This does NOT work in horizontally scaled deployments! " +
        "Set REDIS_URL to enable distributed locking, or set " +
        "REFRESH_LOCK_STRATEGY=memory to suppress this warning " +
        "(only if you're certain you're running a single instance).",
    )
  }

  async withLock(key: string, refreshFn: () => Promise<string>): Promise<string> {
    this.cleanupStaleLocks()

    const existingLock = this.refreshLocks.get(key)

    if (existingLock) {
      if (Date.now() - existingLock.timestamp > this.LOCK_TTL_MS) {
        this.refreshLocks.delete(key)
      } else {
        console.log(`[RefreshLock:Memory] Waiting for existing refresh: ${key}`)
        return existingLock.promise
      }
    }

    console.log(`[RefreshLock:Memory] Starting new refresh: ${key}`)

    const refreshPromise = refreshFn()
      .then(token => {
        this.refreshLocks.delete(key)
        return token
      })
      .catch(error => {
        this.refreshLocks.delete(key)
        throw error
      })

    this.refreshLocks.set(key, {
      promise: refreshPromise,
      timestamp: Date.now(),
    })

    return refreshPromise
  }

  clearAll(): void {
    this.refreshLocks.clear()
  }

  private cleanupStaleLocks(): void {
    const now = Date.now()
    for (const [key, lock] of this.refreshLocks.entries()) {
      if (now - lock.timestamp > this.LOCK_TTL_MS) {
        console.log(`[RefreshLock:Memory] Removing stale lock: ${key}`)
        this.refreshLocks.delete(key)
      }
    }
  }

  getActiveLockCount(): number {
    this.cleanupStaleLocks()
    return this.refreshLocks.size
  }
}

/**
 * Redis-based distributed lock manager for token refresh operations.
 *
 * Uses Redis SET NX EX pattern for atomic lock acquisition.
 * Safe for horizontally scaled deployments.
 */
export class RedisRefreshLockManager implements IRefreshLockManager {
  private redis: RedisClient
  private readonly LOCK_TTL_SECONDS = 30
  private readonly LOCK_PREFIX = "oauth:refresh_lock:"
  private readonly POLL_INTERVAL_MS = 50
  private readonly MAX_WAIT_MS = 35000 // Slightly longer than lock TTL

  // Track local pending promises to avoid duplicate work within same instance
  private localPending = new Map<string, Promise<string>>()

  constructor(redisUrl?: string) {
    this.redis = createRedisClient(redisUrl)
  }

  async withLock(key: string, refreshFn: () => Promise<string>): Promise<string> {
    const lockKey = `${this.LOCK_PREFIX}${key}`
    const lockValue = `${process.pid}:${Date.now()}:${Math.random()}`

    // Check if we're already waiting for this key locally
    const localPromise = this.localPending.get(key)
    if (localPromise) {
      console.log(`[RefreshLock:Redis] Waiting for local pending refresh: ${key}`)
      return localPromise
    }

    // Try to acquire the lock
    const acquired = await this.tryAcquireLock(lockKey, lockValue)

    if (acquired) {
      // We got the lock, execute the refresh
      console.log(`[RefreshLock:Redis] Acquired lock, starting refresh: ${key}`)

      const refreshPromise = this.executeWithLock(lockKey, lockValue, key, refreshFn)
      this.localPending.set(key, refreshPromise)

      try {
        return await refreshPromise
      } finally {
        this.localPending.delete(key)
      }
    }

    // Lock is held by someone else, wait for it
    console.log(`[RefreshLock:Redis] Lock held by another instance, waiting: ${key}`)
    return this.waitForLockRelease(lockKey, key, refreshFn)
  }

  private async tryAcquireLock(lockKey: string, lockValue: string): Promise<boolean> {
    // SET key value NX EX seconds - atomic lock acquisition
    const result = await this.redis.set(lockKey, lockValue, "EX", this.LOCK_TTL_SECONDS, "NX")
    return result === "OK"
  }

  private async executeWithLock(
    lockKey: string,
    lockValue: string,
    _key: string,
    refreshFn: () => Promise<string>,
  ): Promise<string> {
    try {
      const token = await refreshFn()
      return token
    } finally {
      // Release lock only if we still own it (prevents releasing someone else's lock)
      await this.releaseLockIfOwned(lockKey, lockValue)
    }
  }

  private async releaseLockIfOwned(lockKey: string, lockValue: string): Promise<void> {
    // Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `
    try {
      await this.redis.eval(script, 1, lockKey, lockValue)
    } catch (error) {
      console.error(`[RefreshLock:Redis] Error releasing lock: ${error}`)
    }
  }

  private async waitForLockRelease(lockKey: string, key: string, refreshFn: () => Promise<string>): Promise<string> {
    const startTime = Date.now()

    while (Date.now() - startTime < this.MAX_WAIT_MS) {
      await this.sleep(this.POLL_INTERVAL_MS)

      // Check if lock is released
      const lockExists = await this.redis.exists(lockKey)

      if (!lockExists) {
        // Lock released, the refresh should be complete
        // Try to acquire lock ourselves to do the refresh
        // (in case the original holder failed without refreshing)
        const lockValue = `${process.pid}:${Date.now()}:${Math.random()}`
        const acquired = await this.tryAcquireLock(lockKey, lockValue)

        if (acquired) {
          // We got the lock, need to do the refresh ourselves
          // (this handles the case where the original holder crashed)
          console.log(`[RefreshLock:Redis] Lock released, acquired for retry: ${key}`)

          const refreshPromise = this.executeWithLock(lockKey, lockValue, key, refreshFn)
          this.localPending.set(key, refreshPromise)

          try {
            return await refreshPromise
          } finally {
            this.localPending.delete(key)
          }
        }

        // Someone else got the lock, continue waiting
      }
    }

    // Timeout - lock still held, throw error
    throw new Error(`[RefreshLock:Redis] Timeout waiting for lock: ${key}`)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  clearAll(): void {
    // Clear local pending map
    this.localPending.clear()
    // Note: We don't clear Redis locks here as other instances may hold them
    console.log("[RefreshLock:Redis] Cleared local pending refreshes")
  }

  async getActiveLockCount(): Promise<number> {
    // Count locks in Redis matching our prefix using SCAN (production-safe)
    // KEYS command blocks Redis and should never be used in production
    let cursor = "0"
    let count = 0
    const pattern = `${this.LOCK_PREFIX}*`

    do {
      // SCAN returns [nextCursor, keys[]]
      const [nextCursor, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 100)
      cursor = nextCursor
      count += keys.length
    } while (cursor !== "0")

    return count
  }

  /**
   * Gracefully disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.redis.quit()
  }
}

// Singleton instances for lock managers
let redisLockManagerInstance: RedisRefreshLockManager | null = null
let memoryLockManagerInstance: InMemoryRefreshLockManager | null = null

/**
 * Factory function to create the appropriate lock manager based on configuration.
 * Uses singleton pattern to avoid creating multiple Redis connections.
 */
export function createRefreshLockManager(options?: {
  strategy?: LockStrategy
  redisUrl?: string
}): IRefreshLockManager {
  const strategy = options?.strategy || (process.env.REFRESH_LOCK_STRATEGY as LockStrategy) || "auto"
  const redisUrl = options?.redisUrl || process.env.REDIS_URL

  switch (strategy) {
    case "redis":
      if (!redisUrl) {
        throw new Error("[RefreshLock] REFRESH_LOCK_STRATEGY=redis requires REDIS_URL to be set")
      }
      if (!redisLockManagerInstance) {
        console.log("[RefreshLock] Using Redis distributed locks")
        redisLockManagerInstance = new RedisRefreshLockManager(redisUrl)
      }
      return redisLockManagerInstance

    case "memory":
      if (!memoryLockManagerInstance) {
        console.log("[RefreshLock] Using in-memory locks (single-instance mode)")
        memoryLockManagerInstance = new InMemoryRefreshLockManager(false)
      }
      return memoryLockManagerInstance

    default:
      if (redisUrl) {
        if (!redisLockManagerInstance) {
          console.log("[RefreshLock] Auto-detected Redis, using distributed locks")
          redisLockManagerInstance = new RedisRefreshLockManager(redisUrl)
        }
        return redisLockManagerInstance
      }
      // Fall back to memory with warning
      if (!memoryLockManagerInstance) {
        memoryLockManagerInstance = new InMemoryRefreshLockManager(true)
      }
      return memoryLockManagerInstance
  }
}
