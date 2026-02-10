/**
 * Tests for POST /api/drive/delete endpoint
 *
 * Security-critical tests:
 * - Authentication required (session user)
 * - Workspace authorization (cross-tenant)
 * - Path traversal prevention
 * - Symlink escape protection
 *
 * Functional tests:
 * - Delete files and directories
 * - Recursive flag required for directories
 * - 404 for non-existent files
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

// Mock ensureDriveDir to return a drive path based on workspace
vi.mock("@/features/chat/lib/drivePath", () => ({
  ensureDriveDir: vi.fn(),
}))

const { POST } = await import("../route")
const { getSessionUser, verifyWorkspaceAccess } = await import("@/features/auth/lib/auth")
const { getWorkspace } = await import("@/features/chat/lib/workspaceRetriever")
const { ensureDriveDir } = await import("@/features/chat/lib/drivePath")

const TEST_DIR = path.join(tmpdir(), "drive-delete-test")
const TEST_WORKSPACE = path.join(TEST_DIR, "user")
const TEST_DRIVE = path.join(TEST_DIR, "drive")

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
  return new NextRequest("http://localhost/api/drive/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/drive/delete", () => {
  beforeAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    mkdirSync(TEST_WORKSPACE, { recursive: true })
    mkdirSync(TEST_DRIVE, { recursive: true })
  })

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
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
    vi.mocked(ensureDriveDir).mockResolvedValue(TEST_DRIVE)
  })

  describe("Authentication", () => {
    it("should return 401 without session", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const req = createMockRequest({ path: "test.txt", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("NO_SESSION")
    })

    it("should deny access to unauthorized workspace", async () => {
      vi.mocked(verifyWorkspaceAccess).mockResolvedValue(null)

      const req = createMockRequest({ path: "secret.txt", workspace: "other-tenant.com" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")
    })
  })

  describe("Path Traversal Prevention", () => {
    it("should block ../../../etc/passwd", async () => {
      const req = createMockRequest({
        path: "../../../etc/passwd",
        workspace: "test",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("PATH_OUTSIDE_WORKSPACE")
    })

    it("should block deeply nested traversal", async () => {
      const req = createMockRequest({
        path: "foo/bar/../../../../etc/passwd",
        workspace: "test",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("PATH_OUTSIDE_WORKSPACE")
    })

    it("should block encoded traversal (%2e%2e)", async () => {
      const req = createMockRequest({
        path: "..%2f..%2f..%2fetc%2fpasswd",
        workspace: "test",
      })
      const response = await POST(req)

      // Should either be 403 (caught as traversal) or 404 (literal filename doesn't exist)
      expect([403, 404]).toContain(response.status)
    })
  })

  describe("Symlink Protection", () => {
    afterEach(() => {
      const symlinkPath = path.join(TEST_DRIVE, "evil-symlink")
      if (existsSync(symlinkPath)) rmSync(symlinkPath)
    })

    it("should safely remove symlinks without following them", async () => {
      const symlinkPath = path.join(TEST_DRIVE, "evil-symlink")
      try {
        symlinkSync("/etc/passwd", symlinkPath)
      } catch {
        console.log("Skipping symlink test - cannot create symlink")
        return
      }

      const req = createMockRequest({ path: "evil-symlink", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.type).toBe("file")
      // Symlink itself is gone
      expect(existsSync(symlinkPath)).toBe(false)
      // Target was never touched
      expect(existsSync("/etc/passwd")).toBe(true)
    })
  })

  describe("File Deletion", () => {
    it("should delete a regular file", async () => {
      const testFile = path.join(TEST_DRIVE, "deletable.txt")
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
      const testDir = path.join(TEST_DRIVE, "test-dir")
      mkdirSync(testDir, { recursive: true })

      const req = createMockRequest({ path: "test-dir", workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")

      rmSync(testDir, { recursive: true })
    })

    it("should delete directory with recursive flag", async () => {
      const testDir = path.join(TEST_DRIVE, "dir-to-delete")
      mkdirSync(testDir, { recursive: true })
      writeFileSync(path.join(testDir, "inner.txt"), "content")
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
