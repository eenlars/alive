/**
 * Tests for /api/workspaces/local endpoint
 *
 * This endpoint is only available in standalone mode (STREAM_ENV=standalone)
 * Tests cover:
 * - Authentication (session required)
 * - Environment check (standalone mode only)
 * - GET: List local workspaces
 * - POST: Create new workspace
 * - Error handling (duplicate workspace, path traversal)
 */

import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { COOKIE_NAMES, STANDALONE } from "@webalive/shared"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Store original env
const originalBridgeEnv = process.env.STREAM_ENV

// Test workspace base directory
const TEST_WORKSPACE_BASE = path.join(tmpdir(), "standalone-workspace-test")

// Mock cookies
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

// Mock env
vi.mock("@webalive/env/server", () => ({
  env: {
    get STREAM_ENV() {
      return process.env.STREAM_ENV
    },
  },
}))

// Mock standalone workspace utilities
vi.mock("@/features/workspace/lib/standalone-workspace", () => ({
  getStandaloneWorkspaces: vi.fn(() => ["default", "test-project"]),
  getStandaloneWorkspaceBase: vi.fn(() => TEST_WORKSPACE_BASE),
  standaloneWorkspaceExists: vi.fn((name: string) => name === "default" || name === "test-project"),
  createStandaloneWorkspace: vi.fn((name: string) => {
    if (name.includes("..") || name.includes("/")) {
      throw new Error(`Invalid workspace name: ${name}`)
    }
    return path.join(TEST_WORKSPACE_BASE, name, "user")
  }),
}))

vi.mock("@/features/auth/lib/jwt", () => ({
  verifySessionToken: vi.fn(),
}))

// Import after mocking
const { cookies } = await import("next/headers")
const { verifySessionToken } = await import("@/features/auth/lib/jwt")
const { GET, POST } = await import("../route")

function createMockCookies(sessionValue?: string) {
  return {
    get: vi.fn((name: string) => {
      if (name === COOKIE_NAMES.SESSION && sessionValue) {
        return { value: sessionValue }
      }
      return undefined
    }),
  }
}

describe("GET /api/workspaces/local", () => {
  beforeAll(() => {
    // Create test workspace directory
    if (existsSync(TEST_WORKSPACE_BASE)) {
      rmSync(TEST_WORKSPACE_BASE, { recursive: true })
    }
    mkdirSync(TEST_WORKSPACE_BASE, { recursive: true })
  })

  afterAll(() => {
    // Cleanup
    if (existsSync(TEST_WORKSPACE_BASE)) {
      rmSync(TEST_WORKSPACE_BASE, { recursive: true })
    }
    // Restore original env
    process.env.STREAM_ENV = originalBridgeEnv
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STREAM_ENV = "standalone"
    vi.mocked(verifySessionToken).mockImplementation(async token =>
      token === "valid-jwt" ? ({ userId: STANDALONE.TEST_USER.ID } as any) : null,
    )
  })

  afterEach(() => {
    process.env.STREAM_ENV = originalBridgeEnv
  })

  describe("Environment Checks", () => {
    it("should return 400 if not in standalone mode", async () => {
      process.env.STREAM_ENV = "local"
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const response = await GET(new Request("http://localhost/api/workspaces/local"))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("INVALID_REQUEST")
      expect(data.message).toContain("standalone mode")
    })

    it("should return 400 in production mode", async () => {
      process.env.STREAM_ENV = "production"
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const response = await GET(new Request("http://localhost/api/workspaces/local"))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })
  })

  describe("Authentication", () => {
    it("should return 401 without session cookie", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies() as any)

      const response = await GET(new Request("http://localhost/api/workspaces/local"))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("NO_SESSION")
    })

    it("should return 401 with invalid session value", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("invalid-session") as any)

      const response = await GET(new Request("http://localhost/api/workspaces/local"))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("NO_SESSION")
    })
  })

  describe("Happy Path", () => {
    it("should return list of workspaces with valid session", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const response = await GET(new Request("http://localhost/api/workspaces/local"))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.workspaces).toEqual(["default", "test-project"])
      expect(data.basePath).toBe(TEST_WORKSPACE_BASE)
      expect(data.requestId).toBeDefined()
    })
  })
})

describe("POST /api/workspaces/local", () => {
  beforeAll(() => {
    if (existsSync(TEST_WORKSPACE_BASE)) {
      rmSync(TEST_WORKSPACE_BASE, { recursive: true })
    }
    mkdirSync(TEST_WORKSPACE_BASE, { recursive: true })
  })

  afterAll(() => {
    if (existsSync(TEST_WORKSPACE_BASE)) {
      rmSync(TEST_WORKSPACE_BASE, { recursive: true })
    }
    process.env.STREAM_ENV = originalBridgeEnv
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STREAM_ENV = "standalone"
    vi.mocked(verifySessionToken).mockImplementation(async token =>
      token === "valid-jwt" ? ({ userId: STANDALONE.TEST_USER.ID } as any) : null,
    )
  })

  afterEach(() => {
    process.env.STREAM_ENV = originalBridgeEnv
  })

  function createMockRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/workspaces/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  describe("Environment Checks", () => {
    it("should return 400 if not in standalone mode", async () => {
      process.env.STREAM_ENV = "local"
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const req = createMockRequest({ name: "new-workspace" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })
  })

  describe("Authentication", () => {
    it("should return 401 without session", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies() as any)

      const req = createMockRequest({ name: "new-workspace" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("NO_SESSION")
    })
  })

  describe("Validation", () => {
    it("should return 400 for empty workspace name", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const req = createMockRequest({ name: "" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })

    it("should return 400 for invalid JSON body", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const req = new Request("http://localhost/api/workspaces/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_JSON")
    })

    it("should return 400 for workspace name with invalid characters", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const req = createMockRequest({ name: "my workspace!" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })
  })

  describe("Path Traversal Prevention", () => {
    it("should block path traversal attempts with ..", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const req = createMockRequest({ name: "../../../etc" })
      const response = await POST(req)
      await response.json()

      // Should fail validation (regex doesn't allow dots or slashes)
      expect(response.status).toBe(400)
    })

    it("should block path traversal with slashes", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const req = createMockRequest({ name: "foo/bar" })
      const response = await POST(req)
      await response.json()

      expect(response.status).toBe(400)
    })
  })

  describe("Duplicate Workspace", () => {
    it("should return 409 for existing workspace name", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const req = createMockRequest({ name: "default" }) // "default" exists per mock
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe("WORKSPACE_EXISTS")
      expect(data.message).toContain("default")
    })
  })

  describe("Happy Path", () => {
    it("should create new workspace successfully", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const req = createMockRequest({ name: "new-project" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.workspace.name).toBe("new-project")
      expect(data.workspace.path).toBe(path.join(TEST_WORKSPACE_BASE, "new-project", "user"))
    })

    it("should allow workspace names with hyphens and underscores", async () => {
      vi.mocked(cookies).mockResolvedValue(createMockCookies("valid-jwt") as any)

      const req = createMockRequest({ name: "my-project_v2" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.workspace.name).toBe("my-project_v2")
    })
  })
})
