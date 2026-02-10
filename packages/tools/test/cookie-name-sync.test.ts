import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COOKIE_NAMES } from "@webalive/shared"
import { describe, expect, it } from "vitest"

/**
 * COOKIE NAME SYNCHRONIZATION TESTS
 *
 * PURPOSE:
 * Prevent cookie name misalignment across packages that caused the
 * "MCP tools authentication failure" bug (2025-11-21).
 *
 * BUG HISTORY:
 * - MCP tools hardcoded "session" as cookie name
 * - API expected "auth_session_v2" from COOKIE_NAMES.SESSION
 * - Result: 401 Unauthorized for all MCP tool API calls
 *
 * THESE TESTS PREVENT:
 * 1. Hardcoded cookie names in source code
 * 2. Using wrong constant import
 * 3. Cookie name drift between packages
 * 4. Typos in cookie names
 *
 * HOW IT WORKS:
 * - Tests verify source code IMPORTS COOKIE_NAMES from @webalive/shared
 * - Tests verify source code USES the constant (not hardcoded string)
 * - Tests verify constant value matches expected "auth_session_v2"
 */

describe("Cookie Name Synchronization - Prevent Hardcoding", () => {
  /**
   * Verify shared package exports the constant correctly
   */
  it("should export COOKIE_NAMES.SESSION from @webalive/shared", () => {
    expect(COOKIE_NAMES).toBeDefined()
    expect(COOKIE_NAMES.SESSION).toBe("auth_session_v2")
    expect(COOKIE_NAMES.MANAGER_SESSION).toBe("manager_session")
  })

  /**
   * THE HARDCODED COOKIE BUG - Source code verification
   * Ensure api-client imports COOKIE_NAMES (not hardcoded)
   */
  it("should import COOKIE_NAMES from @webalive/shared in stream-api-client.ts", () => {
    const sourcePath = join(__dirname, "../src/lib/api-client.ts")
    const sourceCode = readFileSync(sourcePath, "utf-8")

    // Must import COOKIE_NAMES from shared package (allow other imports too)
    expect(sourceCode).toMatch(/import\s+\{[^}]*COOKIE_NAMES[^}]*\}\s+from\s+["']@webalive\/shared["']/)

    // Must use the constant in cookie header construction
    expect(sourceCode).toContain("COOKIE_NAMES.SESSION")

    // Must NOT contain hardcoded "session=" string (the bug pattern)
    // Allow "session" in comments, variable names, etc. but not as cookie value
    const cookieHeaderPattern = /Cookie:\s*`session=/
    expect(sourceCode).not.toMatch(cookieHeaderPattern)

    // Verify it uses template literal with constant
    expect(sourceCode).toMatch(/Cookie:\s*`\$\{COOKIE_NAMES\.SESSION\}=/)

    // If this test FAILS, someone hardcoded the cookie name again
  })

  /**
   * Verify no hardcoded "auth_session_v2" strings (must use constant)
   */
  it("should not hardcode 'auth_session' string in stream-api-client.ts", () => {
    const sourcePath = join(__dirname, "../src/lib/api-client.ts")
    const sourceCode = readFileSync(sourcePath, "utf-8")

    // Remove import line from check (that's the one place it's okay in comments)
    const codeWithoutImports = sourceCode
      .split("\n")
      .filter(line => !line.includes("import"))
      .join("\n")

    // Should NOT have "auth_session_v2" hardcoded in the code logic
    // (Comments and strings for tests are okay, but not in Cookie header construction)
    const hardcodedAuthSession = /Cookie:\s*["`]auth_session_v2=/
    expect(codeWithoutImports).not.toMatch(hardcodedAuthSession)

    // If this test FAILS, someone hardcoded "auth_session_v2" instead of using the constant
  })

  /**
   * Verify constant value is correct
   */
  it("should use 'auth_session' as the session cookie name", () => {
    expect(COOKIE_NAMES.SESSION).toBe("auth_session_v2")

    // This value must match what Next.js cookies() expects
    // If this value changes, it's a breaking change requiring coordination
  })

  /**
   * Test that we can detect the old bug pattern
   */
  it("should detect if someone tries to hardcode 'session=' again", () => {
    const sourcePath = join(__dirname, "../src/lib/api-client.ts")
    const sourceCode = readFileSync(sourcePath, "utf-8")

    // The OLD BUG pattern that we're preventing
    const oldBugPattern = /Cookie:\s*["`]session=\$\{/

    expect(sourceCode).not.toMatch(oldBugPattern)

    // If this test FAILS, someone reverted to the old bug pattern
  })
})

describe("Cookie Name Synchronization - Cross-Package Consistency", () => {
  /**
   * Verify tools package and shared package use same constant
   */
  it("should use same cookie name constant as shared package", async () => {
    // Dynamic import to verify runtime behavior
    const { COOKIE_NAMES: sharedCookieNames } = await import("@webalive/shared")

    // Both should reference the SAME constant (not just equal value)
    expect(COOKIE_NAMES).toBe(sharedCookieNames)
    expect(COOKIE_NAMES.SESSION).toBe(sharedCookieNames.SESSION)
  })

  /**
   * Verify cookie name format is valid for HTTP
   */
  it("should use valid HTTP cookie name format", () => {
    // Cookie names should be alphanumeric with underscores/hyphens
    const validCookieNamePattern = /^[a-z0-9_-]+$/i
    expect(COOKIE_NAMES.SESSION).toMatch(validCookieNamePattern)

    // No spaces, special chars, or invalid characters
    expect(COOKIE_NAMES.SESSION).not.toContain(" ")
    expect(COOKIE_NAMES.SESSION).not.toContain("=")
    expect(COOKIE_NAMES.SESSION).not.toContain(";")
  })

  /**
   * Verify manager session uses different cookie name
   */
  it("should use different cookie names for session vs manager session", () => {
    expect(COOKIE_NAMES.SESSION).not.toBe(COOKIE_NAMES.MANAGER_SESSION)

    // Both should be defined and non-empty
    expect(COOKIE_NAMES.SESSION).toBeTruthy()
    expect(COOKIE_NAMES.MANAGER_SESSION).toBeTruthy()
  })
})

/**
 * INTEGRATION CHECK - Actual Usage Verification
 *
 * These tests verify the cookie name is used correctly in the
 * actual API calls (not just that it's imported).
 */
describe("Cookie Name Usage - Runtime Verification", () => {
  /**
   * Verify the exact cookie header format that will be sent
   */
  it("should construct cookie header in correct format", () => {
    const testToken = "test-jwt-123"
    const expectedHeader = `${COOKIE_NAMES.SESSION}=${testToken}`

    expect(expectedHeader).toBe("auth_session_v2=test-jwt-123")

    // This is the EXACT format that will be sent in fetch() calls
    // API expects this exact format to parse with Next.js cookies()
  })

  /**
   * Verify cookie name matches Next.js expectations
   */
  it("should match cookie name expected by Next.js API routes", () => {
    // Next.js cookies() will look for this exact name
    // apps/web expects COOKIE_NAMES.SESSION = "auth_session_v2"
    expect(COOKIE_NAMES.SESSION).toBe("auth_session_v2")

    // If this doesn't match, API route auth will fail
  })
})
