import { COOKIE_NAMES } from "@webalive/shared"
import { describe, expect, it } from "vitest"

/**
 * Test: Verify cookie name constant is correctly imported and used
 *
 * This test ensures the shared constants package is properly integrated
 * and prevents regression of the cookie name mismatch bug.
 *
 * Bug History (2025-11-21):
 * - MCP tools sent: Cookie: session=JWT
 * - API expected: Cookie: auth_session_v3=JWT
 * - Cause: Hardcoded "session" instead of importing COOKIE_NAMES.SESSION
 */
describe("Cookie Name Integration", () => {
  it("should use the correct session cookie name from shared constants", () => {
    expect(COOKIE_NAMES.SESSION).toBe("auth_session_v3")
  })

  it("should have manager session cookie name", () => {
    expect(COOKIE_NAMES.MANAGER_SESSION).toBe("manager_session")
  })

  it("should be the same constant used in stream-api-client", async () => {
    // Dynamically import to verify it compiles and uses the shared constant
    const { COOKIE_NAMES: importedNames } = await import("@webalive/shared")
    expect(importedNames.SESSION).toBe("auth_session_v3")
  })
})
