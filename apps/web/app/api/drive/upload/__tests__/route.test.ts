/**
 * Tests for POST /api/drive/upload endpoint
 *
 * Security-critical tests:
 * - Authentication required (session user)
 * - Workspace authorization (cross-tenant)
 * - Path traversal prevention (filename sanitization)
 * - MIME type validation
 * - File size limits
 *
 * Functional tests:
 * - Successful file upload
 * - Filename sanitization
 * - Error response does not leak internals
 */

import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Mock auth functions
vi.mock("@/features/auth/lib/auth", async () => {
  return {
    getSessionUser: vi.fn(),
    verifyWorkspaceAccess: vi.fn(),
  }
})

// Mock structured error response
vi.mock("@/lib/api/responses", async () => {
  const { NextResponse } = await import("next/server")
  return {
    structuredErrorResponse: vi.fn((code: string, opts: { status: number; details?: Record<string, unknown> }) => {
      return NextResponse.json({ ok: false, error: code, ...opts.details }, { status: opts.status })
    }),
  }
})

// Mock workspace resolution
vi.mock("@/features/chat/lib/workspaceRetriever", () => ({
  getWorkspace: vi.fn(),
}))

// Mock drive path
vi.mock("@/features/chat/lib/drivePath", () => ({
  ensureDriveDir: vi.fn(),
}))

// Mock writeAsWorkspaceOwner
vi.mock("@/features/workspace/lib/workspace-secure", () => ({
  writeAsWorkspaceOwner: vi.fn(),
}))

// Mock fs/promises stat to return uid/gid for workspace ownership
const mockStat = vi.fn()
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual("node:fs/promises")
  return {
    ...actual,
    stat: mockStat,
  }
})

const { POST } = await import("../route")
const { getSessionUser, verifyWorkspaceAccess } = await import("@/features/auth/lib/auth")
const { getWorkspace } = await import("@/features/chat/lib/workspaceRetriever")
const { ensureDriveDir } = await import("@/features/chat/lib/drivePath")
const { writeAsWorkspaceOwner } = await import("@/features/workspace/lib/workspace-secure")

const TEST_DIR = path.join(tmpdir(), "drive-upload-test")
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

function createMockUploadRequest(fields: { file?: File; workspace?: string; worktree?: string }): NextRequest {
  const formData = new FormData()
  if (fields.file) formData.append("file", fields.file)
  if (fields.workspace) formData.append("workspace", fields.workspace)
  if (fields.worktree) formData.append("worktree", fields.worktree)

  return new NextRequest("http://localhost/api/drive/upload", {
    method: "POST",
    headers: { host: "localhost" },
    body: formData,
  })
}

describe("POST /api/drive/upload", () => {
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
    mockStat.mockResolvedValue({ uid: 1000, gid: 1000 })
    vi.mocked(writeAsWorkspaceOwner).mockReturnValue(undefined)
  })

  describe("Authentication", () => {
    it("should return 401 without session", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const file = new File(["hello"], "test.txt", { type: "text/plain" })
      const req = createMockUploadRequest({ file, workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("NO_SESSION")
    })

    it("should deny access to unauthorized workspace", async () => {
      vi.mocked(verifyWorkspaceAccess).mockResolvedValue(null)

      const file = new File(["hello"], "test.txt", { type: "text/plain" })
      const req = createMockUploadRequest({ file, workspace: "other.com" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")
    })
  })

  describe("Happy Path", () => {
    it("should upload a valid text file", async () => {
      const content = "Hello, drive!"
      const file = new File([content], "readme.txt", { type: "text/plain" })
      const req = createMockUploadRequest({ file, workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.originalName).toBe("readme.txt")
      expect(data.size).toBe(content.length)
      expect(data.mimeType).toBe("text/plain")
      expect(writeAsWorkspaceOwner).toHaveBeenCalledOnce()
    })

    it("should upload a valid image file", async () => {
      const file = new File([new Uint8Array(100)], "photo.png", { type: "image/png" })
      const req = createMockUploadRequest({ file, workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.mimeType).toBe("image/png")
    })
  })

  describe("Validation", () => {
    it("should reject files exceeding size limit", async () => {
      // 10MB + 1 byte
      const largeContent = new Uint8Array(10 * 1024 * 1024 + 1)
      const file = new File([largeContent], "huge.txt", { type: "text/plain" })
      const req = createMockUploadRequest({ file, workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("FILE_TOO_LARGE")
    })

    it("should reject unsupported MIME types", async () => {
      const file = new File(["#!/bin/bash"], "script.sh", { type: "application/x-sh" })
      const req = createMockUploadRequest({ file, workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_FILE_TYPE")
    })

    it("should return 400 when no file is provided", async () => {
      const req = createMockUploadRequest({ workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("NO_FILE")
    })

    it("should return 400 when workspace is missing", async () => {
      const file = new File(["hello"], "test.txt", { type: "text/plain" })
      const req = createMockUploadRequest({ file })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })
  })

  describe("Security", () => {
    it("should sanitize path traversal filenames", async () => {
      const file = new File(["hack"], "../../../etc/passwd", { type: "text/plain" })
      const req = createMockUploadRequest({ file, workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      // The saved path should NOT contain traversal sequences
      expect(data.path).not.toContain("..")
      expect(data.path).not.toContain("/")
      // writeAsWorkspaceOwner should have been called with a path inside the drive
      const writePath = vi.mocked(writeAsWorkspaceOwner).mock.calls[0]?.[0]
      expect(writePath).toBeDefined()
      expect(writePath!.startsWith(TEST_DRIVE)).toBe(true)
    })

    it("should not leak internal error messages", async () => {
      mockStat.mockRejectedValue(new Error("EPERM: operation not permitted"))

      const file = new File(["hello"], "test.txt", { type: "text/plain" })
      const req = createMockUploadRequest({ file, workspace: "test" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("FILE_WRITE_ERROR")
      // Must NOT contain the internal error message
      expect(JSON.stringify(data)).not.toContain("EPERM")
    })
  })
})
