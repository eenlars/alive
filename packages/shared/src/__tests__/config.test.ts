import { describe, expect, it } from "vitest"
import { isAliveWorkspace, resolveTemplatePath, SUPERADMIN } from "../config"

describe("resolveTemplatePath", () => {
  // In test environment, TEMPLATES_ROOT defaults to "/srv/webalive/templates"
  const TEMPLATES_ROOT = "/srv/webalive/templates"

  it("extracts directory name from a DB source_path", () => {
    // DB stores: "/srv/webalive/templates/blank.alive.best"
    // Function extracts last segment "blank.alive.best" and joins with TEMPLATES_ROOT
    const result = resolveTemplatePath("/srv/webalive/templates/blank.alive.best")
    expect(result).toBe(`${TEMPLATES_ROOT}/blank.alive.best`)
  })

  it("handles a simple directory name", () => {
    const result = resolveTemplatePath("blank.alive.best")
    expect(result).toBe(`${TEMPLATES_ROOT}/blank.alive.best`)
  })

  it("extracts last segment from multi-level path", () => {
    const result = resolveTemplatePath("/some/deep/path/template-dir")
    expect(result).toBe(`${TEMPLATES_ROOT}/template-dir`)
  })

  it("throws for empty string input", () => {
    expect(() => resolveTemplatePath("")).toThrow("Invalid template source_path")
  })

  it("handles path traversal attempts — extracts only last segment", () => {
    // Even with traversal in the input, only the last segment is used
    const result = resolveTemplatePath("../../etc/passwd")
    expect(result).toBe(`${TEMPLATES_ROOT}/passwd`)
    // Crucially, the result stays under TEMPLATES_ROOT
    expect(result.startsWith(TEMPLATES_ROOT)).toBe(true)
  })

  it("throws for '..' as the final segment", () => {
    expect(() => resolveTemplatePath("/foo/bar/..")).toThrow("Invalid template source_path")
  })

  it("throws for '.' as input", () => {
    expect(() => resolveTemplatePath(".")).toThrow("Invalid template source_path")
  })

  it("throws for trailing slash (empty last segment)", () => {
    expect(() => resolveTemplatePath("/foo/bar/")).toThrow("Invalid template source_path")
  })
})

describe("isAliveWorkspace", () => {
  it("returns true for the alive workspace name", () => {
    expect(isAliveWorkspace(SUPERADMIN.WORKSPACE_NAME)).toBe(true)
    expect(isAliveWorkspace("alive")).toBe(true)
  })

  it("returns false for regular site hostnames", () => {
    expect(isAliveWorkspace("example.com")).toBe(false)
    expect(isAliveWorkspace("test.alive.best")).toBe(false)
    expect(isAliveWorkspace("")).toBe(false)
  })

  it("is case-sensitive", () => {
    expect(isAliveWorkspace("Alive")).toBe(false)
    expect(isAliveWorkspace("ALIVE")).toBe(false)
  })
})
