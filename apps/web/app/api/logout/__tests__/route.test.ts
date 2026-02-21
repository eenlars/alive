import { COOKIE_NAMES, DOMAINS } from "@webalive/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock env modules before importing route
// Both @/lib/env (internal) and @webalive/env/server (package) need to be mocked
// to allow dynamic env access during tests via vi.stubEnv()
// Uses a Proxy so any env key (JWT_SECRET, STREAM_ENV, etc.) forwards to process.env
const envMock = {
  env: new Proxy(
    {},
    {
      get(_, prop) {
        return process.env[prop as string]
      },
    },
  ),
}

vi.mock("@/lib/env", () => envMock)
vi.mock("@webalive/env/server", () => envMock)

// Import route handlers after mocking
const { POST: loginPOST } = await import("../../login/route")
const { POST: logoutPOST } = await import("../route")

/**
 * COOKIE CONFIGURATION CONSISTENCY TESTS
 *
 * These tests MUST catch bugs before production:
 * 1. Login and logout cookies must have matching attributes
 * 2. Cookie clearing only works if attributes match exactly
 * 3. Mismatched secure/sameSite causes stale sessions on mobile
 *
 * THE BUG WE'RE PREVENTING:
 * - Login sets: { secure: conditional, sameSite: "lax" }
 * - Logout sets: { secure: true, sameSite: "none" }
 * - Result: Logout doesn't clear cookie → stale JWT → 401 on mobile
 */

// Helper to extract cookie configuration from Set-Cookie header
interface CookieConfig {
  name: string
  value: string
  httpOnly: boolean
  secure: boolean
  sameSite: string | null
  path: string | null
  maxAge: number | null
  expires: string | null
}

function parseCookieHeader(setCookieHeader: string): CookieConfig {
  const parts = setCookieHeader.split(";").map(p => p.trim())
  const [nameValue] = parts
  const [name, value] = nameValue.split("=")

  const config: CookieConfig = {
    name,
    value,
    httpOnly: false,
    secure: false,
    sameSite: null,
    path: null,
    maxAge: null,
    expires: null,
  }

  for (const part of parts.slice(1)) {
    const lower = part.toLowerCase()

    if (lower === "httponly") {
      config.httpOnly = true
    } else if (lower === "secure") {
      config.secure = true
    } else if (lower.startsWith("samesite=")) {
      config.sameSite = part.split("=")[1]
    } else if (lower.startsWith("path=")) {
      config.path = part.split("=")[1]
    } else if (lower.startsWith("max-age=")) {
      config.maxAge = Number.parseInt(part.split("=")[1], 10)
    } else if (lower.startsWith("expires=")) {
      config.expires = part.split("=")[1]
    }
  }

  return config
}

// Helper to create mock NextRequest
function createMockRequest(url: string, options?: RequestInit) {
  const urlObj = new URL(url)
  // NextRequest constructor doesn't accept all options we need, so we build from Request
  const req = new Request(url, options) as unknown as import("next/server").NextRequest
  ;(req as unknown as Record<string, unknown>).nextUrl = urlObj
  const originalGet = req.headers.get.bind(req.headers)
  req.headers.get = (name: string) => {
    if (name === "origin") return DOMAINS.STREAM_PROD
    return originalGet(name)
  }
  return req
}

// Mock Supabase authentication
vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: {
                user_id: "test-user-123",
                email: "test@example.com",
                password_hash: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy", // "password"
                display_name: "Test User",
              },
              error: null,
            }),
          ),
        })),
      })),
    })),
  })),
}))

// Mock password verification
vi.mock("@/types/guards/api", () => ({
  verifyPassword: vi.fn(() => Promise.resolve(true)),
}))

describe("POST /api/logout - Cookie Configuration Consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    // createSessionToken needs a JWT secret for signing; stub it so login can produce a token
    vi.stubEnv("JWT_SECRET", "test-secret-for-cookie-consistency-tests")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /**
   * THE COOKIE MISMATCH BUG TEST (PRODUCTION)
   * Login and logout MUST set identical cookie attributes in production
   * Otherwise logout won't clear the cookie properly
   *
   */
  it("should match login cookie config in production (THE COOKIE MISMATCH BUG)", async () => {
    vi.stubEnv("NODE_ENV", "production")

    // Get login cookie config
    const loginReq = createMockRequest("http://localhost/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password",
      }),
    })

    const loginRes = await loginPOST(loginReq)
    const loginSetCookie = loginRes.headers.get("set-cookie")

    if (!loginSetCookie) {
      throw new Error("Login didn't set session cookie")
    }

    const loginCookie = parseCookieHeader(loginSetCookie.split(",")[0])

    // Get logout cookie config
    const logoutReq = createMockRequest("http://localhost/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    const logoutRes = await logoutPOST(logoutReq)
    const logoutSetCookie = logoutRes.headers.get("set-cookie")

    if (!logoutSetCookie) {
      throw new Error("Logout didn't set session cookie")
    }

    const logoutCookie = parseCookieHeader(logoutSetCookie.split(",")[0])

    // Assert ALL attributes match (except value and expiry)
    expect(logoutCookie.name).toBe(loginCookie.name)
    expect(logoutCookie.httpOnly).toBe(loginCookie.httpOnly)
    expect(logoutCookie.secure).toBe(loginCookie.secure) // THE CRITICAL CHECK
    expect(logoutCookie.sameSite).toBe(loginCookie.sameSite) // THE CRITICAL CHECK
    expect(logoutCookie.path).toBe(loginCookie.path)

    // Value should be different (empty for logout)
    expect(logoutCookie.value).toBe("")

    // Logout should expire immediately
    expect(logoutCookie.expires).not.toBeNull()

    // If this test FAILS:
    // - Logout won't clear cookies properly
    // - Users will have stale JWTs
    // - Mobile devices will get 401 errors
  })

  /**
   * THE COOKIE MISMATCH BUG TEST (DEVELOPMENT)
   * Same check for development environment
   *
   */
  it("should match login cookie config in development (THE COOKIE MISMATCH BUG)", async () => {
    vi.stubEnv("NODE_ENV", "development")

    // Get login cookie config
    const loginReq = createMockRequest("http://localhost/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password",
      }),
    })

    const loginRes = await loginPOST(loginReq)
    const loginSetCookie = loginRes.headers.get("set-cookie")

    if (!loginSetCookie) {
      throw new Error("Login didn't set session cookie")
    }

    const loginCookie = parseCookieHeader(loginSetCookie.split(",")[0])

    // Get logout cookie config
    const logoutReq = createMockRequest("http://localhost/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    const logoutRes = await logoutPOST(logoutReq)
    const logoutSetCookie = logoutRes.headers.get("set-cookie")

    if (!logoutSetCookie) {
      throw new Error("Logout didn't set session cookie")
    }

    const logoutCookie = parseCookieHeader(logoutSetCookie.split(",")[0])

    // Assert ALL attributes match
    expect(logoutCookie.httpOnly).toBe(loginCookie.httpOnly)
    expect(logoutCookie.secure).toBe(loginCookie.secure)
    expect(logoutCookie.sameSite).toBe(loginCookie.sameSite)
    expect(logoutCookie.path).toBe(loginCookie.path)
  })

  /**
   * THE MANAGER COOKIE MISMATCH BUG TEST
   * Manager session cookie should follow same pattern
   * (We don't have manager login endpoint, but logout should still be consistent)
   */
  it("should clear manager_session with consistent attributes (THE MANAGER COOKIE BUG)", async () => {
    vi.stubEnv("NODE_ENV", "production")

    const logoutReq = createMockRequest("http://localhost/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    const logoutRes = await logoutPOST(logoutReq)
    const setCookieHeaders = logoutRes.headers.get("set-cookie")

    if (!setCookieHeaders) {
      throw new Error("Logout didn't set cookies")
    }

    // Parse both cookies (auth_session and manager_session)
    const cookies = setCookieHeaders.split(",").map(parseCookieHeader)
    const sessionCookie = cookies.find(c => c.name === COOKIE_NAMES.SESSION)
    const managerCookie = cookies.find(c => c.name === COOKIE_NAMES.MANAGER_SESSION)

    if (!sessionCookie || !managerCookie) {
      throw new Error(`Missing ${COOKIE_NAMES.SESSION} or ${COOKIE_NAMES.MANAGER_SESSION} cookie`)
    }

    // Both should have identical attributes
    expect(managerCookie.httpOnly).toBe(sessionCookie.httpOnly)
    expect(managerCookie.secure).toBe(sessionCookie.secure)
    expect(managerCookie.sameSite).toBe(sessionCookie.sameSite)
    expect(managerCookie.path).toBe(sessionCookie.path)

    // Both should be cleared
    expect(sessionCookie.value).toBe("")
    expect(managerCookie.value).toBe("")

    // If this test FAILS, manager logout won't work properly
  })

  /**
   * THE SECURE FLAG BUG TEST
   * On deployed servers (STREAM_ENV !== "local"), secure should be true (HTTPS only)
   * In local development (STREAM_ENV === "local"), secure should be false (HTTP works)
   */
  it("should set secure flag based on STREAM_ENV (THE SECURE FLAG BUG)", async () => {
    // Deployed server (STREAM_ENV !== "local"): secure should be TRUE
    vi.stubEnv("STREAM_ENV", "production")
    let req = createMockRequest("http://localhost/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    let res = await logoutPOST(req)
    let setCookie = res.headers.get("set-cookie")
    expect(setCookie).toContain("Secure")

    // Local development (STREAM_ENV === "local"): secure should be FALSE
    vi.stubEnv("STREAM_ENV", "local")
    req = createMockRequest("http://localhost/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    res = await logoutPOST(req)
    setCookie = res.headers.get("set-cookie")
    expect(setCookie).not.toContain("Secure")

    // If this test FAILS:
    // - Production cookies might work on HTTP (security issue)
    // - Development cookies might fail on HTTP (dev broken)
  })

  /**
   * THE SAMESITE LAX BUG TEST
   * sameSite should be "lax" to match login
   * "none" would require HTTPS always and break dev
   */
  it("should use sameSite=lax to match login (THE SAMESITE BUG)", async () => {
    const req = createMockRequest("http://localhost/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    const res = await logoutPOST(req)
    const setCookie = res.headers.get("set-cookie")

    if (!setCookie) {
      throw new Error("Logout didn't set cookies")
    }

    // Should contain SameSite=Lax (case insensitive)
    expect(setCookie.toLowerCase()).toContain("samesite=lax")
    expect(setCookie.toLowerCase()).not.toContain("samesite=none")

    // If this test FAILS:
    // - Cookie won't be cleared properly
    // - Mobile browsers will keep stale sessions
  })
})
