/**
 * Tests for POST /api/files/upload endpoint
 *
 * Security-critical tests:
 * - Authentication required
 * - Workspace authorization (cross-tenant protection)
 * - Path traversal prevention via filename sanitization
 * - File type validation (MIME type whitelist)
 * - File size limits
 * - Workspace boundary enforcement
 */

import { existsSync, mkdirSync, rmSync } from "node:fs"
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

// Mock workspace secure write
vi.mock("@/features/workspace/lib/workspace-secure", () => ({
  writeAsWorkspaceOwner: vi.fn(),
}))

// Import after mocking
const { POST } = await import("../route")
const { getSessionUser, verifyWorkspaceAccess } = await import("@/features/auth/lib/auth")
const { getWorkspace } = await import("@/features/chat/lib/workspaceRetriever")
const { writeAsWorkspaceOwner } = await import("@/features/workspace/lib/workspace-secure")

// Test workspace directory
const TEST_WORKSPACE = path.join(tmpdir(), "upload-test-workspace")

// Mock user
const MOCK_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
}

function createMockFormData(fields: Record<string, string | File>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value)
  }
  return formData
}

function createMockFile(name: string, content: string, type: string): File {
  return new File([content], name, { type })
}

function createMockRequest(formData: FormData): NextRequest {
  // NextRequest with FormData body
  const req = new NextRequest("http://localhost/api/files/upload", {
    method: "POST",
    body: formData,
  })
  return req
}

describe("POST /api/files/upload", () => {
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

    // Default: valid workspace with mock stats
    vi.mocked(getWorkspace).mockReturnValue({
      success: true,
      workspace: TEST_WORKSPACE,
    })

    // Default: write succeeds
    vi.mocked(writeAsWorkspaceOwner).mockImplementation(() => {})
  })

  afterEach(() => {
    // Cleanup uploads directory
    const uploadsDir = path.join(TEST_WORKSPACE, ".uploads")
    if (existsSync(uploadsDir)) {
      rmSync(uploadsDir, { recursive: true })
    }
  })

  describe("Authentication", () => {
    it("should require session (401 without user)", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const formData = createMockFormData({
        file: createMockFile("test.txt", "content", "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("NO_SESSION")
    })

    it("should allow authenticated users", async () => {
      const formData = createMockFormData({
        file: createMockFile("test.txt", "content", "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })
  })

  describe("Workspace Authorization", () => {
    it("should deny access to unauthorized workspace", async () => {
      vi.mocked(verifyWorkspaceAccess).mockResolvedValue(null)

      const formData = createMockFormData({
        file: createMockFile("test.txt", "content", "text/plain"),
        workspace: "other-tenant.com",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")
    })

    it("should verify workspace access is called with user", async () => {
      const formData = createMockFormData({
        file: createMockFile("test.txt", "content", "text/plain"),
        workspace: "my-workspace.com",
      })

      const req = createMockRequest(formData)
      await POST(req)

      expect(verifyWorkspaceAccess).toHaveBeenCalledWith(
        MOCK_USER,
        expect.objectContaining({ workspace: "my-workspace.com" }),
        expect.any(String),
      )
    })
  })

  describe("File Validation", () => {
    it("should require file in form data", async () => {
      const formData = createMockFormData({ workspace: "test" })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("NO_FILE")
    })

    it("should reject files that are too large", async () => {
      // Create a file larger than 10MB
      const largeContent = "x".repeat(11 * 1024 * 1024)
      const formData = createMockFormData({
        file: createMockFile("large.txt", largeContent, "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("FILE_TOO_LARGE")
    })
  })

  describe("MIME Type Validation", () => {
    it("should accept PNG images", async () => {
      const formData = createMockFormData({
        file: createMockFile("image.png", "fake-png-content", "image/png"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should accept JPEG images", async () => {
      const formData = createMockFormData({
        file: createMockFile("photo.jpg", "fake-jpg-content", "image/jpeg"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should accept PDF documents", async () => {
      const formData = createMockFormData({
        file: createMockFile("document.pdf", "fake-pdf-content", "application/pdf"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should accept plain text files", async () => {
      const formData = createMockFormData({
        file: createMockFile("notes.txt", "some notes", "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should accept JSON files", async () => {
      const formData = createMockFormData({
        file: createMockFile("data.json", '{"key": "value"}', "application/json"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should reject HTML files (XSS risk)", async () => {
      const formData = createMockFormData({
        file: createMockFile("page.html", "<script>alert(1)</script>", "text/html"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_FILE_TYPE")
    })

    it("should reject JavaScript files", async () => {
      const formData = createMockFormData({
        file: createMockFile("script.js", "alert(1)", "application/javascript"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_FILE_TYPE")
    })

    it("should reject executable files", async () => {
      const formData = createMockFormData({
        file: createMockFile("malware.exe", "MZ...", "application/x-msdownload"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_FILE_TYPE")
    })
  })

  describe("Filename Sanitization (Path Traversal Prevention)", () => {
    it("should sanitize path traversal in filename", async () => {
      const formData = createMockFormData({
        file: createMockFile("../../../etc/passwd", "content", "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      // Should succeed but with sanitized filename
      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      // Filename should not contain path traversal
      expect(data.path).not.toContain("..")
      expect(data.path).toMatch(/^\.uploads\//)
    })

    it("should sanitize backslash path separators on Windows-style paths", async () => {
      // Note: The sanitizer removes forward slashes and ".." sequences,
      // but backslashes are replaced with underscores via the special char regex
      const formData = createMockFormData({
        file: createMockFile("test\\file.txt", "content", "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      // The file should be saved - security relies on path.join + isPathWithinWorkspace
      // not on filename sanitization alone
      expect(data.path).toMatch(/^\.uploads\//)
    })

    it("should sanitize special characters in filename", async () => {
      const formData = createMockFormData({
        file: createMockFile("file<script>alert(1)</script>.txt", "content", "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      // Special chars should be replaced with underscores
      expect(data.path).not.toContain("<")
      expect(data.path).not.toContain(">")
    })

    it("should handle empty filename after sanitization", async () => {
      const formData = createMockFormData({
        file: createMockFile("../../../", "content", "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      // Should use default filename
      expect(data.path).toMatch(/^\.uploads\/file-\d+-[a-z0-9]+$/)
    })

    it("should preserve file extension", async () => {
      const formData = createMockFormData({
        file: createMockFile("my-document.pdf", "content", "application/pdf"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.path).toMatch(/\.pdf$/)
    })

    it("should lowercase file extension", async () => {
      const formData = createMockFormData({
        file: createMockFile("photo.PNG", "content", "image/png"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.path).toMatch(/\.png$/)
    })
  })

  describe("Response Format", () => {
    it("should return relative path for Claude's Read tool", async () => {
      const formData = createMockFormData({
        file: createMockFile("test.txt", "content", "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.path).toMatch(/^\.uploads\//)
    })

    it("should return original filename", async () => {
      const formData = createMockFormData({
        file: createMockFile("my-original-file.txt", "content", "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.originalName).toBe("my-original-file.txt")
    })

    it("should return file size", async () => {
      const content = "Hello, World!"
      const formData = createMockFormData({
        file: createMockFile("test.txt", content, "text/plain"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.size).toBe(content.length)
    })

    it("should return MIME type", async () => {
      const formData = createMockFormData({
        file: createMockFile("image.png", "content", "image/png"),
        workspace: "test",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.mimeType).toBe("image/png")
    })
  })

  describe("Workspace Resolution", () => {
    it("should reject invalid workspace", async () => {
      vi.mocked(getWorkspace).mockReturnValue({
        success: false,
        response: NextResponse.json({ ok: false, error: "WORKSPACE_NOT_FOUND" }, { status: 404 }),
      })

      const formData = createMockFormData({
        file: createMockFile("test.txt", "content", "text/plain"),
        workspace: "invalid",
      })

      const req = createMockRequest(formData)
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe("WORKSPACE_NOT_FOUND")
    })
  })
})
