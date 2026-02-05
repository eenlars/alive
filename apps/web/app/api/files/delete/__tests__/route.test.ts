/**
 * Tests for DELETE /api/files/delete endpoint
 *
 * Security-critical tests:
 * - Authentication required
 * - Workspace authorization (cross-tenant protection)
 * - Path traversal prevention
 * - Protected files cannot be deleted (case-insensitive)
 * - Symlink escape protection (TOCTOU)
 */

import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { BRIDGE_ENV } from "@webalive/shared"
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

// Import after mocking
const { POST } = await import("../route")
const { getSessionUser, verifyWorkspaceAccess } = await import("@/features/auth/lib/auth")
const { getWorkspace } = await import("@/features/chat/lib/workspaceRetriever")

// Test workspace directory
const TEST_WORKSPACE = path.join(tmpdir(), "delete-test-workspace")

// Mock user
const MOCK_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
}

function createMockRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/files/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/files/delete", () => {
  beforeAll(() => {
    // Create test workspace
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true })
    }
    mkdirSync(TEST_WORKSPACE, { recursive: true })
  })

  afterAll(() => {
    // Cleanup test workspace
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true })
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Default: authenticated user
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    // Default: workspace authorized
    vi.mocked(verifyWorkspaceAccess).mockResolvedValue("test-workspace")

    // Default: valid workspace
    vi.mocked(getWorkspace).mockResolvedValue({
      success: true,
      workspace: TEST_WORKSPACE,
    })
  })

  describe("Authentication", () => {
    it("should require session (401 without user)", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const req = createMockRequest({ path: "test.txt", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("NO_SESSION")
    })

    it("should allow authenticated users", async () => {
      // Create a test file
      const testFile = path.join(TEST_WORKSPACE, "auth-test.txt")
      writeFileSync(testFile, "test content")

      const req = createMockRequest({ path: "auth-test.txt", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.deleted).toBe("auth-test.txt")
    })
  })

  describe("Workspace Authorization (Cross-Tenant Protection)", () => {
    it("should deny access to unauthorized workspace", async () => {
      vi.mocked(verifyWorkspaceAccess).mockResolvedValue(null)

      const req = createMockRequest({ path: "secret.txt", workspace: "other-tenant.com" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")
    })

    it("should allow access to authorized workspace", async () => {
      vi.mocked(verifyWorkspaceAccess).mockResolvedValue("my-workspace.com")

      const testFile = path.join(TEST_WORKSPACE, "my-file.txt")
      writeFileSync(testFile, "my content")

      const req = createMockRequest({ path: "my-file.txt", workspace: "my-workspace.com" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should verify workspace access is called with user", async () => {
      const testFile = path.join(TEST_WORKSPACE, "verify-test.txt")
      writeFileSync(testFile, "content")

      const req = createMockRequest({ path: "verify-test.txt", workspace: "test" })
      await POST(req)

      expect(verifyWorkspaceAccess).toHaveBeenCalledWith(
        MOCK_USER,
        expect.objectContaining({ workspace: "test" }),
        expect.any(String),
      )
    })
  })

  describe("Path Validation", () => {
    it("should require path parameter", async () => {
      const req = createMockRequest({ workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })

    it("should block path traversal with ../", async () => {
      const req = createMockRequest({
        path: "../../../etc/passwd",
        workspace: "test",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("PATH_OUTSIDE_WORKSPACE")
    })

    it("should block deeply nested traversal attempts", async () => {
      const req = createMockRequest({
        path: "foo/bar/../../../../etc/passwd",
        workspace: "test",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("PATH_OUTSIDE_WORKSPACE")
    })
  })

  describe("Protected Files (Case-Insensitive)", () => {
    it("should block deletion of index.ts", async () => {
      const req = createMockRequest({ path: "index.ts", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("FILE_PROTECTED")
      expect(data.reason).toContain("critical file")
    })

    it("should block deletion of INDEX.TS (case-insensitive)", async () => {
      const req = createMockRequest({ path: "INDEX.TS", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("FILE_PROTECTED")
    })

    it("should block deletion of Package.JSON (case-insensitive)", async () => {
      const req = createMockRequest({ path: "Package.JSON", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("FILE_PROTECTED")
    })

    it("should block deletion of node_modules directory", async () => {
      const req = createMockRequest({
        path: "node_modules",
        workspace: "test",
        recursive: true,
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("FILE_PROTECTED")
    })

    it("should block deletion of NODE_MODULES (case-insensitive)", async () => {
      const req = createMockRequest({
        path: "NODE_MODULES",
        workspace: "test",
        recursive: true,
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("FILE_PROTECTED")
    })

    it("should block deletion of files inside node_modules", async () => {
      const req = createMockRequest({
        path: "node_modules/some-package/index.js",
        workspace: "test",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("FILE_PROTECTED")
    })

    it("should block deletion of .git directory", async () => {
      const req = createMockRequest({
        path: ".git",
        workspace: "test",
        recursive: true,
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("FILE_PROTECTED")
    })
  })

  describe("Symlink Protection (TOCTOU)", () => {
    afterEach(() => {
      // Cleanup symlinks
      const symlinkPath = path.join(TEST_WORKSPACE, "evil-symlink")
      if (existsSync(symlinkPath)) {
        rmSync(symlinkPath)
      }
    })

    it("should block symlinks pointing outside workspace", async () => {
      const symlinkPath = path.join(TEST_WORKSPACE, "evil-symlink")

      // Create symlink pointing outside workspace
      try {
        symlinkSync("/etc/passwd", symlinkPath)
      } catch {
        // Symlink creation may fail in some test environments
        console.log("Skipping symlink test - cannot create symlink")
        return
      }

      const req = createMockRequest({ path: "evil-symlink", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("PATH_OUTSIDE_WORKSPACE")
    })

    it.skipIf(process.env.BRIDGE_ENV === BRIDGE_ENV.LOCAL)(
      "should allow symlinks pointing inside workspace",
      async () => {
        // Create a real file
        const realFile = path.join(TEST_WORKSPACE, "real-file.txt")
        writeFileSync(realFile, "real content")

        // Create symlink pointing to the real file (inside workspace)
        const symlinkPath = path.join(TEST_WORKSPACE, "safe-symlink")
        try {
          symlinkSync(realFile, symlinkPath)
        } catch {
          console.log("Skipping symlink test - cannot create symlink")
          rmSync(realFile)
          return
        }

        const req = createMockRequest({ path: "safe-symlink", workspace: "test" })
        const response = await POST(req)
        const data = await response.json()

        // Should succeed - symlink points inside workspace
        expect(response.status).toBe(200)
        expect(data.ok).toBe(true)

        // Cleanup
        if (existsSync(realFile)) rmSync(realFile)
      },
    )
  })

  describe("File Deletion", () => {
    it("should delete a regular file", async () => {
      const testFile = path.join(TEST_WORKSPACE, "deletable.txt")
      writeFileSync(testFile, "delete me")
      expect(existsSync(testFile)).toBe(true)

      const req = createMockRequest({ path: "deletable.txt", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.deleted).toBe("deletable.txt")
      expect(data.type).toBe("file")
      expect(existsSync(testFile)).toBe(false)
    })

    it("should return 404 for non-existent file", async () => {
      const req = createMockRequest({
        path: "does-not-exist.txt",
        workspace: "test",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe("FILE_NOT_FOUND")
    })
  })

  describe("Directory Deletion", () => {
    it("should require recursive flag for directories", async () => {
      const testDir = path.join(TEST_WORKSPACE, "test-dir")
      mkdirSync(testDir, { recursive: true })

      const req = createMockRequest({ path: "test-dir", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
      expect(data.hint).toContain("recursive")

      // Cleanup
      rmSync(testDir, { recursive: true })
    })

    it("should delete directory with recursive flag", async () => {
      const testDir = path.join(TEST_WORKSPACE, "dir-to-delete")
      mkdirSync(testDir, { recursive: true })
      writeFileSync(path.join(testDir, "file.txt"), "content")
      expect(existsSync(testDir)).toBe(true)

      const req = createMockRequest({
        path: "dir-to-delete",
        workspace: "test",
        recursive: true,
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.type).toBe("directory")
      expect(existsSync(testDir)).toBe(false)
    })
  })

  describe("Workspace Resolution", () => {
    it("should reject invalid workspace", async () => {
      vi.mocked(getWorkspace).mockResolvedValue({
        success: false,
        response: NextResponse.json({ ok: false, error: "WORKSPACE_NOT_FOUND" }, { status: 404 }),
      })

      const req = createMockRequest({ path: "test.txt", workspace: "invalid" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe("WORKSPACE_NOT_FOUND")
    })
  })
})
