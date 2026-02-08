import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { COOKIE_NAMES } from "@webalive/shared"

/**
 * BRIDGE API CLIENT SECRET HEADER TESTS
 *
 * These tests verify that the stream-api-client correctly includes
 * the INTERNAL_TOOLS_SECRET header for internal-tools API calls.
 *
 * Critical security checks:
 * 1. Secret header added for /api/internal-tools/* endpoints
 * 2. Secret header NOT added for other endpoints (security leak)
 * 3. Secret read from environment variable
 * 4. Missing secret handled gracefully
 */

// Store original env
const originalPort = process.env.PORT
const originalSecret = process.env.INTERNAL_TOOLS_SECRET
const originalSessionCookie = process.env.ALIVE_SESSION_COOKIE
const _originalValidate = global.validateWorkspacePath

// Mock workspace validator to bypass path validation for these tests
vi.mock("../src/lib/workspace-validator.js", () => ({
  validateWorkspacePath: vi.fn(), // No-op, allows all paths
}))

import { callBridgeApi } from "../src/lib/api-client.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch as any

describe("callBridgeApi - Internal Tools Secret Header", () => {
  beforeEach(() => {
    process.env.PORT = "1234" // Fake port for tests (fetch is mocked)
    process.env.INTERNAL_TOOLS_SECRET = "test-secret-xyz"
    process.env.ALIVE_SESSION_COOKIE = "test-session-abc"
    mockFetch.mockClear()

    // Default mock response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: "Success" }),
    })
  })

  afterEach(() => {
    if (originalPort !== undefined) {
      process.env.PORT = originalPort
    } else {
      delete process.env.PORT
    }
    process.env.INTERNAL_TOOLS_SECRET = originalSecret
    process.env.ALIVE_SESSION_COOKIE = originalSessionCookie
    vi.clearAllMocks()
  })

  /**
   * THE MISSING SECRET HEADER BUG TEST
   * Internal tools endpoints MUST include X-Internal-Tools-Secret header
   */
  it("should include secret header for internal-tools endpoints (THE MISSING HEADER BUG)", async () => {
    await callBridgeApi({
      endpoint: "/api/internal-tools/read-logs",
      body: { workspace: "test.com", workspaceRoot: "/srv/webalive/sites/test.com/user" },
    })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [_, options] = mockFetch.mock.calls[0]

    expect(options.headers).toHaveProperty("X-Internal-Tools-Secret")
    expect(options.headers["X-Internal-Tools-Secret"]).toBe("test-secret-xyz")

    // If this test FAILS, internal tools API calls will be rejected (401)
  })

  /**
   * THE SECRET LEAK BUG TEST
   * Non-internal-tools endpoints should NOT include secret header
   * This prevents leaking the secret to external/non-privileged APIs
   */
  it("should NOT include secret for non-internal-tools endpoints (THE SECRET LEAK BUG)", async () => {
    const regularEndpoints = [
      "/api/restart-workspace",
      "/api/verify",
      "/api/files",
      "/api/deploy",
      "/api/some-other-endpoint",
    ]

    for (const endpoint of regularEndpoints) {
      mockFetch.mockClear()
      await callBridgeApi({
        endpoint,
        body: { workspaceRoot: "/srv/webalive/sites/test.com/user" },
      })

      const [_, options] = mockFetch.mock.calls[0]

      expect(options.headers).not.toHaveProperty("X-Internal-Tools-Secret")

      // If this test FAILS, we leak the secret to non-privileged endpoints
    }
  })

  /**
   * THE SESSION COOKIE ALWAYS INCLUDED BUG TEST
   * Session cookie should be included for ALL endpoints (not just internal-tools)
   */
  it("should include session cookie for all endpoints (THE MISSING SESSION BUG)", async () => {
    const allEndpoints = ["/api/internal-tools/read-logs", "/api/restart-workspace", "/api/verify", "/api/files"]

    for (const endpoint of allEndpoints) {
      mockFetch.mockClear()
      await callBridgeApi({
        endpoint,
        body: { workspaceRoot: "/srv/webalive/sites/test.com/user" },
      })

      const [_, options] = mockFetch.mock.calls[0]

      expect(options.headers).toHaveProperty("Cookie")
      expect(options.headers.Cookie).toBe(`${COOKIE_NAMES.SESSION}=test-session-abc`)

      // If this test FAILS, some endpoints won't have authentication
    }
  })

  /**
   * THE MISSING ENV SECRET BUG TEST
   * If INTERNAL_TOOLS_SECRET is not set, should still make call (without header)
   * API will reject it, but client shouldn't crash
   */
  it("should handle missing env secret gracefully (THE MISSING ENV SECRET BUG)", async () => {
    delete process.env.INTERNAL_TOOLS_SECRET

    await callBridgeApi({
      endpoint: "/api/internal-tools/read-logs",
      body: { workspace: "test.com", workspaceRoot: "/srv/webalive/sites/test.com/user" },
    })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [_, options] = mockFetch.mock.calls[0]

    expect(options.headers).not.toHaveProperty("X-Internal-Tools-Secret")

    // If this test FAILS (throws error), missing env secret crashes MCP tools
  })

  /**
   * THE EMPTY SECRET BUG TEST
   * Empty string secret should NOT be sent as header
   */
  it("should not send empty secret header (THE EMPTY SECRET BUG)", async () => {
    process.env.INTERNAL_TOOLS_SECRET = ""

    await callBridgeApi({
      endpoint: "/api/internal-tools/read-logs",
      body: { workspace: "test.com", workspaceRoot: "/srv/webalive/sites/test.com/user" },
    })

    const [_, options] = mockFetch.mock.calls[0]

    expect(options.headers).not.toHaveProperty("X-Internal-Tools-Secret")

    // If this test FAILS, we send empty header (might bypass validation)
  })

  /**
   * THE ENDPOINT DETECTION BUG TEST
   * Various internal-tools paths should all trigger secret header
   */
  it("should detect all internal-tools paths (THE DETECTION BUG)", async () => {
    const internalToolsPaths = [
      "/api/internal-tools/read-logs",
      "/api/internal-tools/some-other-tool",
      "/api/internal-tools/nested/path",
      "/api/internal-tools/",
    ]

    for (const endpoint of internalToolsPaths) {
      mockFetch.mockClear()
      await callBridgeApi({
        endpoint,
        body: { test: "data" },
      })

      const [_, options] = mockFetch.mock.calls[0]

      expect(options.headers).toHaveProperty("X-Internal-Tools-Secret")
      expect(options.headers["X-Internal-Tools-Secret"]).toBe("test-secret-xyz")

      // If this test FAILS for any path, that internal tool won't work
    }
  })

  /**
   * THE FALSE POSITIVE DETECTION BUG TEST
   * Paths containing "internal-tools" but not at the right position
   * should NOT trigger secret header
   */
  it("should not false-positive on internal-tools substring (THE FALSE POSITIVE BUG)", async () => {
    const nonInternalToolsPaths = [
      "/api/some-internal-tools-copy",
      "/api/data/internal-tools",
      "/internal-tools/api/endpoint",
      "/api/internal-toolsX",
    ]

    for (const endpoint of nonInternalToolsPaths) {
      mockFetch.mockClear()
      await callBridgeApi({
        endpoint,
        body: { test: "data" },
      })

      const [_, options] = mockFetch.mock.calls[0]

      expect(options.headers).not.toHaveProperty("X-Internal-Tools-Secret")

      // If this test FAILS, we leak secret to wrong endpoints
    }
  })

  /**
   * THE HEADER COMBINATION BUG TEST
   * Both session cookie AND secret header should be present for internal-tools
   */
  it("should include both session and secret for internal-tools (THE COMBINATION BUG)", async () => {
    await callBridgeApi({
      endpoint: "/api/internal-tools/read-logs",
      body: { workspace: "test.com", workspaceRoot: "/srv/webalive/sites/test.com/user" },
    })

    const [_, options] = mockFetch.mock.calls[0]

    expect(options.headers).toHaveProperty("Cookie")
    expect(options.headers).toHaveProperty("X-Internal-Tools-Secret")
    expect(options.headers.Cookie).toBe(`${COOKIE_NAMES.SESSION}=test-session-abc`)
    expect(options.headers["X-Internal-Tools-Secret"]).toBe("test-secret-xyz")

    // If this test FAILS, we're missing one of the required headers
  })
})

/**
 * PORT ENVIRONMENT VARIABLE VALIDATION TESTS
 *
 * These tests verify defensive validation of the PORT environment variable.
 * The PORT must be a valid integer between 1 and 65535.
 *
 * Critical security/robustness checks:
 * 1. PORT must exist (explicit error)
 * 2. PORT must be parseable as integer
 * 3. PORT must be finite (not NaN, Infinity)
 * 4. PORT must be in valid range (1-65535)
 * 5. Whitespace should be trimmed before parsing
 */
describe("callBridgeApi - PORT Environment Variable Validation", () => {
  beforeEach(() => {
    process.env.ALIVE_SESSION_COOKIE = "test-session"
    mockFetch.mockClear()

    // Default mock response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: "Success" }),
    })
  })

  afterEach(() => {
    if (originalPort !== undefined) {
      process.env.PORT = originalPort
    } else {
      delete process.env.PORT
    }
    process.env.ALIVE_SESSION_COOKIE = originalSessionCookie
    vi.clearAllMocks()
  })

  /**
   * THE MISSING PORT BUG TEST
   * Missing PORT should return error result
   */
  it("should return error when PORT is undefined (THE MISSING PORT BUG)", async () => {
    delete process.env.PORT

    const result = await callBridgeApi({
      endpoint: "/api/test",
      body: {},
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      "Invalid PORT environment variable: must be an integer between 1 and 65535",
    )
  })

  /**
   * THE EMPTY PORT BUG TEST
   * Empty string PORT should return error
   */
  it("should return error when PORT is empty string (THE EMPTY PORT BUG)", async () => {
    process.env.PORT = ""

    const result = await callBridgeApi({
      endpoint: "/api/test",
      body: {},
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      "Invalid PORT environment variable: must be an integer between 1 and 65535",
    )
  })

  /**
   * THE WHITESPACE-ONLY PORT BUG TEST
   * Whitespace-only PORT should return error
   */
  it("should return error when PORT is whitespace-only (THE WHITESPACE PORT BUG)", async () => {
    process.env.PORT = "   "

    const result = await callBridgeApi({
      endpoint: "/api/test",
      body: {},
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      "Invalid PORT environment variable: must be an integer between 1 and 65535",
    )
  })

  /**
   * THE NON-NUMERIC PORT BUG TEST
   * Non-numeric PORT should return error
   */
  it("should return error when PORT is non-numeric (THE NON-NUMERIC PORT BUG)", async () => {
    const invalidPorts = ["abc", "port3000", "3000port", "3.14.15", "0x1234", "NaN", "Infinity"]

    for (const port of invalidPorts) {
      process.env.PORT = port

      const result = await callBridgeApi({
        endpoint: "/api/test",
        body: {},
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain(
        "Invalid PORT environment variable: must be an integer between 1 and 65535",
      )
    }
  })

  /**
   * THE PORT OUT OF RANGE BUG TEST
   * PORT must be between 1 and 65535
   */
  it("should return error when PORT is out of valid range (THE RANGE BUG)", async () => {
    const invalidPorts = ["0", "-1", "-3000", "65536", "99999", "100000"]

    for (const port of invalidPorts) {
      process.env.PORT = port

      const result = await callBridgeApi({
        endpoint: "/api/test",
        body: {},
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain(
        "Invalid PORT environment variable: must be an integer between 1 and 65535",
      )
    }
  })

  /**
   * THE DECIMAL PORT BUG TEST
   * Decimal numbers should be rejected (not truncated)
   */
  it("should return error when PORT has decimal value (THE DECIMAL BUG)", async () => {
    const decimalPorts = ["3000.5", "3000.0", "8080.99"]

    for (const port of decimalPorts) {
      process.env.PORT = port

      const result = await callBridgeApi({
        endpoint: "/api/test",
        body: {},
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain(
        "Invalid PORT environment variable: must be an integer between 1 and 65535",
      )
    }
  })

  /**
   * THE WHITESPACE TRIMMING SUCCESS TEST
   * PORT with leading/trailing whitespace should work after trimming
   */
  it("should trim whitespace from PORT value (THE WHITESPACE TRIMMING SUCCESS)", async () => {
    const portsWithWhitespace = ["  3000", "3000  ", "  3000  ", "\t3000\n", " \t 8080 \n "]

    for (const port of portsWithWhitespace) {
      mockFetch.mockClear()
      process.env.PORT = port

      await callBridgeApi({
        endpoint: "/api/test",
        body: {},
      })

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url] = mockFetch.mock.calls[0]

      // Should use trimmed port value
      const expectedPort = port.trim()
      expect(url).toMatch(new RegExp(`http://localhost:${expectedPort}/`))
    }
  })

  /**
   * THE VALID PORT RANGES TEST
   * All valid port numbers should work
   */
  it("should accept all valid port numbers (THE VALID RANGE SUCCESS)", async () => {
    const validPorts = ["1", "80", "443", "3000", "8080", "8888", "65535"]

    for (const port of validPorts) {
      mockFetch.mockClear()
      process.env.PORT = port

      await callBridgeApi({
        endpoint: "/api/test",
        body: {},
      })

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url] = mockFetch.mock.calls[0]

      expect(url).toBe(`http://localhost:${port}/api/test`)
    }
  })

  /**
   * THE URL FORMAT PRESERVATION TEST
   * Ensure validation doesn't change the URL format
   */
  it("should preserve URL format after validation (THE URL FORMAT TEST)", async () => {
    process.env.PORT = "3000"

    await callBridgeApi({
      endpoint: "/api/test",
      body: {},
    })

    const [url] = mockFetch.mock.calls[0]

    // Exact format: http://localhost:{port}{endpoint}
    expect(url).toBe("http://localhost:3000/api/test")
    expect(url).toMatch(/^http:\/\/localhost:\d+\/api\//)

    // Should NOT have trailing slashes, extra formatting, etc
    expect(url).not.toContain("//api")
    expect(url).not.toMatch(/:\d+\/\//)
  })

  /**
   * THE INFINITY AND NAN BUG TEST
   * Infinity and NaN string values should be rejected
   */
  it("should reject Infinity and NaN values (THE INFINITY/NAN BUG)", async () => {
    const specialValues = ["Infinity", "-Infinity", "NaN", "+Infinity"]

    for (const value of specialValues) {
      process.env.PORT = value

      const result = await callBridgeApi({
        endpoint: "/api/test",
        body: {},
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain(
        "Invalid PORT environment variable: must be an integer between 1 and 65535",
      )
    }
  })
})

// Note: Workspace path validation is tested separately in workspace-validator.test.ts
// We mock it here to focus on testing the secret header logic

/**
 * COOKIE NAME AUTHENTICATION BUG TESTS
 *
 * BUG HISTORY (2025-11-21):
 * MCP tools were hardcoding cookie name as "session" instead of importing
 * COOKIE_NAMES.SESSION ("auth_session_v3") from the shared package.
 *
 * Result: Tools sent `Cookie: session=<JWT>` but API expected `Cookie: auth_session_v3=<JWT>`
 * This caused all tool API calls to fail with 401 Unauthorized.
 *
 * SOLUTION:
 * - Import COOKIE_NAMES from @webalive/shared (single source of truth)
 * - Use COOKIE_NAMES.SESSION in header construction
 * - These tests prevent regression by verifying correct cookie name usage
 */
describe("callBridgeApi - Cookie Name Authentication (THE COOKIE NAME BUG)", () => {
  beforeEach(() => {
    process.env.PORT = "1234" // Fake port for tests (fetch is mocked)
    process.env.ALIVE_SESSION_COOKIE = "jwt-token-123"
    mockFetch.mockClear()

    // Default mock response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: "Success" }),
    })
  })

  afterEach(() => {
    if (originalPort !== undefined) {
      process.env.PORT = originalPort
    } else {
      delete process.env.PORT
    }
    process.env.ALIVE_SESSION_COOKIE = originalSessionCookie
    vi.clearAllMocks()
  })

  /**
   * THE COOKIE NAME BUG - Primary regression test
   * Cookie header MUST use "auth_session_v3" not "session"
   */
  it("should use 'auth_session' cookie name from shared constant, not hardcoded 'session'", async () => {
    await callBridgeApi({
      endpoint: "/api/restart-workspace",
      body: { workspaceRoot: "/srv/webalive/sites/test.com/user" },
    })

    const [_, options] = mockFetch.mock.calls[0]

    // CRITICAL: Must be "auth_session_v3" (from COOKIE_NAMES.SESSION)
    expect(options.headers.Cookie).toBe(`${COOKIE_NAMES.SESSION}=jwt-token-123`)

    // CRITICAL: Must NOT start with the old hardcoded "session=" pattern
    expect(options.headers.Cookie).not.toMatch(/^session=/)
    expect(options.headers.Cookie).toMatch(/^auth_session_v3=/)

    // If this test FAILS, MCP tools will fail with 401 Unauthorized
  })

  /**
   * Verify cookie name matches the shared constant value
   */
  it("should use COOKIE_NAMES.SESSION constant value (auth_session)", async () => {
    await callBridgeApi({
      endpoint: "/api/test",
      body: {},
    })

    const [_, options] = mockFetch.mock.calls[0]

    // Extract cookie name from header "auth_session_v3=value"
    const cookieName = options.headers.Cookie?.split("=")[0]

    expect(cookieName).toBe(COOKIE_NAMES.SESSION)
    expect(cookieName).toBe("auth_session_v3")
  })

  /**
   * Verify cookie format is exactly "auth_session_v3=<value>" with no spaces
   */
  it("should format cookie header correctly without extra spaces", async () => {
    await callBridgeApi({
      endpoint: "/api/test",
      body: {},
    })

    const [_, options] = mockFetch.mock.calls[0]

    // Exact format check
    expect(options.headers.Cookie).toBe("auth_session_v3=jwt-token-123")
    expect(options.headers.Cookie).not.toContain(" ")

    // Regex validation: name=value with no spaces
    expect(options.headers.Cookie).toMatch(/^[a-z0-9_]+=[a-zA-Z0-9._-]+$/)
  })

  /**
   * Test with different JWT values to ensure format is preserved
   */
  it("should preserve cookie format with various JWT tokens", async () => {
    const testTokens = [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ",
      "short-token",
      "token.with.dots",
      "token-with-dashes",
      "token_with_underscores",
    ]

    for (const token of testTokens) {
      mockFetch.mockClear()
      process.env.ALIVE_SESSION_COOKIE = token

      await callBridgeApi({ endpoint: "/api/test", body: {} })

      const [_, options] = mockFetch.mock.calls[0]
      expect(options.headers.Cookie).toBe(`auth_session_v3=${token}`)
    }
  })

  /**
   * Verify cookie is included for all endpoint types
   */
  it("should include auth_session cookie for all API endpoints", async () => {
    const endpoints = [
      "/api/restart-workspace",
      "/api/internal-tools/read-logs",
      "/api/verify",
      "/api/files/read",
      "/api/deploy",
    ]

    for (const endpoint of endpoints) {
      mockFetch.mockClear()
      await callBridgeApi({ endpoint, body: { workspaceRoot: "/srv/webalive/sites/test.com/user" } })

      const [_, options] = mockFetch.mock.calls[0]

      expect(options.headers.Cookie).toBeDefined()
      expect(options.headers.Cookie).toBe(`${COOKIE_NAMES.SESSION}=jwt-token-123`)
      expect(options.headers.Cookie).toMatch(/^auth_session_v3=/) // Must start with auth_session_v3=

      // If this fails for ANY endpoint, that endpoint won't authenticate
    }
  })

  /**
   * Verify graceful handling when session cookie is missing
   */
  it("should omit Cookie header when ALIVE_SESSION_COOKIE is undefined", async () => {
    delete process.env.ALIVE_SESSION_COOKIE

    await callBridgeApi({
      endpoint: "/api/test",
      body: {},
    })

    const [_, options] = mockFetch.mock.calls[0]

    expect(options.headers.Cookie).toBeUndefined()

    // Should not crash or send malformed cookie
  })

  /**
   * Verify empty cookie value is handled gracefully
   */
  it("should omit Cookie header when ALIVE_SESSION_COOKIE is empty string", async () => {
    process.env.ALIVE_SESSION_COOKIE = ""

    await callBridgeApi({
      endpoint: "/api/test",
      body: {},
    })

    const [_, options] = mockFetch.mock.calls[0]

    expect(options.headers.Cookie).toBeUndefined()

    // Empty cookie should not be sent
  })

  /**
   * Verify cookie header is combined correctly with other headers
   */
  it("should include cookie alongside other headers without conflict", async () => {
    process.env.INTERNAL_TOOLS_SECRET = "secret-123"

    await callBridgeApi({
      endpoint: "/api/internal-tools/test",
      body: {},
    })

    const [_, options] = mockFetch.mock.calls[0]

    // All headers should coexist
    expect(options.headers["Content-Type"]).toBe("application/json")
    expect(options.headers.Cookie).toBe("auth_session_v3=jwt-token-123")
    expect(options.headers["X-Internal-Tools-Secret"]).toBe("secret-123")

    // Verify cookie doesn't interfere with other headers
    expect(Object.keys(options.headers)).toContain("Cookie")
    expect(Object.keys(options.headers)).toContain("Content-Type")
    expect(Object.keys(options.headers)).toContain("X-Internal-Tools-Secret")
  })
})
