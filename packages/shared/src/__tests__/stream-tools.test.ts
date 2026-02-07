import { describe, expect, it } from "vitest"
import { isHeavyBashCommand } from "../stream-tools"

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
})
