// Test the shared package directly (display config lives there now)
// Using /display entry point to avoid pulling in server-only MCP code
import { getDisplayConfig, isVisibleInNormalMode, shouldAutoExpand } from "@webalive/tools/display"
import { describe, expect, it } from "vitest"

// Alias for backwards compatibility tests
const getToolConfig = getDisplayConfig

describe("tool-display-config", () => {
  describe("getToolConfig", () => {
    it("returns exact match config for Linear tools", () => {
      const config = getToolConfig("mcp__linear__create_issue")
      expect(config.autoExpand).toBe(true)
    })

    it("returns exact match config for list tools (collapsed)", () => {
      const config = getToolConfig("mcp__linear__list_issues")
      expect(config.autoExpand).toBe(false)
    })

    it("is case-insensitive", () => {
      const config = getToolConfig("MCP__LINEAR__CREATE_ISSUE")
      expect(config.autoExpand).toBe(true)
    })

    it("matches wildcard patterns for Stripe", () => {
      const config = getToolConfig("mcp__stripe__create_customer")
      expect(config.autoExpand).toBe(true)
    })

    it("matches wildcard patterns for Stripe lists", () => {
      const config = getToolConfig("mcp__stripe__list_subscriptions")
      expect(config.autoExpand).toBe(false)
    })

    it("returns default config for unknown tools", () => {
      const config = getToolConfig("some__unknown__tool")
      expect(config.autoExpand).toBe(false)
      expect(config.visibleInNormalMode).toBe(true)
    })

    it("returns config for file operations", () => {
      // All file operations are collapsed by default (routine operations)
      expect(getToolConfig("write").autoExpand).toBe(false)
      expect(getToolConfig("edit").autoExpand).toBe(false)
      expect(getToolConfig("read").autoExpand).toBe(false)
    })
  })

  describe("shouldAutoExpand", () => {
    it("returns config value for errors (errors stay collapsed)", () => {
      // Linear list_issues is configured as autoExpand: false - stays collapsed even on error
      expect(shouldAutoExpand("mcp__linear__list_issues", true)).toBe(false)
      // Unknown tool defaults to collapsed
      expect(shouldAutoExpand("unknown_tool", true)).toBe(false)
    })

    it("returns config value when not an error", () => {
      expect(shouldAutoExpand("mcp__linear__create_issue", false)).toBe(true)
      expect(shouldAutoExpand("mcp__linear__list_issues", false)).toBe(false)
    })

    it("returns false for unknown tools when not an error", () => {
      expect(shouldAutoExpand("some__random__tool", false)).toBe(false)
    })
  })

  describe("isVisibleInNormalMode", () => {
    it("returns true for all current tools (none are debug-only yet)", () => {
      expect(isVisibleInNormalMode("mcp__linear__create_issue")).toBe(true)
      expect(isVisibleInNormalMode("mcp__stripe__list_customers")).toBe(true)
      expect(isVisibleInNormalMode("unknown_tool")).toBe(true)
    })
  })

  describe("pattern matching edge cases", () => {
    it("exact match takes precedence over pattern", () => {
      // If we had both exact and pattern, exact should win
      // Linear has exact matches, not patterns
      const config = getToolConfig("mcp__linear__create_issue")
      expect(config.autoExpand).toBe(true)
    })

    it("handles tools with special regex characters", () => {
      // Tool names shouldn't have these, but test defensively
      const config = getToolConfig("tool.with.dots")
      expect(config).toBeDefined()
      expect(config.autoExpand).toBe(false) // default
    })

    it("wildcard matches any suffix", () => {
      // mcp__stripe__create_* should match various create operations
      expect(getToolConfig("mcp__stripe__create_x").autoExpand).toBe(true)
      expect(getToolConfig("mcp__stripe__create_customer").autoExpand).toBe(true)
      expect(getToolConfig("mcp__stripe__create_subscription").autoExpand).toBe(true)
    })
  })
})
