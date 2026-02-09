/**
 * Tests for POST /api/filespace/list endpoint
 *
 * Security-critical tests:
 * - Authentication required (session user)
 * - Workspace authorization (cross-tenant)
 * - Path traversal prevention
 * - Workspace boundary enforcement
 *
 * Functional tests:
 * - Lists files and directories
 * - Returns correct metadata (size, type, modified)
 * - Handles empty directories
 * - Handles non-existent paths
 */

import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Mock auth functions
vi.mock("@/features/auth/lib/auth", async () => {
  const { NextResponse } = await import("next/server")
  return {
    getSessionUser: vi.fn(),
    verifyWorkspaceAccess: vi.fn(),
    createErrorResponse: vi.fn((code, status, fields) => {
      return NextResponse.json({ ok: false, error: code, ...fields }, { status })
    }),
  }
})

// Mock workspace resolution
vi.mock("@/features/chat/lib/workspaceRetriever", () => ({
  getWorkspace: vi.fn(),
}))

const { POST } = await import("../route")
const { getSessionUser, verifyWorkspaceAccess } = await import("@/features/auth/lib/auth")
const { getWorkspace } = await import("@/features/chat/lib/workspaceRetriever")

const TEST_WORKSPACE = path.join(tmpdir(), "filespace-list-test-workspace")

const MOCK_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

function createMockRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/filespace/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/filespace/list", () => {
  beforeAll(() => {
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true })
    }
    mkdirSync(TEST_WORKSPACE, { recursive: true })

    // Create test structure
    writeFileSync(path.join(TEST_WORKSPACE, "hello.txt"), "hello world")
    writeFileSync(path.join(TEST_WORKSPACE, "style.css"), "body { color: red; }")
    mkdirSync(path.join(TEST_WORKSPACE, "subdir"), { recursive: true })
    writeFileSync(path.join(TEST_WORKSPACE, "subdir", "nested.js"), "console.log('hi')")
  })

  afterAll(() => {
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true })
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
    vi.mocked(verifyWorkspaceAccess).mockResolvedValue("test-workspace")
    vi.mocked(getWorkspace).mockResolvedValue({
      success: true,
      workspace: TEST_WORKSPACE,
    })
  })

  describe("Authentication", () => {
    it("should return 401 without session", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const req = createMockRequest({ workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("NO_SESSION")
    })

    it("should deny access to unauthorized workspace", async () => {
      vi.mocked(verifyWorkspaceAccess).mockResolvedValue(null)

      const req = createMockRequest({ workspace: "other-tenant.com" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")
    })

    it("should allow authenticated users", async () => {
      const req = createMockRequest({ workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(Array.isArray(data.files)).toBe(true)
    })
  })

  describe("Path Traversal Prevention", () => {
    it("should block ../../../etc/passwd", async () => {
      const req = createMockRequest({
        workspace: "test",
        path: "../../../etc/passwd",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("PATH_OUTSIDE_WORKSPACE")
    })

    it("should block deeply nested traversal", async () => {
      const req = createMockRequest({
        workspace: "test",
        path: "subdir/../../../../../../etc",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("PATH_OUTSIDE_WORKSPACE")
    })

    it("should not leak files outside workspace for absolute-looking paths", async () => {
      // path.join(workspace, "/etc/passwd") = workspace + "/etc/passwd" (still within workspace)
      // So this resolves to a non-existent subdir, not the real /etc/passwd
      const req = createMockRequest({
        workspace: "test",
        path: "/etc/passwd",
      })
      const response = await POST(req)

      // Should NOT return real /etc contents — it resolves within workspace
      // The path doesn't exist in workspace, so expect 500 (ENOENT on readdir)
      expect(response.status).toBe(500)
    })
  })

  describe("File Listing", () => {
    it("should list root directory files", async () => {
      const req = createMockRequest({ workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.path).toBe("")

      const names = data.files.map((f: { name: string }) => f.name)
      expect(names).toContain("hello.txt")
      expect(names).toContain("style.css")
      expect(names).toContain("subdir")
    })

    it("should return correct file metadata", async () => {
      const req = createMockRequest({ workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      const helloFile = data.files.find((f: { name: string }) => f.name === "hello.txt")
      expect(helloFile).toBeDefined()
      expect(helloFile.type).toBe("file")
      expect(helloFile.size).toBe(11) // "hello world" = 11 bytes
      expect(helloFile.modified).toBeTruthy()
      expect(helloFile.path).toBe("hello.txt")

      const subdir = data.files.find((f: { name: string }) => f.name === "subdir")
      expect(subdir).toBeDefined()
      expect(subdir.type).toBe("directory")
    })

    it("should list subdirectory contents", async () => {
      const req = createMockRequest({ workspace: "test", path: "subdir" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.path).toBe("subdir")

      const names = data.files.map((f: { name: string }) => f.name)
      expect(names).toContain("nested.js")
    })

    it("should return 500 for non-existent directory", async () => {
      const req = createMockRequest({ workspace: "test", path: "does-not-exist" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
    })

    it("should handle empty directories", async () => {
      const emptyDir = path.join(TEST_WORKSPACE, "empty-dir")
      mkdirSync(emptyDir, { recursive: true })

      const req = createMockRequest({ workspace: "test", path: "empty-dir" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.files).toEqual([])

      rmSync(emptyDir, { recursive: true })
    })
  })

  describe("Symlink Handling", () => {
    afterEach(() => {
      const outside = path.join(TEST_WORKSPACE, "symlink-outside")
      const inside = path.join(TEST_WORKSPACE, "symlink-inside")
      if (existsSync(outside)) rmSync(outside)
      if (existsSync(inside)) rmSync(inside)
    })

    it("should skip metadata for symlinks pointing outside workspace", async () => {
      const symlinkPath = path.join(TEST_WORKSPACE, "symlink-outside")
      try {
        symlinkSync("/etc/passwd", symlinkPath)
      } catch {
        console.log("Skipping symlink test - cannot create symlink")
        return
      }

      const req = createMockRequest({ workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      const entry = data.files.find((f: { name: string }) => f.name === "symlink-outside")
      expect(entry).toBeDefined()
      expect(entry.size).toBe(0)
      expect(entry.modified).toBe("")
    })

    it("should populate metadata for symlinks pointing inside workspace", async () => {
      const targetFile = path.join(TEST_WORKSPACE, "hello.txt") // already exists (11 bytes)
      const symlinkPath = path.join(TEST_WORKSPACE, "symlink-inside")
      try {
        symlinkSync(targetFile, symlinkPath)
      } catch {
        console.log("Skipping symlink test - cannot create symlink")
        return
      }

      const req = createMockRequest({ workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      const entry = data.files.find((f: { name: string }) => f.name === "symlink-inside")
      expect(entry).toBeDefined()
      // lstat on symlink itself returns symlink size, not zero
      expect(entry.modified).toBeTruthy()
    })
  })

  describe("Workspace Resolution", () => {
    it("should reject invalid workspace", async () => {
      vi.mocked(getWorkspace).mockResolvedValue({
        success: false,
        response: NextResponse.json({ ok: false, error: "WORKSPACE_NOT_FOUND" }, { status: 404 }),
      })

      const req = createMockRequest({ workspace: "invalid", path: "" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe("WORKSPACE_NOT_FOUND")
    })
  })
})
