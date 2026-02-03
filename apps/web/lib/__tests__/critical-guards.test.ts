/**
 * Critical Guards Test
 *
 * These tests verify security-critical functions work correctly.
 * AI agents love to "simplify" these - don't let them.
 */
import { describe, expect, it } from "vitest"
import { hasSessionCookie, hasValidUser, isValidSessionCookie } from "@/features/auth/types/guards"
import {
  containsPathTraversal,
  isPathWithinWorkspace,
  isValidWorkspaceString,
} from "@/features/workspace/types/workspace"

describe("Path Security Guards", () => {
  describe("containsPathTraversal", () => {
    it("detects .. in path", () => {
      expect(containsPathTraversal("../etc/passwd")).toBe(true)
      expect(containsPathTraversal("/foo/../../bar")).toBe(true)
      expect(containsPathTraversal("foo/..")).toBe(true)
    })

    it("allows normal paths", () => {
      expect(containsPathTraversal("/srv/webalive/sites/example.com")).toBe(false)
      expect(containsPathTraversal("index.ts")).toBe(false)
      expect(containsPathTraversal("src/components/Button.tsx")).toBe(false)
    })
  })

  describe("isPathWithinWorkspace", () => {
    const workspace = "/srv/webalive/sites/example.com"

    it("allows paths inside workspace", () => {
      expect(isPathWithinWorkspace(`${workspace}/index.ts`, workspace, "/")).toBe(true)
      expect(isPathWithinWorkspace(`${workspace}/src/app.ts`, workspace, "/")).toBe(true)
      expect(isPathWithinWorkspace(workspace, workspace, "/")).toBe(true)
    })

    it("blocks paths outside workspace", () => {
      expect(isPathWithinWorkspace("/etc/passwd", workspace, "/")).toBe(false)
      expect(isPathWithinWorkspace("/srv/webalive/sites/other.com/file", workspace, "/")).toBe(false)
      // Tricky case: prefix match without separator
      expect(isPathWithinWorkspace("/srv/webalive/sites/example.com.evil/file", workspace, "/")).toBe(false)
    })
  })

  describe("isValidWorkspaceString", () => {
    it("accepts valid workspaces", () => {
      expect(isValidWorkspaceString("example.com")).toBe(true)
      expect(isValidWorkspaceString("my-site.alive.best")).toBe(true)
    })

    it("rejects invalid workspaces", () => {
      expect(isValidWorkspaceString("")).toBe(false)
      expect(isValidWorkspaceString(null)).toBe(false)
      expect(isValidWorkspaceString(undefined)).toBe(false)
      expect(isValidWorkspaceString(123)).toBe(false)
    })
  })
})

describe("Session Guards", () => {
  describe("hasSessionCookie", () => {
    it("returns true for valid cookie objects", () => {
      expect(hasSessionCookie({ value: "abc123" })).toBe(true)
      expect(hasSessionCookie({ value: "" })).toBe(true) // empty but exists
    })

    it("returns false for missing cookies", () => {
      expect(hasSessionCookie(null)).toBe(false)
      expect(hasSessionCookie(undefined)).toBe(false)
    })
  })

  describe("isValidSessionCookie", () => {
    it("returns true for non-empty strings", () => {
      expect(isValidSessionCookie("session_token_123")).toBe(true)
    })

    it("returns false for invalid values", () => {
      expect(isValidSessionCookie("")).toBe(false)
      expect(isValidSessionCookie(null)).toBe(false)
      expect(isValidSessionCookie(123)).toBe(false)
    })
  })

  describe("hasValidUser", () => {
    it("returns true for valid user objects", () => {
      expect(hasValidUser({ id: "user_123", email: "test@example.com" })).toBe(true)
    })

    it("returns false for invalid users", () => {
      expect(hasValidUser(null)).toBe(false)
      expect(hasValidUser(undefined)).toBe(false)
      expect(hasValidUser({})).toBe(false)
      expect(hasValidUser({ email: "test@example.com" })).toBe(false) // missing id
    })
  })
})
