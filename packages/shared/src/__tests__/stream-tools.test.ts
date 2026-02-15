import { describe, expect, it } from "vitest"
import { getStreamAllowedTools, getStreamDisallowedTools, isHeavyBashCommand } from "../stream-tools"

describe("isHeavyBashCommand", () => {
  it("flags known heavy monorepo commands", () => {
    expect(isHeavyBashCommand("npx tsc --noEmit --project apps/web/tsconfig.json")).toBe(true)
    expect(isHeavyBashCommand("tsc -p tsconfig.json")).toBe(true)
    expect(isHeavyBashCommand("turbo run type-check")).toBe(true)
    expect(isHeavyBashCommand("next build")).toBe(true)
    expect(isHeavyBashCommand("bun run static-check")).toBe(true)
    expect(isHeavyBashCommand('claude --print "hello"')).toBe(true)
  })

  it("flags chained commands if any segment is heavy", () => {
    expect(isHeavyBashCommand("ls && tsc -p tsconfig.json")).toBe(true)
    expect(isHeavyBashCommand("echo hi; claude --print foo")).toBe(true)
    expect(isHeavyBashCommand("echo hi | tsc --noEmit")).toBe(true)
  })

  it("flags wrapped and case-insensitive heavy commands", () => {
    expect(isHeavyBashCommand("bash -c 'tsc -p tsconfig.json'")).toBe(true)
    expect(isHeavyBashCommand("TSC -p tsconfig.json")).toBe(true)
    expect(isHeavyBashCommand("cmd && ./CLAUDE --print foo")).toBe(true)
  })

  it("returns false for empty, whitespace, and non-string inputs", () => {
    expect(isHeavyBashCommand("")).toBe(false)
    expect(isHeavyBashCommand("   ")).toBe(false)
    expect(isHeavyBashCommand(undefined)).toBe(false)
    expect(isHeavyBashCommand(null)).toBe(false)
    expect(isHeavyBashCommand(42)).toBe(false)
  })

  it("allows lightweight commands", () => {
    expect(isHeavyBashCommand("ls -la")).toBe(false)
    expect(isHeavyBashCommand("bun run test app/api/health/route.test.ts")).toBe(false)
    expect(isHeavyBashCommand("rg --files")).toBe(false)
    expect(isHeavyBashCommand("cat tsconfig.json")).toBe(false)
    expect(isHeavyBashCommand("echo claude")).toBe(false)
    expect(isHeavyBashCommand("grep claude file.txt")).toBe(false)
  })

  it("allows site-scoped commands (turbo pattern catches monorepo-wide runs)", () => {
    expect(isHeavyBashCommand("bun run build")).toBe(false)
    expect(isHeavyBashCommand("bun run lint")).toBe(false)
    expect(isHeavyBashCommand("bun run type-check")).toBe(false)
    expect(isHeavyBashCommand("npm run build")).toBe(false)
    expect(isHeavyBashCommand("npm run lint")).toBe(false)
    expect(isHeavyBashCommand("npm run type-check")).toBe(false)
    expect(isHeavyBashCommand("pnpm run build")).toBe(false)
    expect(isHeavyBashCommand("pnpm run lint")).toBe(false)
    expect(isHeavyBashCommand("yarn build")).toBe(false)
    expect(isHeavyBashCommand("yarn lint")).toBe(false)
  })
})

describe("stream tool role policy", () => {
  const enabledMcpTools = () => [
    "mcp__alive-workspace__read_file",
    "mcp__alive-tools__ping",
    "mcp__stripe__search_docs",
  ]

  it("gives member role default SDK tools and blocks admin/superadmin extras", () => {
    const allowed = getStreamAllowedTools(enabledMcpTools, false, false, false)
    const disallowed = getStreamDisallowedTools(false, false)

    expect(allowed).toContain("TodoWrite")
    expect(allowed).toContain("AskUserQuestion")
    expect(disallowed).toContain("TaskStop")
    expect(disallowed).toContain("Task")
    expect(disallowed).toContain("WebSearch")
    expect(disallowed).toContain("ExitPlanMode")
    expect(disallowed).toContain("ListMcpResources")
    expect(disallowed).toContain("ReadMcpResource")
  })

  it("gives admin role TaskStop but still blocks superadmin-only and always-blocked tools", () => {
    const allowed = getStreamAllowedTools(enabledMcpTools, true, false, false)
    const disallowed = getStreamDisallowedTools(true, false)

    expect(allowed).toContain("TaskStop")
    expect(disallowed).toContain("Task")
    expect(disallowed).toContain("WebSearch")
    expect(disallowed).toContain("ExitPlanMode")
    expect(disallowed).toContain("ListMcpResources")
    expect(disallowed).toContain("ReadMcpResource")
  })

  it("gives superadmin Task/WebSearch but still blocks always-blocked tools", () => {
    const allowed = getStreamAllowedTools(enabledMcpTools, true, true, false)
    const disallowed = getStreamDisallowedTools(true, true)

    expect(allowed).toContain("Task")
    expect(allowed).toContain("WebSearch")
    expect(allowed).toContain("TodoWrite")
    expect(allowed).toContain("AskUserQuestion")
    expect(disallowed).toContain("ExitPlanMode")
    expect(disallowed).toContain("ListMcpResources")
    expect(disallowed).toContain("ReadMcpResource")
    expect(disallowed).not.toContain("Task")
    expect(disallowed).not.toContain("WebSearch")
  })

  it("filters site-specific workspace MCP tools in superadmin workspace", () => {
    const allowed = getStreamAllowedTools(enabledMcpTools, true, true, true)

    expect(allowed).not.toContain("mcp__alive-workspace__read_file")
    expect(allowed).toContain("mcp__alive-tools__ping")
  })
})
