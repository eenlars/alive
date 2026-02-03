/**
 * Rate Limiter for Authentication Endpoints
 *
 * Prevents brute force attacks by limiting failed login attempts
 * Uses in-memory storage (should be Redis in production for multi-instance deployments)
 */

interface RateLimitEntry {
  attempts: number
  firstAttempt: number
  lastAttempt: number
  blockedUntil?: number
}

class RateLimiter {
  private attempts = new Map<string, RateLimitEntry>()
  private readonly maxAttempts: number
  private readonly windowMs: number
  private readonly blockDurationMs: number

  constructor(options: { maxAttempts?: number; windowMs?: number; blockDurationMs?: number } = {}) {
    this.maxAttempts = options.maxAttempts ?? 5
    this.windowMs = options.windowMs ?? 15 * 60 * 1000 // 15 minutes
    this.blockDurationMs = options.blockDurationMs ?? 15 * 60 * 1000 // 15 minutes
  }

  /**
   * Check if an identifier (IP, email, etc.) is rate limited
   * @returns true if rate limited, false if allowed
   */
  isRateLimited(identifier: string): boolean {
    const now = Date.now()
    const entry = this.attempts.get(identifier)

    if (!entry) {
      return false
    }

    // Check if currently blocked
    if (entry.blockedUntil && entry.blockedUntil > now) {
      return true
    }

    // Check if window has expired
    if (now - entry.firstAttempt > this.windowMs) {
      // Window expired, reset
      this.attempts.delete(identifier)
      return false
    }

    // Check if max attempts exceeded
    return entry.attempts >= this.maxAttempts
  }

  /**
   * Record a failed authentication attempt
   */
  recordFailedAttempt(identifier: string): void {
    const now = Date.now()
    const entry = this.attempts.get(identifier)

    if (!entry || now - entry.firstAttempt > this.windowMs) {
      // New window
      this.attempts.set(identifier, {
        attempts: 1,
        firstAttempt: now,
        lastAttempt: now,
      })
    } else {
      // Increment attempts
      entry.attempts++
      entry.lastAttempt = now

      // Block if threshold exceeded
      if (entry.attempts >= this.maxAttempts) {
        entry.blockedUntil = now + this.blockDurationMs
      }
    }
  }

  /**
   * Reset attempts for an identifier (e.g., after successful login)
   */
  reset(identifier: string): void {
    this.attempts.delete(identifier)
  }

  /**
   * Get time remaining until unblocked (in milliseconds)
   */
  getBlockedTimeRemaining(identifier: string): number {
    const entry = this.attempts.get(identifier)
    if (!entry?.blockedUntil) {
      return 0
    }

    const remaining = entry.blockedUntil - Date.now()
    return Math.max(0, remaining)
  }

  /**
   * Cleanup old entries (run periodically)
   */
  cleanup(): void {
    const now = Date.now()
    for (const [identifier, entry] of this.attempts.entries()) {
      if (now - entry.lastAttempt > this.windowMs * 2) {
        this.attempts.delete(identifier)
      }
    }
  }
}

// Singleton instance for manager login
export const managerLoginRateLimiter = new RateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 15 * 60 * 1000, // 15 minutes
})

// Singleton instance for OAuth initiation (looser - users may retry)
export const oauthInitiationRateLimiter = new RateLimiter({
  maxAttempts: 20,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 15 * 60 * 1000, // 15 minutes
})

// Singleton instance for OAuth callbacks and disconnects (stricter - should succeed once)
export const oauthOperationRateLimiter = new RateLimiter({
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 15 * 60 * 1000, // 15 minutes
})

// Singleton instance for email check endpoint (prevent email enumeration)
export const emailCheckRateLimiter = new RateLimiter({
  maxAttempts: 15,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 15 * 60 * 1000, // 15 minutes
})

// Cleanup old entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      managerLoginRateLimiter.cleanup()
      oauthInitiationRateLimiter.cleanup()
      oauthOperationRateLimiter.cleanup()
      emailCheckRateLimiter.cleanup()
    },
    5 * 60 * 1000,
  )
}
