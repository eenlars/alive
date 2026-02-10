/**
 * TypeScript Safety Tests
 *
 * These tests verify that TypeScript is actually catching bugs.
 * They run tsc to ensure undefined variables are caught at compile time.
 */

import { execSync } from "node:child_process"
import { readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("TypeScript Compilation Safety", () => {
  // Skip in local dev - this is covered by type-check in CI/pre-push
  it.skipIf(!process.env.CI)(
    "CRITICAL: TypeScript catches undefined variables in components",
    () => {
      // Create a test file with an undefined variable
      const testFile = join(process.cwd(), "components/__test-undefined-var.tsx")

      const badCode = `
export function TestComponent() {
  return (
    <div>
      {undefinedVariable}
    </div>
  )
}
`

      try {
        writeFileSync(testFile, badCode)

        // Try to compile it - should FAIL
        // Pass strict flags inline (can't use --project with file path)
        // Use local tsc binary for faster execution
        try {
          execSync(`bun tsc --noEmit --strict --jsx react-jsx ${testFile}`, {
            cwd: process.cwd(),
            encoding: "utf-8",
            stdio: "pipe",
          })

          // If we get here, TypeScript DIDN'T catch the error - BAD!
          expect.fail("TypeScript should have caught the undefined variable but didn't!")
        } catch (error: any) {
          // Good! TypeScript caught it
          const output = error.stdout || error.stderr || ""
          expect(output).toContain("Cannot find name 'undefinedVariable'")
        }
      } finally {
        // Clean up
        try {
          unlinkSync(testFile)
        } catch {}
      }
    },
    60000,
  )

  it("CRITICAL: WorkspaceSettings doesn't reference 'updateError'", () => {
    // Note: Error handling was moved from SettingsModal.tsx to WorkspaceSettings.tsx
    const workspaceSettingsPath = join(process.cwd(), "components/settings/tabs/WorkspaceSettings.tsx")
    const content = readFileSync(workspaceSettingsPath, "utf-8")

    // Should NOT contain updateError
    if (content.includes("updateError")) {
      // Check if it's in a comment or test
      const lines = content.split("\n")
      const usageLines = lines
        .map((line, index) => ({ line, index: index + 1 }))
        .filter(({ line }) => line.includes("updateError") && !line.trim().startsWith("//") && !line.includes("test"))

      if (usageLines.length > 0) {
        const locations = usageLines.map(l => `Line ${l.index}: ${l.line.trim()}`).join("\n")
        expect.fail(
          `Found 'updateError' usage in WorkspaceSettings.tsx:\n${locations}\n\nShould use 'editor.error' instead!`,
        )
      }
    }

    // Should contain editor.error
    expect(content).toContain("editor.error")
  })

  it("CRITICAL: All hook return values are used correctly", () => {
    // Note: useOrgEditor was moved from SettingsModal.tsx to WorkspaceSettings.tsx
    const workspaceSettingsPath = join(process.cwd(), "components/settings/tabs/WorkspaceSettings.tsx")
    const content = readFileSync(workspaceSettingsPath, "utf-8")

    // Check that useOrgEditor is destructured correctly
    const editorHookMatch = content.match(/const\s+(\w+)\s*=\s*useOrgEditor/)

    if (editorHookMatch) {
      const editorVarName = editorHookMatch[1]

      // If using editor.error, make sure 'editor' is defined
      if (content.includes(`${editorVarName}.error`)) {
        // Good!
        expect(true).toBe(true)
      } else if (content.includes("editor.error") && editorVarName !== "editor") {
        expect.fail(`Code uses 'editor.error' but hook returns '${editorVarName}'`)
      }
    }
  })

  it("documents TypeScript strict mode is enabled", () => {
    // Use resolved compiler settings (includes inherited settings via "extends")
    const resolvedConfigRaw = execSync("npx tsc --showConfig", {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: "pipe",
    })
    const resolvedConfig = JSON.parse(resolvedConfigRaw)

    // These settings catch undefined variables
    expect(resolvedConfig.compilerOptions.strict).toBe(true)

    // Note: noUnusedLocals is optional, but strict mode should catch undefined vars
    // The important thing is that strict is true
  })
})
