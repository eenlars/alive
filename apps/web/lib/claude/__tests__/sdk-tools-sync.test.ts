import { describe, expect, it } from "vitest"
import { ALLOWED_SDK_TOOLS, DISALLOWED_SDK_TOOLS, SDK_TOOL_NAMES } from "../sdk-tools-sync"

// Bridge-only tools that are not in the SDK but are valid in ALLOWED_SDK_TOOLS
const STREAM_ONLY_TOOLS = ["Skill", "BashOutput"]

describe("SDK Tools Sync", () => {
  describe("Array completeness", () => {
    it("should have all SDK tools categorized (allowed + disallowed = all)", () => {
      // Filter out Bridge-only tools for this check
      const allowedSDKOnly = ALLOWED_SDK_TOOLS.filter(t => !STREAM_ONLY_TOOLS.includes(t))
      const allCategorized = new Set([...allowedSDKOnly, ...DISALLOWED_SDK_TOOLS])
      const allSDK = new Set(SDK_TOOL_NAMES)

      expect(allCategorized.size).toBe(allSDK.size)

      // Check for missing tools
      const missing = SDK_TOOL_NAMES.filter(t => !allCategorized.has(t))
      expect(missing).toEqual([])
    })

    it("should not have extra tools that are not in SDK (except Bridge-only tools)", () => {
      const allSDK = new Set<string>(SDK_TOOL_NAMES)
      const streamOnly = new Set<string>(STREAM_ONLY_TOOLS)

      // Bridge-only tools are expected in allowed, not in SDK
      const extraInAllowed = ALLOWED_SDK_TOOLS.filter(t => !allSDK.has(t) && !streamOnly.has(t))
      const extraInDisallowed = DISALLOWED_SDK_TOOLS.filter(t => !allSDK.has(t))

      expect(extraInAllowed).toEqual([])
      expect(extraInDisallowed).toEqual([])
    })
  })

  describe("No overlaps", () => {
    it("should not have any tool in both allowed and disallowed", () => {
      const allowed = new Set<string>(ALLOWED_SDK_TOOLS)
      const disallowed = new Set<string>(DISALLOWED_SDK_TOOLS)

      const overlapFromAllowed = ALLOWED_SDK_TOOLS.filter(t => disallowed.has(t))
      const overlapFromDisallowed = DISALLOWED_SDK_TOOLS.filter(t => allowed.has(t))
      expect(overlapFromAllowed).toEqual([])
      expect(overlapFromDisallowed).toEqual([])
    })
  })

  describe("No duplicates", () => {
    it("should not have duplicates in ALLOWED_SDK_TOOLS", () => {
      const unique = new Set(ALLOWED_SDK_TOOLS)
      expect(unique.size).toBe(ALLOWED_SDK_TOOLS.length)
    })

    it("should not have duplicates in DISALLOWED_SDK_TOOLS", () => {
      const unique = new Set(DISALLOWED_SDK_TOOLS)
      expect(unique.size).toBe(DISALLOWED_SDK_TOOLS.length)
    })

    it("should not have duplicates in SDK_TOOL_NAMES", () => {
      const unique = new Set(SDK_TOOL_NAMES)
      expect(unique.size).toBe(SDK_TOOL_NAMES.length)
    })
  })

  describe("SDK tool count", () => {
    it("should have exactly 18 SDK tools (as of v0.2.34)", () => {
      // This test will fail if SDK adds/removes tools, prompting an update
      expect(SDK_TOOL_NAMES.length).toBe(18)
    })

    it("should have correct tool counts in categories", () => {
      // 12 SDK allowed + 2 Bridge-only compat tools (Skill + BashOutput) = 14 in ALLOWED_SDK_TOOLS
      // 6 disallowed (Task, WebSearch, ExitPlanMode, TaskStop, ListMcpResources, ReadMcpResource)
      // 12 + 6 = 18 SDK total
      const allowedSDKOnly = ALLOWED_SDK_TOOLS.filter(t => !STREAM_ONLY_TOOLS.includes(t))
      expect(ALLOWED_SDK_TOOLS.length).toBe(14) // 12 SDK + 2 Bridge-only
      expect(allowedSDKOnly.length).toBe(12) // Pure SDK tools
      expect(DISALLOWED_SDK_TOOLS.length).toBe(6)
      expect(allowedSDKOnly.length + DISALLOWED_SDK_TOOLS.length).toBe(SDK_TOOL_NAMES.length)
    })
  })

  describe("Expected tools are in correct categories", () => {
    const allowedSet = new Set<string>(ALLOWED_SDK_TOOLS)
    const disallowedSet = new Set<string>(DISALLOWED_SDK_TOOLS)
    const isAllowed = (tool: string) => allowedSet.has(tool)
    const isDisallowed = (tool: string) => disallowedSet.has(tool)

    it("should allow file operation tools", () => {
      expect(isAllowed("Read")).toBe(true)
      expect(isAllowed("Write")).toBe(true)
      expect(isAllowed("Edit")).toBe(true)
      expect(isAllowed("Glob")).toBe(true)
      expect(isAllowed("Grep")).toBe(true)
    })

    it("should allow shell execution tools (Bash/TaskOutput)", () => {
      expect(isAllowed("Bash")).toBe(true)
      expect(isAllowed("TaskOutput")).toBe(true)
      // Legacy alias for older SDK versions
      expect(isAllowed("BashOutput")).toBe(true)
    })

    it("should disallow TaskStop (admin-only)", () => {
      expect(isDisallowed("TaskStop")).toBe(true)
    })

    it("should disallow subagent spawning", () => {
      expect(isDisallowed("Task")).toBe(true)
    })

    it("should disallow web search", () => {
      expect(isDisallowed("WebSearch")).toBe(true)
    })

    it("should allow MCP execution tool", () => {
      expect(isAllowed("Mcp")).toBe(true)
    })

    it("should disallow MCP resource tools (no resources exposed)", () => {
      expect(isDisallowed("ListMcpResources")).toBe(true)
      expect(isDisallowed("ReadMcpResource")).toBe(true)
    })

    it("should allow planning/workflow tools (except ExitPlanMode which requires user approval)", () => {
      // ExitPlanMode is disallowed - Claude cannot approve its own plan
      expect(isDisallowed("ExitPlanMode")).toBe(true)
      expect(isAllowed("TodoWrite")).toBe(true)
    })

    it("should allow other safe tools", () => {
      expect(isAllowed("NotebookEdit")).toBe(true)
      expect(isAllowed("WebFetch")).toBe(true)
      expect(isAllowed("AskUserQuestion")).toBe(true)
    })
  })
})
