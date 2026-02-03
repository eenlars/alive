/**
 * Import Order Safety Tests
 *
 * These tests verify that the import order check script correctly detects
 * violations that would cause EACCES errors after privilege drop.
 *
 * Uses temp files instead of modifying production code.
 */

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

const WORKER_ENTRY_PATH = join(__dirname, "../src/worker-entry.mjs")
const CHECK_SCRIPT_PATH = join(__dirname, "../scripts/check-import-order.mjs")

describe("Import Order Check", () => {
  let originalContent: string
  let tempDir: string
  let tempWorkerPath: string
  let tempScriptPath: string

  // Set up temp directory and copy files
  beforeAll(() => {
    originalContent = readFileSync(WORKER_ENTRY_PATH, "utf8")
    tempDir = mkdtempSync(join(tmpdir(), "import-order-test-"))
    tempWorkerPath = join(tempDir, "worker-entry.mjs")
    tempScriptPath = join(tempDir, "check-import-order.mjs")

    // Copy check script and modify it to use temp worker path
    const checkScript = readFileSync(CHECK_SCRIPT_PATH, "utf8")
    const modifiedScript = checkScript.replace(
      /const WORKER_ENTRY_PATH = .*/,
      `const WORKER_ENTRY_PATH = "${tempWorkerPath}"`,
    )
    writeFileSync(tempScriptPath, modifiedScript)
  })

  // Clean up temp directory
  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  // Reset temp worker file before each test
  afterEach(() => {
    writeFileSync(tempWorkerPath, originalContent)
  })

  it("should pass for current worker-entry.mjs", () => {
    // Write valid content to temp file
    writeFileSync(tempWorkerPath, originalContent)

    const result = execSync(`node ${tempScriptPath}`, {
      cwd: tempDir,
      encoding: "utf8",
    })

    expect(result).toContain("Import order check passed")
  })

  it("should fail if required package is missing from top-level imports", () => {
    // Remove the claude-agent-sdk import
    const badContent = originalContent.replace(
      /import { query } from "@anthropic-ai\/claude-agent-sdk"/,
      '// import { query } from "@anthropic-ai/claude-agent-sdk"',
    )
    writeFileSync(tempWorkerPath, badContent)

    expect(() => {
      execSync(`node ${tempScriptPath}`, {
        cwd: tempDir,
        encoding: "utf8",
      })
    }).toThrow()
  })

  it("should detect if @alive-brug/tools import is missing", () => {
    // Remove the tools import
    const badContent = originalContent.replace(
      /import { workspaceInternalMcp, toolsInternalMcp } from "@alive-brug\/tools"/,
      '// import { workspaceInternalMcp, toolsInternalMcp } from "@alive-brug/tools"',
    )
    writeFileSync(tempWorkerPath, badContent)

    expect(() => {
      execSync(`node ${tempScriptPath}`, {
        cwd: tempDir,
        encoding: "utf8",
      })
    }).toThrow()
  })

  it("should verify all critical imports are at module scope", () => {
    // Verify the comment warning is present
    expect(originalContent).toContain("IMPORTANT: Import these BEFORE dropping privileges")

    // Verify imports appear before any function definitions
    const importSectionEnd = originalContent.indexOf("function dropPrivileges")
    const imports = ["@anthropic-ai/claude-agent-sdk", "@webalive/shared", "@alive-brug/tools"]

    for (const pkg of imports) {
      const importPos = originalContent.indexOf(`from "${pkg}"`)
      expect(importPos).toBeGreaterThan(-1)
      expect(importPos).toBeLessThan(importSectionEnd)
    }
  })

  it("should document the privilege drop order in comments", () => {
    // The file should document why this matters
    expect(originalContent).toContain("After privilege drop")
    expect(originalContent).toContain("can't read")
  })
})
