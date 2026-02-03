import { COOKIE_NAMES, DOMAINS } from "@webalive/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

// Mock env module before importing route
vi.mock("@/lib/env", () => ({
  env: {
    get BRIDGE_PASSCODE() {
      return process.env.BRIDGE_PASSCODE
    },
    get BRIDGE_ENV() {
      return process.env.BRIDGE_ENV
    },
    get NODE_ENV() {
      return process.env.NODE_ENV
    },
  },
}))

// Import route handlers after mocking
const { POST: loginManagerPOST, OPTIONS: loginManagerOPTIONS } = await import("../route")
const { POST: logoutPOST } = await import("../../logout/route")

/**
 * MANAGER LOGIN TESTS
 *
 * Critical security tests for manager authentication:
 * 1. Passcode validation against env.BRIDGE_PASSCODE
 * 2. Test mode support for local development
 * 3. Cookie configuration consistency with logout
 * 4. Proper error codes and messages
 * 5. CORS handling
 */

// Helper to parse Set-Cookie header
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
  // Split by semicolon first to get cookie attributes
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

  // Parse attributes
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
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
      // Expires value is everything after "Expires="
      // Just take the value directly (no need to collect multiple parts)
      config.expires = part.substring(part.indexOf("=") + 1)
    }
  }

  return config
}

// Helper to split multiple Set-Cookie headers properly
function splitSetCookieHeaders(setCookieHeader: string): string[] {
  // Multiple cookies in Set-Cookie are separated by ", <cookiename>="
  // but Expires values also contain ", "
  // Strategy: Look for pattern ", <word>=" where word is not a known attribute

  const cookies: string[] = []
  const parts = setCookieHeader.split("; ")
  let current = ""

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    // Check if this part contains a cookie separator (", cookiename=")
    const separatorMatch = part.match(/(.*),\s*([a-zA-Z_][a-zA-Z0-9_-]*)=(.*)/)

    if (separatorMatch && !separatorMatch[2].match(/^(Path|Expires|Max-Age|Domain|Secure|HttpOnly|SameSite)$/i)) {
      // This part contains a new cookie start
      // separatorMatch[1] is the end of current cookie
      // separatorMatch[2] is the new cookie name
      // separatorMatch[3] is the new cookie value

      if (current) {
        current += "; "
      }
      current += separatorMatch[1]
      cookies.push(current.trim())

      // Start new cookie
      current = `${separatorMatch[2]}=${separatorMatch[3]}`
    } else {
      // Regular part, append to current cookie
      if (current) {
        current += "; "
      }
      current += part
    }
  }

  if (current) {
    cookies.push(current.trim())
  }

  return cookies
}

// Helper to create mock NextRequest
function createMockRequest(url: string, options?: RequestInit) {
  const urlObj = new URL(url)
  const req = new Request(url, options) as any
  req.nextUrl = urlObj
  req.headers.get = (name: string) => {
    if (name === "origin") return DOMAINS.BRIDGE_PROD
    return null
  }
  return req
}

describe("POST /api/login-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set default test environment
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BRIDGE_PASSCODE", "wachtwoord")
    vi.stubEnv("BRIDGE_ENV", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /**
   * VALID PASSCODE TEST (PRODUCTION)
   * Should authenticate successfully with correct passcode
   */
  it("should authenticate successfully with valid passcode", async () => {
    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "wachtwoord" }),
    })

    const res = await loginManagerPOST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.requestId).toBeDefined()

    // Check manager_session cookie is set
    const setCookie = res.headers.get("set-cookie")
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain(`${COOKIE_NAMES.MANAGER_SESSION}=`)
    // Verify token is not the old insecure "1"
    expect(setCookie).not.toContain(`${COOKIE_NAMES.MANAGER_SESSION}=1`)
    // Verify token exists and is base64url format (alphanumeric + - _)
    const tokenMatch = setCookie?.match(new RegExp(`${COOKIE_NAMES.MANAGER_SESSION}=([A-Za-z0-9_-]+)`))
    expect(tokenMatch).toBeTruthy()
    expect(tokenMatch![1].length).toBeGreaterThan(20) // At least 20 chars
    expect(setCookie).toContain("HttpOnly")
    // Case-insensitive check for SameSite
    // In production: samesite=none (for cross-origin iframe support)
    // In development: samesite=lax
    expect(setCookie?.toLowerCase()).toMatch(/samesite=(lax|none)/)
  })

  /**
   * INVALID PASSCODE TEST
   * Should reject authentication with wrong passcode
   */
  it("should reject invalid passcode with proper error code", async () => {
    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "wrong_password" }),
    })

    const res = await loginManagerPOST(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.ok).toBe(false)
    expect(json.error).toBe(ErrorCodes.INVALID_CREDENTIALS)
    expect(json.message).toBeDefined()
    expect(json.requestId).toBeDefined()

    // Should NOT set cookie
    const setCookie = res.headers.get("set-cookie")
    expect(setCookie).toBeNull()
  })

  /**
   * MISSING PASSCODE TEST
   * Should validate request body and reject empty passcode
   */
  it("should reject missing passcode with validation error", async () => {
    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const res = await loginManagerPOST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.ok).toBe(false)
    expect(json.error).toBe(ErrorCodes.INVALID_REQUEST)
    expect(json.details?.issues).toBeDefined()
  })

  /**
   * EMPTY PASSCODE TEST
   * Should reject empty string passcode
   */
  it("should reject empty passcode", async () => {
    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "" }),
    })

    const res = await loginManagerPOST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.ok).toBe(false)
    expect(json.error).toBe(ErrorCodes.INVALID_REQUEST)
  })

  /**
   * TEST MODE AUTHENTICATION
   * Should accept "test" passcode when BRIDGE_ENV=local
   */
  it("should authenticate with test passcode in local mode", async () => {
    vi.stubEnv("BRIDGE_ENV", "local")

    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "test" }),
    })

    const res = await loginManagerPOST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)

    // Check manager_session cookie is set with secure token (not the test value "1")
    const setCookie = res.headers.get("set-cookie")
    expect(setCookie).toContain(`${COOKIE_NAMES.MANAGER_SESSION}=`)
    expect(setCookie).not.toContain(`${COOKIE_NAMES.MANAGER_SESSION}=1;`) // Should not be exactly "1"
    expect(setCookie).not.toContain(`${COOKIE_NAMES.MANAGER_SESSION}=1 `) // Alternative format check
  })

  /**
   * TEST MODE SHOULD NOT WORK IN PRODUCTION
   * Test passcode should be rejected when not in local mode
   */
  it("should reject test passcode in production mode", async () => {
    vi.stubEnv("BRIDGE_ENV", "")
    vi.stubEnv("NODE_ENV", "production")

    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "test" }),
    })

    const res = await loginManagerPOST(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.ok).toBe(false)
    expect(json.error).toBe(ErrorCodes.INVALID_CREDENTIALS)
  })

  /**
   * MISSING ENVIRONMENT VARIABLE TEST
   * Should fail gracefully if BRIDGE_PASSCODE not set
   */
  it("should reject all passcodes if BRIDGE_PASSCODE not set", async () => {
    process.env.BRIDGE_PASSCODE = undefined

    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "any_password" }),
    })

    const res = await loginManagerPOST(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.ok).toBe(false)
    expect(json.error).toBe(ErrorCodes.INVALID_CREDENTIALS)
  })

  /**
   * COOKIE CONFIGURATION CONSISTENCY TEST (PRODUCTION)
   * Manager login cookie should match logout cookie attributes
   */
  it("should set manager cookie with attributes matching logout (PRODUCTION)", async () => {
    vi.stubEnv("NODE_ENV", "production")

    // Get login cookie config
    const loginReq = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "wachtwoord" }),
    })

    const loginRes = await loginManagerPOST(loginReq)
    const loginSetCookie = loginRes.headers.get("set-cookie")

    if (!loginSetCookie) {
      throw new Error("Manager login didn't set cookie")
    }

    const loginCookie = parseCookieHeader(loginSetCookie)

    // Get logout cookie config
    const logoutReq = createMockRequest("http://localhost/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    const logoutRes = await logoutPOST(logoutReq)
    const logoutSetCookie = logoutRes.headers.get("set-cookie")

    if (!logoutSetCookie) {
      throw new Error("Logout didn't set cookies")
    }

    const logoutCookieStrings = splitSetCookieHeaders(logoutSetCookie)
    const logoutCookies = logoutCookieStrings.map(parseCookieHeader)
    const managerCookie = logoutCookies.find(c => c.name === COOKIE_NAMES.MANAGER_SESSION)

    if (!managerCookie) {
      throw new Error(`Logout didn't clear ${COOKIE_NAMES.MANAGER_SESSION}`)
    }

    // Assert cookie attributes match (except value)
    expect(loginCookie.name).toBe(managerCookie.name)
    expect(loginCookie.httpOnly).toBe(managerCookie.httpOnly)
    expect(loginCookie.secure).toBe(managerCookie.secure) // CRITICAL
    expect(loginCookie.sameSite).toBe(managerCookie.sameSite) // CRITICAL
    expect(loginCookie.path).toBe(managerCookie.path)

    // Login should set a secure token (not "1")
    expect(loginCookie.value).not.toBe("1")
    expect(loginCookie.value.length).toBeGreaterThan(20)

    // Logout should clear value
    expect(managerCookie.value).toBe("")
  })

  /**
   * COOKIE CONFIGURATION CONSISTENCY TEST (DEVELOPMENT)
   * Same test for development environment
   */
  it("should set manager cookie with attributes matching logout (DEVELOPMENT)", async () => {
    vi.stubEnv("NODE_ENV", "development")

    const loginReq = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "wachtwoord" }),
    })

    const loginRes = await loginManagerPOST(loginReq)
    const loginSetCookie = loginRes.headers.get("set-cookie")

    if (!loginSetCookie) {
      throw new Error("Manager login didn't set cookie")
    }

    const loginCookie = parseCookieHeader(loginSetCookie)

    // Get logout cookie
    const logoutReq = createMockRequest("http://localhost/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    const logoutRes = await logoutPOST(logoutReq)
    const logoutSetCookie = logoutRes.headers.get("set-cookie")

    if (!logoutSetCookie) {
      throw new Error("Logout didn't set cookies")
    }

    const logoutCookieStrings = splitSetCookieHeaders(logoutSetCookie)
    const logoutCookies = logoutCookieStrings.map(parseCookieHeader)
    const managerCookie = logoutCookies.find(c => c.name === COOKIE_NAMES.MANAGER_SESSION)

    if (!managerCookie) {
      throw new Error(`Logout didn't clear ${COOKIE_NAMES.MANAGER_SESSION}`)
    }

    // Assert attributes match
    expect(loginCookie.httpOnly).toBe(managerCookie.httpOnly)
    expect(loginCookie.secure).toBe(managerCookie.secure)
    expect(loginCookie.sameSite).toBe(managerCookie.sameSite)
    expect(loginCookie.path).toBe(managerCookie.path)
  })

  /**
   * SECURE FLAG TEST
   * In deployed server: secure=true, in local dev: secure=false
   * Cookie implementation uses BRIDGE_ENV (not NODE_ENV)
   */
  it("should set secure flag based on BRIDGE_ENV", async () => {
    // Deployed server (BRIDGE_ENV !== "local"): secure should be TRUE
    vi.stubEnv("BRIDGE_ENV", "production")
    let req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "wachtwoord" }),
    })
    let res = await loginManagerPOST(req)
    let setCookie = res.headers.get("set-cookie")
    expect(setCookie).toContain("Secure")

    // Local development (BRIDGE_ENV === "local"): secure should be FALSE
    vi.stubEnv("BRIDGE_ENV", "local")
    req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "wachtwoord" }),
    })
    res = await loginManagerPOST(req)
    setCookie = res.headers.get("set-cookie")
    expect(setCookie).not.toContain("Secure")
  })

  /**
   * CORS HEADERS TEST
   * Should include CORS headers in response
   */
  it("should include CORS headers", async () => {
    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: "wachtwoord" }),
    })

    const res = await loginManagerPOST(req)

    // Check for CORS headers (added by addCorsHeaders)
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(true)
  })

  /**
   * MALFORMED JSON TEST
   * Should handle malformed JSON gracefully
   */
  it("should handle malformed JSON", async () => {
    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{",
    })

    const res = await loginManagerPOST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.ok).toBe(false)
  })
})

describe("OPTIONS /api/login-manager", () => {
  /**
   * CORS PREFLIGHT TEST
   * OPTIONS should return 200 with CORS headers
   */
  it("should handle CORS preflight requests", async () => {
    const req = createMockRequest("http://localhost/api/login-manager", {
      method: "OPTIONS",
    })

    const res = await loginManagerOPTIONS(req)

    expect(res.status).toBe(200)
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(true)
  })
})
