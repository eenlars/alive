/**
 * Critical Exports Test
 *
 * Verifies that key exports from @webalive/shared haven't been removed or renamed.
 * AI agents love to "clean up" exports - this catches that.
 */
import { describe, expect, it } from "vitest"

describe("@webalive/shared exports", () => {
  it("exports critical constants", async () => {
    const shared = await import("@webalive/shared")

    // Cookie names - used everywhere for auth
    expect(shared.COOKIE_NAMES).toBeDefined()
    expect(shared.COOKIE_NAMES.SESSION).toBe("auth_session_v2")

    // Paths - used for file operations
    expect(shared.PATHS).toBeDefined()
    expect(shared.PATHS.SITES_ROOT).toBe("/srv/webalive/sites")

    // Domains - used for routing
    expect(shared.DOMAINS).toBeDefined()
    expect(typeof shared.DOMAINS.MAIN_SUFFIX).toBe("string")
  })

  it("exports Claude models", async () => {
    const shared = await import("@webalive/shared")

    expect(shared.CLAUDE_MODELS).toBeDefined()
    expect(shared.DEFAULT_CLAUDE_MODEL).toBeDefined()
    expect(shared.isValidClaudeModel).toBeInstanceOf(Function)

    // At least one model should exist
    const models = Object.values(shared.CLAUDE_MODELS)
    expect(models.length).toBeGreaterThan(0)
  })

  it("exports security functions", async () => {
    const shared = await import("@webalive/shared")

    // Path security - critical for preventing traversal attacks
    expect(shared.isPathWithinWorkspace).toBeInstanceOf(Function)
    expect(shared.resolveAndValidatePath).toBeInstanceOf(Function)
  })

  it("exports stream tool configuration", async () => {
    const shared = await import("@webalive/shared")

    // Tools allowed in stream - security boundary
    expect(shared.STREAM_ALLOWED_SDK_TOOLS).toBeDefined()
    expect(Array.isArray(shared.STREAM_ALLOWED_SDK_TOOLS)).toBe(true)
    expect(shared.STREAM_ALLOWED_SDK_TOOLS.length).toBeGreaterThan(0)

    // Must include basic file operations
    expect(shared.STREAM_ALLOWED_SDK_TOOLS).toContain("Read")
    expect(shared.STREAM_ALLOWED_SDK_TOOLS).toContain("Write")
    expect(shared.STREAM_ALLOWED_SDK_TOOLS).toContain("Edit")
  })
})

describe("Critical auth exports", () => {
  it("exports session management functions", async () => {
    const auth = await import("@/features/auth/lib/auth")

    expect(auth.getSessionUser).toBeInstanceOf(Function)
    expect(auth.isWorkspaceAuthenticated).toBeInstanceOf(Function)
    expect(auth.requireSessionUser).toBeInstanceOf(Function)
  })

  it("exports JWT functions", async () => {
    const jwt = await import("@/features/auth/lib/jwt")

    expect(jwt.createSessionToken).toBeInstanceOf(Function)
    expect(jwt.verifySessionToken).toBeInstanceOf(Function)
  })
})
