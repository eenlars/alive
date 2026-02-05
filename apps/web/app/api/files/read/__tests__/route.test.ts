/**
 * Tests for POST /api/files/read endpoint
 *
 * Security-critical tests:
 * - Authentication required (session cookie)
 * - Workspace boundary enforcement
 * - Path traversal prevention
 * - Binary file rejection
 * - File size limits
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Mock cookies
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

// Mock auth guards
vi.mock("@/features/auth/types/guards", () => ({
  hasSessionCookie: vi.fn(),
}))

// Mock auth functions
vi.mock("@/features/auth/lib/auth", async () => {
  const { NextResponse } = await import("next/server")
  return {
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
const { cookies } = await import("next/headers")
const { hasSessionCookie } = await import("@/features/auth/types/guards")
const { getWorkspace } = await import("@/features/chat/lib/workspaceRetriever")

// Test workspace directory
const TEST_WORKSPACE = path.join(tmpdir(), "read-test-workspace")

// Response types for type-safe assertions
interface ReadSuccessResponse {
  ok: true
  path: string
  filename: string
  content: string
  language: string
  size: number
}

interface ReadErrorResponse {
  ok: false
  error: string
  requestId?: string
}

type ReadResponse = ReadSuccessResponse | ReadErrorResponse

function createMockRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/files/read", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/files/read", () => {
  beforeAll(() => {
    // Create test workspace
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true })
    }
    mkdirSync(TEST_WORKSPACE, { recursive: true })

    // Create test files
    writeFileSync(path.join(TEST_WORKSPACE, "test.txt"), "Hello, World!")
    writeFileSync(path.join(TEST_WORKSPACE, "test.ts"), 'const x = "typescript"')
    writeFileSync(path.join(TEST_WORKSPACE, "large.txt"), "x".repeat(2 * 1024 * 1024)) // 2MB file

    // Create nested directory
    mkdirSync(path.join(TEST_WORKSPACE, "src"), { recursive: true })
    writeFileSync(path.join(TEST_WORKSPACE, "src", "app.tsx"), "export default function App() {}")
  })

  afterAll(() => {
    // Cleanup test workspace
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true })
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Default: valid session cookie
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid-session-token" }),
    } as never)
    vi.mocked(hasSessionCookie).mockReturnValue(true)

    // Default: valid workspace
    vi.mocked(getWorkspace).mockResolvedValue({
      success: true,
      workspace: TEST_WORKSPACE,
    })
  })

  describe("Authentication", () => {
    it("should require session cookie (401 without session)", async () => {
      vi.mocked(hasSessionCookie).mockReturnValue(false)

      const req = createMockRequest({ path: "test.txt" })
      const response = await POST(req)
      const data: ReadResponse = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      if (!data.ok) expect(data.error).toBe("NO_SESSION")
    })

    it("should allow authenticated users", async () => {
      const req = createMockRequest({ path: "test.txt" })
      const response = await POST(req)
      const data: ReadResponse = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      if (data.ok) expect(data.content).toBe("Hello, World!")
    })
  })

  describe("Path Validation", () => {
    it("should require path parameter", async () => {
      const req = createMockRequest({})
      const response = await POST(req)
      const data: ReadErrorResponse = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })

    it("should reject non-string path", async () => {
      const req = createMockRequest({ path: 123 })
      const response = await POST(req)
      const data: ReadErrorResponse = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })
  })

  describe("Path Traversal Prevention", () => {
    it("should block path traversal with ../", async () => {
      const req = createMockRequest({ path: "../../../etc/passwd" })
      const response = await POST(req)
      const data: ReadErrorResponse = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("PATH_OUTSIDE_WORKSPACE")
    })

    it("should block deeply nested traversal attempts", async () => {
      const req = createMockRequest({ path: "src/../../../../../../etc/passwd" })
      const response = await POST(req)
      const data: ReadErrorResponse = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("PATH_OUTSIDE_WORKSPACE")
    })

    it("should block encoded traversal attempts", async () => {
      const req = createMockRequest({ path: "..%2F..%2Fetc/passwd" })
      const response = await POST(req)

      // Either 403 (blocked) or 404 (file not found after safe resolution) is acceptable
      expect([403, 404]).toContain(response.status)
    })

    it("should allow paths that look suspicious but resolve inside workspace", async () => {
      mkdirSync(path.join(TEST_WORKSPACE, "a", "b"), { recursive: true })
      writeFileSync(path.join(TEST_WORKSPACE, "a", "b", "file.txt"), "nested content")

      const req = createMockRequest({ path: "a/b/../b/file.txt" })
      const response = await POST(req)
      const data: ReadResponse = await response.json()

      expect(response.status).toBe(200)
      if (data.ok) expect(data.content).toBe("nested content")

      rmSync(path.join(TEST_WORKSPACE, "a"), { recursive: true })
    })
  })

  describe("Binary File Rejection", () => {
    const BINARY_EXTENSIONS = ["png", "jpg", "jpeg", "pdf", "sqlite", "exe", "gif", "webp", "mp3", "mp4", "zip"]

    it.each(BINARY_EXTENSIONS)("should reject .%s files", async ext => {
      const req = createMockRequest({ path: `file.${ext}` })
      const response = await POST(req)
      const data: { ok: boolean; error: string } = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("BINARY_FILE_NOT_SUPPORTED")
    })
  })

  describe("File Size Limits", () => {
    it("should reject files larger than 1MB", async () => {
      const req = createMockRequest({ path: "large.txt" })
      const response = await POST(req)
      const data: ReadErrorResponse = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("FILE_TOO_LARGE_TO_READ")
    })
  })

  describe("File Reading", () => {
    it("should read a text file with correct metadata", async () => {
      const req = createMockRequest({ path: "test.txt" })
      const response = await POST(req)
      const data: ReadResponse = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      if (data.ok) {
        expect(data.content).toBe("Hello, World!")
        expect(data.filename).toBe("test.txt")
        expect(data.language).toBe("plaintext")
        expect(data.size).toBe(13)
      }
    })

    it.each([
      ["test.ts", "typescript"],
      ["src/app.tsx", "typescript"],
    ])("should detect %s as %s language", async (filePath, expectedLang) => {
      const req = createMockRequest({ path: filePath })
      const response = await POST(req)
      const data: ReadResponse = await response.json()

      expect(response.status).toBe(200)
      if (data.ok) expect(data.language).toBe(expectedLang)
    })

    it("should return 404 for non-existent file", async () => {
      const req = createMockRequest({ path: "does-not-exist.txt" })
      const response = await POST(req)
      const data: ReadErrorResponse = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe("FILE_NOT_FOUND")
    })

    it("should return error for directory", async () => {
      const req = createMockRequest({ path: "src" })
      const response = await POST(req)
      const data: ReadErrorResponse = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("PATH_IS_DIRECTORY")
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
      const data: ReadErrorResponse = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe("WORKSPACE_NOT_FOUND")
    })
  })
})
