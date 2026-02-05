import { COOKIE_NAMES, DOMAINS } from "@webalive/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

// Mock env module
vi.mock("@/lib/env", () => ({
  env: {
    get ALIVE_PASSCODE() {
      return process.env.ALIVE_PASSCODE
    },
    get STREAM_ENV() {
      return process.env.STREAM_ENV
    },
    get NODE_ENV() {
      return process.env.NODE_ENV
    },
  },
}))

const { POST: loginManagerPOST } = await import("../route")
const { managerLoginRateLimiter } = await import("@/lib/auth/rate-limiter")

function createMockRequest(url: string, options?: RequestInit & { cookies?: Record<string, string> }) {
  const urlObj = new URL(url)
  const req = new Request(url, options) as any
  req.nextUrl = urlObj
  req.headers.get = (name: string) => {
    if (name === "origin") return DOMAINS.BRIDGE_PROD
    if (name === "cookie" && options?.cookies) {
      return Object.entries(options.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ")
    }
    return null
  }
  return req
}

describe("Manager Login Security Tests", () => {
  beforeEach(() => {
    vi.stubEnv("ALIVE_PASSCODE", "wachtwoord")
    vi.stubEnv("STREAM_ENV", "")
    vi.stubEnv("NODE_ENV", "production")
    vi.clearAllMocks()

    // Reset rate limiter before each test
    managerLoginRateLimiter.reset("manager-login:unknown")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /**
   * 🚨 CRITICAL: TIMING ATTACK TEST
   * Attacker should NOT be able to determine passcode by measuring response time
   */
  it("should have constant-time passcode comparison (TIMING ATTACK)", async () => {
    const timings: number[] = []

    // Test with completely wrong passcode
    for (let i = 0; i < 10; i++) {
      const start = performance.now()
      await loginManagerPOST(
        createMockRequest("http://localhost/api/login-manager", {
          method: "POST",
          body: JSON.stringify({ passcode: "xxxxxxxxxx" }),
        }),
      )
      timings.push(performance.now() - start)
    }

    const wrongTiming = timings.reduce((a, b) => a + b) / timings.length

    // Test with almost-correct passcode
    timings.length = 0
    for (let i = 0; i < 10; i++) {
      const start = performance.now()
      await loginManagerPOST(
        createMockRequest("http://localhost/api/login-manager", {
          method: "POST",
          body: JSON.stringify({ passcode: "wachtwoora" }), // One char different
        }),
      )
      timings.push(performance.now() - start)
    }

    const almostCorrectTiming = timings.reduce((a, b) => a + b) / timings.length

    // Timing difference should be negligible (< 5ms)
    // If there's a significant difference, attacker can brute-force char by char
    const timingDiff = Math.abs(wrongTiming - almostCorrectTiming)
    expect(timingDiff).toBeLessThan(5)

    // ⚠️ If this test FAILS:
    // - Use crypto.timingSafeEqual() for passcode comparison
    // - Current implementation uses === which is vulnerable to timing attacks
  })

  /**
   * 🚨 CRITICAL: BRUTE FORCE TEST
   * No rate limiting = attacker can try unlimited passcodes
   */
  it("should prevent brute force attacks (NO RATE LIMITING)", async () => {
    const attempts = []

    // Try 100 rapid login attempts
    for (let i = 0; i < 100; i++) {
      const res = await loginManagerPOST(
        createMockRequest("http://localhost/api/login-manager", {
          method: "POST",
          body: JSON.stringify({ passcode: `wrong${i}` }),
        }),
      )
      attempts.push(res.status)
    }

    // After many failed attempts, should get rate limited (429)
    const rateLimited = attempts.filter(status => status === 429).length

    // ⚠️ EXPECTED TO FAIL - No rate limiting implemented
    // Should rate limit after ~10 failed attempts
    expect(rateLimited).toBeGreaterThan(0)

    // If this test FAILS (which it will):
    // - Implement rate limiting (e.g., 5 attempts per minute per IP)
    // - Use Redis or in-memory store to track attempts
    // - Return 429 Too Many Requests after threshold
  })

  /**
   * 🚨 CRITICAL: SESSION TOKEN VALIDATION
   * Verify that tokens are cryptographically secure and validated server-side
   */
  it("should use cryptographically secure tokens (not '1')", async () => {
    // Login successfully
    const res = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: "wachtwoord" }),
      }),
    )

    expect(res.status).toBe(200)

    // Extract the session token from Set-Cookie header
    const setCookie = res.headers.get("set-cookie")
    expect(setCookie).toBeTruthy()

    // Token should NOT be "1" (the old insecure value)
    expect(setCookie).not.toContain(`${COOKIE_NAMES.MANAGER_SESSION}=1`)

    // Token should be long and random (base64url encoded)
    const tokenMatch = setCookie?.match(new RegExp(`${COOKIE_NAMES.MANAGER_SESSION}=([A-Za-z0-9_-]+)`))
    expect(tokenMatch).toBeTruthy()
    expect(tokenMatch![1].length).toBeGreaterThan(20) // crypto.randomBytes(32).toString('base64url') produces ~43 chars

    // Token should use URL-safe characters only (base64url)
    expect(tokenMatch![1]).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  /**
   * 🔒 INPUT VALIDATION: WHITESPACE HANDLING
   * Should passcode "  wachtwoord  " (with spaces) work?
   */
  it("should handle whitespace in passcode correctly", async () => {
    // Test with leading/trailing spaces
    const res = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: "  wachtwoord  " }),
      }),
    )

    const json = await res.json()

    // Decision: Should this be accepted (trimmed) or rejected?
    // Current behavior: REJECTED (no trimming)
    expect(res.status).toBe(401)
    expect(json.error).toBe(ErrorCodes.INVALID_CREDENTIALS)

    // Alternative: Could trim input for better UX
    // But strict matching is more secure (prevents confusion)
  })

  /**
   * 🔒 INPUT VALIDATION: CASE SENSITIVITY
   * Should "WACHTWOORD" work if password is "wachtwoord"?
   */
  it("should be case-sensitive for passcode", async () => {
    const res = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: "WACHTWOORD" }),
      }),
    )

    const json = await res.json()
    expect(res.status).toBe(401)
    expect(json.error).toBe(ErrorCodes.INVALID_CREDENTIALS)

    // Case-sensitive is correct - prevents brute force via case variations
  })

  /**
   * 🔒 DOS PROTECTION: LARGE PAYLOAD
   * What if someone sends 10MB passcode?
   */
  it("should reject extremely large passcodes (DOS)", async () => {
    const hugePasscode = "x".repeat(10 * 1024 * 1024) // 10MB

    const start = performance.now()
    const res = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: hugePasscode }),
      }),
    )
    const duration = performance.now() - start

    // Should reject reasonably fast (< 500ms) - validates we have input length limit
    // Note: Zod validation with max(1000) prevents processing entire 10MB payload
    expect(duration).toBeLessThan(500)

    // Should return 400 Bad Request (Zod validation error)
    expect(res.status).toBe(400)

    // ✅ Current implementation: Zod schema has .max(1000) which rejects large inputs
    // If this test fails (takes >500ms or doesn't reject):
    // - Verify Zod schema has max length validation
    // - Consider adding request body size limit at middleware level
  })

  /**
   * 🔒 EMPTY STRING VS UNDEFINED
   * What if ALIVE_PASSCODE is set to empty string?
   */
  it('should handle ALIVE_PASSCODE="" differently from undefined', async () => {
    // Test 1: ALIVE_PASSCODE = "" (empty string)
    vi.stubEnv("ALIVE_PASSCODE", "")

    const res1 = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: "" }),
      }),
    )

    // Empty passcode should be rejected by Zod validation
    expect(res1.status).toBe(400)

    // Test 2: ALIVE_PASSCODE = undefined
    vi.unstubAllEnvs()

    const res2 = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: "anything" }),
      }),
    )

    // Should reject all passcodes if env var not set
    expect(res2.status).toBe(401)
  })

  /**
   * 🔒 UNICODE / SPECIAL CHARACTERS
   * Can passcode contain emoji or special chars?
   */
  it("should handle unicode and special characters in passcode", async () => {
    vi.stubEnv("ALIVE_PASSCODE", "🔐secure🔑")

    const res = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: "🔐secure🔑" }),
      }),
    )

    // Should work - Unicode is valid
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.ok).toBe(true)

    vi.unstubAllEnvs()
  })

  /**
   * 🔒 SQL INJECTION ATTEMPT
   * What if someone tries SQL injection in passcode?
   */
  it("should safely handle SQL injection attempts", async () => {
    const sqlInjection = "' OR '1'='1"

    const res = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: sqlInjection }),
      }),
    )

    const json = await res.json()
    expect(res.status).toBe(401)
    expect(json.error).toBe(ErrorCodes.INVALID_CREDENTIALS)

    // Should reject without any SQL errors (we're not using SQL, but still...)
  })

  /**
   * 🔒 XSS ATTEMPT
   * What if someone tries XSS in passcode?
   */
  it("should safely handle XSS attempts in passcode", async () => {
    const xssAttempt = "<script>alert('xss')</script>"

    const res = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: xssAttempt }),
      }),
    )

    const json = await res.json()
    expect(res.status).toBe(401)

    // Response should not contain unescaped script tag
    const responseText = JSON.stringify(json)
    expect(responseText).not.toContain("<script>")
  })

  /**
   * 🔒 NULL BYTE INJECTION
   * What if passcode contains null bytes?
   */
  it("should handle null bytes in passcode", async () => {
    const nullBytePasscode = "wacht\x00woord"

    const res = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: nullBytePasscode }),
      }),
    )

    const json = await res.json()
    expect(res.status).toBe(401)
    expect(json.error).toBe(ErrorCodes.INVALID_CREDENTIALS)
  })

  /**
   * 🔒 ENVIRONMENT VARIABLE INJECTION
   * What if someone sets ALIVE_PASSCODE with newlines or special chars?
   */
  it("should handle newlines in environment variable", async () => {
    vi.stubEnv("ALIVE_PASSCODE", "pass\nword")

    const res = await loginManagerPOST(
      createMockRequest("http://localhost/api/login-manager", {
        method: "POST",
        body: JSON.stringify({ passcode: "pass\nword" }),
      }),
    )

    // Should work - exact match including newline
    expect(res.status).toBe(200)

    vi.unstubAllEnvs()
  })
})
