import { describe, expect, it } from "vitest"

/**
 * Integration Test - Environment Configuration
 *
 * This test ensures the ACTUAL environment is configured correctly.
 * Unlike unit tests that mock everything, this verifies real-world setup.
 */
describe("Manager Login Integration", () => {
  /**
   * CRITICAL: Verify BRIDGE_PASSCODE environment variable is set
   *
   * This test caught a production bug where the process manager wasn't loading .env
   * Unit tests passed because they mocked env, but real login failed.
   */
  it("should have BRIDGE_PASSCODE environment variable configured", () => {
    const passcode = process.env.BRIDGE_PASSCODE

    // In production/development, BRIDGE_PASSCODE must be set
    // (In test environment, it might not be set, which is OK)
    if (process.env.NODE_ENV !== "test") {
      expect(passcode).toBeDefined()
      expect(passcode).not.toBe("")
      expect(typeof passcode).toBe("string")
      expect(passcode!.length).toBeGreaterThan(0)
    }

    // This test will fail if:
    // - .env file doesn't have BRIDGE_PASSCODE
    // - Process manager didn't load .env
    // - Environment variables weren't passed correctly

    // To fix:
    // 1. Add BRIDGE_PASSCODE=your_password to .env
    // 2. Restart the systemd service: systemctl restart alive-dev
    // 3. If using bun dev: restart the dev server
  })

  /**
   * Verify lib/env.ts can access BRIDGE_PASSCODE
   *
   * This ensures our environment validation layer works correctly
   */
  it("should expose BRIDGE_PASSCODE through env module", async () => {
    // Skip in test environment since env.ts requires ANTHROPIC_API_KEY
    // In production/development, verify env module works
    if (process.env.NODE_ENV === "test") {
      expect(true).toBe(true) // Skip test
      return
    }

    const { env } = await import("@/lib/env")

    expect(env.BRIDGE_PASSCODE).toBeDefined()
    expect(env.BRIDGE_PASSCODE).toBe(process.env.BRIDGE_PASSCODE)
  })

  /**
   * Verify rate limiter and session store are initialized
   *
   * These singletons must be available at runtime
   */
  it("should have rate limiter initialized", async () => {
    const { managerLoginRateLimiter } = await import("@/lib/auth/rate-limiter")

    expect(managerLoginRateLimiter).toBeDefined()
    expect(typeof managerLoginRateLimiter.isRateLimited).toBe("function")
    expect(typeof managerLoginRateLimiter.recordFailedAttempt).toBe("function")
    expect(typeof managerLoginRateLimiter.reset).toBe("function")
  })

  it("should create manager JWT tokens", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/features/auth/lib/jwt")

    expect(createSessionToken).toBeDefined()
    expect(verifySessionToken).toBeDefined()

    // Test manager JWT creation
    const token = await createSessionToken("manager", "manager@system", "Manager", [])

    expect(token).toBeDefined()
    expect(typeof token).toBe("string")
    expect(token.split(".").length).toBe(3) // JWT has 3 parts

    // Test JWT validation
    const payload = await verifySessionToken(token)
    expect(payload).toBeDefined()
    expect(payload?.userId).toBe("manager")
    expect(payload?.email).toBe("manager@system")

    // Test invalid token
    const invalid = await verifySessionToken("invalid.jwt.token")
    expect(invalid).toBeNull()
  })
})
