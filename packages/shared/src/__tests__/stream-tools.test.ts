import { describe, expect, it } from "vitest"
import {
  buildStreamToolRuntimeConfig,
  createStreamToolContext,
  getStreamAllowedTools,
  getStreamDisallowedTools,
  getStreamToolDecision,
  isHeavyBashCommand,
  isStreamClientVisibleTool,
} from "../stream-tools"

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
    "mcp__alive-workspace__check_codebase",
    "mcp__alive-tools__search_tools",
    "mcp__stripe__search_docs",
  ]

  it("gives member role default SDK tools and blocks admin/superadmin extras", () => {
    const allowed = getStreamAllowedTools(enabledMcpTools, false, false, false)
    const disallowed = getStreamDisallowedTools(false, false)

    expect(allowed).toContain("TodoWrite")
    expect(allowed).toContain("AskUserQuestion")
    expect(allowed).toContain("ListMcpResources")
    expect(allowed).toContain("ReadMcpResource")
    expect(disallowed).toContain("TaskStop")
    expect(disallowed).toContain("Task")
    expect(disallowed).toContain("WebSearch")
    expect(disallowed).toContain("ExitPlanMode")
    expect(disallowed).not.toContain("ListMcpResources")
    expect(disallowed).not.toContain("ReadMcpResource")
  })

  it("gives admin role TaskStop and hides member-only MCP resource tools", () => {
    const allowed = getStreamAllowedTools(enabledMcpTools, true, false, false)
    const disallowed = getStreamDisallowedTools(true, false)

    expect(allowed).toContain("TaskStop")
    expect(allowed).not.toContain("ListMcpResources")
    expect(allowed).not.toContain("ReadMcpResource")
    expect(disallowed).toContain("Task")
    expect(disallowed).toContain("WebSearch")
    expect(disallowed).toContain("ExitPlanMode")
  })

  it("gives superadmin Task/WebSearch but still hides member-only MCP resource tools", () => {
    const allowed = getStreamAllowedTools(enabledMcpTools, true, true, false)
    const disallowed = getStreamDisallowedTools(true, true)

    expect(allowed).toContain("Task")
    expect(allowed).toContain("WebSearch")
    expect(allowed).toContain("TodoWrite")
    expect(allowed).toContain("AskUserQuestion")
    expect(allowed).not.toContain("ListMcpResources")
    expect(allowed).not.toContain("ReadMcpResource")
    expect(disallowed).toContain("ExitPlanMode")
    expect(disallowed).not.toContain("Task")
    expect(disallowed).not.toContain("WebSearch")
  })

  it("filters site-specific workspace MCP tools in superadmin workspace", () => {
    const allowed = getStreamAllowedTools(enabledMcpTools, true, true, true)

    expect(allowed).not.toContain("mcp__alive-workspace__check_codebase")
    expect(allowed).toContain("mcp__alive-tools__search_tools")
  })

  it("hides TodoWrite from client visibility while still allowing execution", () => {
    const context = createStreamToolContext()
    const decision = getStreamToolDecision("TodoWrite", context)

    expect(decision.executable).toBe(true)
    expect(decision.visibleToClient).toBe(false)
    expect(isStreamClientVisibleTool("TodoWrite")).toBe(false)
  })

  it("allows AskUserQuestion for all roles", () => {
    const member = getStreamToolDecision("AskUserQuestion", createStreamToolContext())
    const admin = getStreamToolDecision("AskUserQuestion", createStreamToolContext({ isAdmin: true }))
    const superadmin = getStreamToolDecision(
      "AskUserQuestion",
      createStreamToolContext({ isAdmin: true, isSuperadmin: true }),
    )

    expect(member.executable).toBe(true)
    expect(admin.executable).toBe(true)
    expect(superadmin.executable).toBe(true)
  })

  it("blocks ExitPlanMode for all roles", () => {
    const member = getStreamToolDecision("ExitPlanMode", createStreamToolContext())
    const admin = getStreamToolDecision("ExitPlanMode", createStreamToolContext({ isAdmin: true }))
    const superadmin = getStreamToolDecision(
      "ExitPlanMode",
      createStreamToolContext({ isAdmin: true, isSuperadmin: true }),
    )

    expect(member.executable).toBe(false)
    expect(admin.executable).toBe(false)
    expect(superadmin.executable).toBe(false)
  })

  it("enforces member-only MCP resource SDK tools", () => {
    const member = createStreamToolContext()
    const admin = createStreamToolContext({ isAdmin: true })
    const superadmin = createStreamToolContext({ isAdmin: true, isSuperadmin: true })

    expect(getStreamToolDecision("ListMcpResources", member).executable).toBe(true)
    expect(getStreamToolDecision("ReadMcpResource", member).executable).toBe(true)
    expect(getStreamToolDecision("ListMcpResources", admin).executable).toBe(false)
    expect(getStreamToolDecision("ReadMcpResource", admin).executable).toBe(false)
    expect(getStreamToolDecision("ListMcpResources", superadmin).executable).toBe(false)
    expect(getStreamToolDecision("ReadMcpResource", superadmin).executable).toBe(false)
  })

  it("blocks write/edit tools in plan mode at config-build time", () => {
    const context = createStreamToolContext({ isPlanMode: true })
    const runtime = buildStreamToolRuntimeConfig(enabledMcpTools, context)

    expect(runtime.allowedTools).not.toContain("Write")
    expect(runtime.allowedTools).not.toContain("Edit")
    expect(runtime.allowedTools).not.toContain("Bash")
    expect(runtime.disallowedTools).toContain("Write")
    expect(runtime.disallowedTools).toContain("Edit")
  })

  it("fails closed for internal tools that have no policy entry", () => {
    const missingPolicyTool = "mcp__alive-tools__missing_policy_tool"
    const decision = getStreamToolDecision(missingPolicyTool, createStreamToolContext())

    expect(decision.executable).toBe(false)
    expect(decision.policyFound).toBe(false)
    expect(isStreamClientVisibleTool(missingPolicyTool)).toBe(false)
  })

  it("fails closed for unknown mcp__alive-* namespaces", () => {
    const unknownInternalTool = "mcp__alive-foo__missing_policy_tool"
    const decision = getStreamToolDecision(unknownInternalTool, createStreamToolContext())

    expect(decision.executable).toBe(false)
    expect(decision.policyFound).toBe(false)
    expect(isStreamClientVisibleTool(unknownInternalTool)).toBe(false)
  })
})
