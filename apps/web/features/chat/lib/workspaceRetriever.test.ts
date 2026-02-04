/**
 * Unit tests for workspace resolution logic
 *
 * These tests ensure that domain names are properly converted to directory slugs.
 * We test with existing workspaces to verify the full resolution flow.
 */

import { existsSync } from "node:fs"
import { DOMAINS } from "@webalive/shared"
import { describe, expect, it, vi } from "vitest"
import { domainToSlug, normalizeDomain } from "@/features/manager/lib/domain-utils"
import { getWorkspace } from "./workspaceRetriever"

// Check if we're in an environment with actual workspace directories
const workspacePath = process.env.TEST_WORKSPACE_PATH ?? "/srv/webalive/sites/demo-goalive-nl/user"
const hasWorkspaces = existsSync(workspacePath)

describe("Workspace Resolution", () => {
  describe("Domain to Slug Conversion (Unit)", () => {
    it("domainToSlug converts dots to hyphens", () => {
      expect(domainToSlug("demo.goalive.nl")).toBe("demo-goalive-nl")
    })

    it("domainToSlug handles multiple dots", () => {
      expect(domainToSlug("sub.example.com")).toBe("sub-example-com")
    })

    it("domainToSlug converts all special characters to hyphens", () => {
      expect(domainToSlug("test_site@123")).toBe("test-site-123")
    })

    it("normalizeDomain removes protocol", () => {
      expect(normalizeDomain("https://example.com")).toBe("example.com")
      expect(normalizeDomain("http://example.com")).toBe("example.com")
    })

    it("normalizeDomain removes www prefix", () => {
      expect(normalizeDomain("www.example.com")).toBe("example.com")
    })

    it("normalizeDomain converts to lowercase", () => {
      expect(normalizeDomain("EXAMPLE.COM")).toBe("example.com")
    })

    it("full normalization pipeline", () => {
      const input = "HTTPS://WWW.Example.COM"
      const normalized = normalizeDomain(input)
      const slug = domainToSlug(normalized)
      expect(slug).toBe("example-com")
    })
  })

  describe("Integration with existing workspace", () => {
    it.skipIf(!hasWorkspaces)("resolves demo-goalive-nl workspace correctly (legacy hyphenated format)", () => {
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: { workspace: "demo.goalive.nl" }, // User sends with dots
        requestId: "test-int-001",
      })

      // Should successfully find the workspace with hyphenated name
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.workspace).toBe("/srv/webalive/sites/demo-goalive-nl/user")
      }
    })

    it.skipIf(!hasWorkspaces)("path always ends with /user", () => {
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: { workspace: "demo.goalive.nl" },
        requestId: "test-int-002",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.workspace).toMatch(/\/user$/)
      }
    })

    it.skipIf(!hasWorkspaces)("path always contains /webalive/sites/", () => {
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: { workspace: "demo.goalive.nl" },
        requestId: "test-int-003",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.workspace).toContain("/webalive/sites/")
      }
    })
  })

  describe("Naming Convention Support (Regression Tests)", () => {
    /**
     * Critical regression test for workspace naming conventions.
     * This test prevents the bug where new sites with dots in directory names
     * (e.g., evermore.alive.best) couldn't be found because the code
     * was converting them to hyphens (evermore-alive-best).
     *
     * The system should support BOTH:
     * 1. New sites: domain.com → /srv/webalive/sites/domain.com/user
     * 2. Legacy sites: domain.com → /srv/webalive/sites/domain-com/user
     */
    it.skipIf(!hasWorkspaces)("finds workspace with dots in directory name (new convention)", () => {
      // Test case: New sites like evermore.alive.best use dots in filesystem
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: { workspace: "evermore.alive.best" },
        requestId: "test-naming-001",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        // Should find /srv/webalive/sites/evermore.alive.best/user (with dots)
        expect(result.workspace).toBe("/srv/webalive/sites/evermore.alive.best/user")
      }
    })

    it.skipIf(!hasWorkspaces)("falls back to hyphens when dots directory doesn't exist (legacy)", () => {
      // Test case: Legacy sites like demo.goalive.nl use hyphens in filesystem
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: { workspace: "demo.goalive.nl" },
        requestId: "test-naming-002",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        // Should fall back to /srv/webalive/sites/demo-goalive-nl/user (with hyphens)
        expect(result.workspace).toBe("/srv/webalive/sites/demo-goalive-nl/user")
      }
    })

    it("provides helpful error message with both attempted paths", async () => {
      // Test case: Non-existent workspace should show what paths were tried
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: { workspace: "nonexistent.site.com" },
        requestId: "test-naming-003",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const body = await result.response.json()
        // Should show both naming conventions in attempted paths
        expect(body.details?.attemptedPaths).toEqual([
          "/srv/webalive/sites/nonexistent.site.com/user", // Tried with dots first
          "/srv/webalive/sites/nonexistent-site-com/user", // Then tried with hyphens
        ])
      }
    })

    it.skipIf(!hasWorkspaces)("prefers dots over hyphens when both exist", () => {
      // Edge case: If somehow both naming conventions exist, prefer new (dots)
      // This test documents the preference order
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: { workspace: "evermore.alive.best" },
        requestId: "test-naming-004",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        // Should prefer the dotted version (new convention)
        expect(result.workspace).toContain("evermore.alive.best")
        expect(result.workspace).not.toContain("evermore-alive-best")
      }
    })
  })

  describe("Error Handling", () => {
    it("returns error when workspace parameter is missing", () => {
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: {},
        requestId: "test-err-001",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(400)
      }
    })

    it("returns error when workspace directory doesn't exist", () => {
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: { workspace: "nonexistent.example.com" },
        requestId: "test-err-002",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(404)
      }
    })

    it("prevents path traversal attacks", () => {
      const result = getWorkspace({
        host: DOMAINS.STREAM_DEV_HOST,
        body: { workspace: "../../../etc/passwd" },
        requestId: "test-err-003",
      })

      // Path traversal is prevented - the input is normalized and doesn't resolve to /etc/passwd
      expect(result.success).toBe(false)
      // Returns 404 because the normalized path doesn't exist (security through normalization)
      if (!result.success) {
        expect(result.response.status).toBe(404)
      }
    })
  })

  describe("Local Development Mode", () => {
    it("allows 'test' workspace in BRIDGE_ENV=local", () => {
      vi.stubEnv("BRIDGE_ENV", "local")

      const result = getWorkspace({
        host: "localhost",
        body: { workspace: "test" },
        requestId: "test-local-001",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.workspace).toBe("/tmp/test-workspace")
      }

      vi.unstubAllEnvs()
    })
  })
})
