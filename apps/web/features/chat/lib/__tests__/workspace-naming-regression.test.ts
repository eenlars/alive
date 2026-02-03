/**
 * CRITICAL REGRESSION TEST
 *
 * This test reproduces the actual bug that broke evermore.alive.best.
 * It verifies that workspace resolution tries DOTS first, then HYPHENS.
 *
 * If this test fails, someone broke the naming convention support.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DOMAINS } from "@webalive/shared"
import { describe, expect, it } from "vitest"
import { getWorkspace } from "../workspaceRetriever"

describe("Workspace Naming Bug - Regression Test", () => {
  /**
   * THE BUG: Code was converting evermore.alive.best → evermore-alive-best
   * THE FIX: Try both, dots first
   *
   * This test fails if someone reverts to the old behavior.
   */
  it("CRITICAL: finds evermore.alive.best with DOTS in directory name", () => {
    // Verify the actual directory exists with DOTS
    const dotsPath = "/srv/webalive/sites/evermore.alive.best/user"
    const hyphensPath = "/srv/webalive/sites/evermore-alive-best/user"

    if (!existsSync(dotsPath)) {
      console.warn(`⚠️  Test site missing: ${dotsPath}`)
      console.warn("This test requires evermore.alive.best to exist")
      return // Skip if test site doesn't exist
    }

    const result = getWorkspace({
      host: DOMAINS.BRIDGE_DEV_HOST,
      body: { workspace: "evermore.alive.best" },
      requestId: "regression-test",
    })

    // Must succeed
    expect(result.success).toBe(true)

    if (result.success) {
      // Must find the DOTS version, not the hyphens version
      expect(result.workspace).toBe(dotsPath)
      expect(result.workspace).not.toBe(hyphensPath)
    }
  })

  it("CRITICAL: still supports legacy sites with HYPHENS", () => {
    const hyphensPath = "/srv/webalive/sites/demo-goalive-nl/user"

    if (!existsSync(hyphensPath)) {
      console.warn(`⚠️  Test site missing: ${hyphensPath}`)
      return
    }

    const result = getWorkspace({
      host: DOMAINS.BRIDGE_DEV_HOST,
      body: { workspace: "demo.goalive.nl" }, // User provides dots
      requestId: "legacy-test",
    })

    expect(result.success).toBe(true)

    if (result.success) {
      // Must find the hyphens version
      expect(result.workspace).toBe(hyphensPath)
    }
  })

  it("CRITICAL: error message shows BOTH paths when workspace not found", async () => {
    const result = getWorkspace({
      host: DOMAINS.BRIDGE_DEV_HOST,
      body: { workspace: "this-site-definitely-does-not-exist.com" },
      requestId: "error-test",
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      const body = await result.response.json()
      const attemptedPaths = body.details?.attemptedPaths

      // Must try BOTH naming conventions
      expect(attemptedPaths).toBeDefined()
      expect(attemptedPaths).toHaveLength(2)

      // First attempt: with dots
      expect(attemptedPaths[0]).toContain("this-site-definitely-does-not-exist.com")
      expect(attemptedPaths[0]).not.toContain("this-site-definitely-does-not-exist-com")

      // Second attempt: with hyphens
      expect(attemptedPaths[1]).toContain("this-site-definitely-does-not-exist-com")
    }
  })

  /**
   * THE REAL TEST: Does the code try dots BEFORE hyphens?
   *
   * If someone changes the order, sites with dots will be slow
   * because it'll try hyphens first and fail, then try dots.
   */
  it("CRITICAL: tries DOTS first, HYPHENS second (performance)", () => {
    // We can't easily test the order without spying on fs.existsSync
    // But we can verify the candidates array is in the right order

    // Read the source code and verify the pattern
    const sourceFile = join(__dirname, "../workspaceRetriever.ts")
    const source = readFileSync(sourceFile, "utf-8")

    // The candidates array should have normalizedDomain BEFORE domainToSlug
    const candidatesMatch = source.match(/const candidates = \[([\s\S]*?)\]/)

    if (candidatesMatch) {
      const candidatesContent = candidatesMatch[1]
      const normalizedIndex = candidatesContent.indexOf("normalizedDomain")
      const slugIndex = candidatesContent.indexOf("domainToSlug")

      // normalizedDomain must come BEFORE domainToSlug
      expect(normalizedIndex).toBeGreaterThan(-1)
      expect(slugIndex).toBeGreaterThan(-1)
      expect(normalizedIndex).toBeLessThan(slugIndex)
    } else {
      throw new Error("Could not find candidates array in workspaceRetriever.ts - has the code been refactored?")
    }
  })
})
