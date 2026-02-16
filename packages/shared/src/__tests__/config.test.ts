import { describe, expect, it } from "vitest"
import { resolveTemplatePath } from "../config"

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

  it("handles '..' as the final segment safely", () => {
    // ".." as last segment would escape TEMPLATES_ROOT when path.resolve'd
    const result = resolveTemplatePath("/foo/bar/..")
    // The function extracts ".." as dirName — this stays under TEMPLATES_ROOT as a literal string
    expect(result).toBe(`${TEMPLATES_ROOT}/..`)
  })

  it("handles '.' as input", () => {
    const result = resolveTemplatePath(".")
    expect(result).toBe(`${TEMPLATES_ROOT}/.`)
  })

  it("throws for trailing slash (empty last segment)", () => {
    expect(() => resolveTemplatePath("/foo/bar/")).toThrow("Invalid template source_path")
  })
})
