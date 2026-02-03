/**
 * Manager Session Store
 *
 * Stores cryptographically secure session tokens for manager authentication
 * Uses in-memory storage (should be Redis in production)
 *
 * SECURITY: Cookie value is now a random token, not "1"
 * This prevents session fixation attacks
 */

import { randomBytes } from "node:crypto"

interface SessionEntry {
  token: string
  createdAt: number
  expiresAt: number
}

class ManagerSessionStore {
  private sessions = new Map<string, SessionEntry>()
  private readonly sessionDuration = 30 * 24 * 60 * 60 * 1000 // 30 days

  /**
   * Create a new manager session
   * @returns cryptographically secure session token
   */
  createSession(): string {
    const token = randomBytes(32).toString("base64url") // 256 bits of entropy
    const now = Date.now()

    this.sessions.set(token, {
      token,
      createdAt: now,
      expiresAt: now + this.sessionDuration,
    })

    return token
  }

  /**
   * Validate a session token
   * @returns true if valid, false if invalid or expired
   */
  isValidSession(token: string | undefined | null): boolean {
    if (!token) {
      return false
    }

    const session = this.sessions.get(token)
    if (!session) {
      return false
    }

    // Check expiration
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token)
      return false
    }

    return true
  }

  /**
   * Revoke a session (logout)
   */
  revokeSession(token: string): void {
    this.sessions.delete(token)
  }

  /**
   * Cleanup expired sessions (run periodically)
   */
  cleanup(): void {
    const now = Date.now()
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(token)
      }
    }
  }

  /**
   * Get total active sessions (for monitoring)
   */
  getActiveSessionCount(): number {
    return this.sessions.size
  }
}

// Singleton instance
export const managerSessionStore = new ManagerSessionStore()

// Cleanup expired sessions every hour
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      managerSessionStore.cleanup()
    },
    60 * 60 * 1000,
  )
}
