/**
 * HTTP Layer Tests for /api/worktrees
 *
 * These tests verify the HTTP contract (status codes, error responses, auth checks).
 * Business logic mocking is intentional - the actual worktree operations are tested
 * with real git repositories in:
 *   @see apps/web/features/worktrees/lib/__tests__/worktrees.test.ts
 *
 * This separation allows:
 * - Fast HTTP layer tests that don't need git setup
 * - Comprehensive integration tests for git operations in worktrees.test.ts
 */
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"

vi.mock("@/features/auth/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/lib/auth")>("@/features/auth/lib/auth")
  return {
    ...actual,
    getSessionUser: vi.fn(),
    verifyWorkspaceAccess: vi.fn(),
  }
})

vi.mock("@/features/chat/lib/workspaceRetriever", () => ({
  getWorkspace: vi.fn(),
}))

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: any) => void) => {
    const scope = {
      setTag: vi.fn(),
      setContext: vi.fn(),
    }
    cb(scope)
    return scope
  }),
}))

vi.mock("@/features/worktrees/lib/worktrees", async () => {
  const actual = await vi.importActual<typeof import("@/features/worktrees/lib/worktrees")>(
    "@/features/worktrees/lib/worktrees",
  )
  return {
    ...actual,
    listWorktrees: vi.fn(),
    createWorktree: vi.fn(),
    removeWorktree: vi.fn(),
  }
})

const { GET, POST, DELETE } = await import("../route")
const { getSessionUser, verifyWorkspaceAccess } = await import("@/features/auth/lib/auth")
const { getWorkspace } = await import("@/features/chat/lib/workspaceRetriever")
const { WorktreeError, listWorktrees, createWorktree, removeWorktree } = await import(
  "@/features/worktrees/lib/worktrees"
)
const Sentry = await import("@sentry/nextjs")

const MOCK_USER: SessionUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

function createRequest(url: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe("/api/worktrees", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
    vi.mocked(verifyWorkspaceAccess).mockResolvedValue("example.com")
    vi.mocked(getWorkspace).mockResolvedValue({
      success: true,
      workspace: "/tmp/example/user",
    })

    vi.mocked(listWorktrees).mockResolvedValue([
      { slug: "feature", pathRelative: "feature", branch: "worktree/feature", head: "abc", path: "" },
    ])

    vi.mocked(createWorktree).mockResolvedValue({
      slug: "feature",
      branch: "worktree/feature",
      worktreePath: "/tmp/example/worktrees/feature",
    })

    vi.mocked(removeWorktree).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it("GET returns 401 without session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const req = createRequest("http://localhost/api/worktrees?workspace=example.com", "GET")
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toBe(ErrorCodes.NO_SESSION)
  })

  it("GET returns 400 when workspace missing", async () => {
    const req = createRequest("http://localhost/api/worktrees", "GET")
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.WORKSPACE_MISSING)
  })

  it("GET returns 401 when workspace not authorized", async () => {
    vi.mocked(verifyWorkspaceAccess).mockResolvedValue(null)

    const req = createRequest("http://localhost/api/worktrees?workspace=example.com", "GET")
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toBe(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED)
  })

  it("GET returns worktrees", async () => {
    const req = createRequest("http://localhost/api/worktrees?workspace=example.com", "GET")
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.worktrees).toHaveLength(1)
    expect(data.worktrees[0].slug).toBe("feature")
  })

  it("GET maps worktree errors", async () => {
    vi.mocked(listWorktrees).mockRejectedValue(new WorktreeError("WORKTREE_NOT_FOUND", "missing"))

    const req = createRequest("http://localhost/api/worktrees?workspace=example.com", "GET")
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe(ErrorCodes.WORKTREE_NOT_FOUND)
  })

  it("POST returns 400 when workspace is empty", async () => {
    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "",
      slug: "feature",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.WORKSPACE_MISSING)
  })

  it("POST returns 400 when workspace is whitespace only", async () => {
    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "   ",
      slug: "feature",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.WORKSPACE_MISSING)
  })

  it("POST returns 400 on invalid slug", async () => {
    // Invalid slugs are now caught by Zod schema validation before reaching createWorktree
    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "example.com",
      slug: "bad/slug",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    // Schema validation returns VALIDATION_ERROR with details about the invalid slug
    expect(data.error.code).toBe(ErrorCodes.VALIDATION_ERROR)
    expect(data.error.issues[0].path).toContain("slug")
  })

  it("POST returns 400 on invalid branch name", async () => {
    vi.mocked(createWorktree).mockRejectedValue(new WorktreeError("WORKTREE_INVALID_BRANCH", "bad branch"))

    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "example.com",
      slug: "feature",
      branch: "bad branch",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.WORKTREE_INVALID_BRANCH)
  })

  it("POST returns 409 when worktree already exists", async () => {
    vi.mocked(createWorktree).mockRejectedValue(new WorktreeError("WORKTREE_EXISTS", "exists"))

    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "example.com",
      slug: "feature",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.error).toBe(ErrorCodes.WORKTREE_EXISTS)
  })

  it("POST returns 409 when lock held", async () => {
    vi.mocked(createWorktree).mockRejectedValue(new WorktreeError("WORKTREE_LOCKED", "locked"))

    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "example.com",
      slug: "feature",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.error).toBe(ErrorCodes.WORKTREE_LOCKED)
  })

  it("POST returns 400 on invalid base ref", async () => {
    vi.mocked(createWorktree).mockRejectedValue(new WorktreeError("WORKTREE_INVALID_FROM", "bad ref"))

    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "example.com",
      slug: "feature",
      from: "does-not-exist",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.WORKTREE_INVALID_FROM)
  })

  it("POST returns 404 when base workspace is not a git repo", async () => {
    vi.mocked(createWorktree).mockRejectedValue(new WorktreeError("WORKTREE_NOT_GIT", "not git"))

    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "example.com",
      slug: "feature",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe(ErrorCodes.WORKTREE_NOT_GIT)
  })

  it("POST creates a worktree", async () => {
    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "example.com",
      slug: "feature",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.slug).toBe("feature")
  })

  it("DELETE returns 400 when workspace missing", async () => {
    const req = createRequest("http://localhost/api/worktrees?slug=feature", "DELETE")
    const res = await DELETE(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.WORKSPACE_MISSING)
  })

  it("DELETE returns 400 when slug missing", async () => {
    const req = createRequest("http://localhost/api/worktrees?workspace=example.com", "DELETE")
    const res = await DELETE(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.MISSING_SLUG)
  })

  it("DELETE maps dirty worktree errors", async () => {
    vi.mocked(removeWorktree).mockRejectedValue(new WorktreeError("WORKTREE_DIRTY", "dirty"))

    const req = createRequest("http://localhost/api/worktrees?workspace=example.com&slug=feature", "DELETE")
    const res = await DELETE(req)
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.error).toBe(ErrorCodes.WORKTREE_DIRTY)
  })

  it("DELETE maps not-found worktree errors", async () => {
    vi.mocked(removeWorktree).mockRejectedValue(new WorktreeError("WORKTREE_NOT_FOUND", "missing"))

    const req = createRequest("http://localhost/api/worktrees?workspace=example.com&slug=feature", "DELETE")
    const res = await DELETE(req)
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe(ErrorCodes.WORKTREE_NOT_FOUND)
  })

  it("DELETE returns 401 when workspace not authorized", async () => {
    vi.mocked(verifyWorkspaceAccess).mockResolvedValue(null)

    const req = createRequest("http://localhost/api/worktrees?workspace=example.com&slug=feature", "DELETE")
    const res = await DELETE(req)
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toBe(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED)
  })

  it("DELETE removes a worktree", async () => {
    const req = createRequest(
      "http://localhost/api/worktrees?workspace=example.com&slug=feature&deleteBranch=true",
      "DELETE",
    )

    const res = await DELETE(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(removeWorktree).toHaveBeenCalledWith({
      baseWorkspacePath: "/tmp/example/user",
      slug: "feature",
      deleteBranch: true,
    })
  })

  describe("WORKTREE_GIT_FAILED error contract", () => {
    const gitDiagnostics = {
      operation: "worktree" as const,
      gitArgs: ["-C", "<workspace>", "worktree", "add", "<workspace>/worktrees/test"],
      exitCode: 128,
      stderrTail: "fatal: invalid reference: main",
    }

    it("returns safe triage details without leaking paths or stderr", async () => {
      const gitError = new WorktreeError(
        "WORKTREE_GIT_FAILED",
        "Git worktree failed (exit 128): fatal: invalid reference: main",
        gitDiagnostics,
      )
      vi.mocked(listWorktrees).mockRejectedValue(gitError)

      const req = createRequest("http://localhost/api/worktrees?workspace=example.com", "GET")
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.error).toBe(ErrorCodes.WORKTREE_GIT_FAILED)
      // Safe fields present
      expect(data.operation).toBe("worktree")
      expect(data.exitCode).toBe(128)
      // Unsafe fields absent from response
      expect(data.stderrTail).toBeUndefined()
      expect(data.gitArgs).toBeUndefined()
      // message is the safe user-facing string from error-codes, not raw stderr
      if (data.message) {
        expect(data.message).not.toContain("/srv/webalive")
        expect(data.message).not.toContain("/tmp/example")
        expect(data.message).not.toContain("fatal:")
      }
    })

    it("calls Sentry.withScope with worktree tags and context", async () => {
      const gitError = new WorktreeError(
        "WORKTREE_GIT_FAILED",
        "Git worktree failed (exit 128): fatal: invalid reference: main",
        gitDiagnostics,
      )
      vi.mocked(createWorktree).mockRejectedValue(gitError)

      const req = createRequest("http://localhost/api/worktrees", "POST", {
        workspace: "example.com",
        slug: "feature",
      })
      await POST(req)

      const withScopeMock = vi.mocked(Sentry.withScope)
      expect(withScopeMock).toHaveBeenCalled()
      // Our mock captures the callback and calls it with a mock scope
      // Extract the scope from the mock's implementation
      const withScopeImpl = vi.mocked(Sentry.withScope).mock.results[0]
      const capturedScope = withScopeImpl.value
      expect(capturedScope.setTag).toHaveBeenCalledWith("worktree.operation", "worktree")
      expect(capturedScope.setTag).toHaveBeenCalledWith("worktree.exitCode", "128")
      expect(capturedScope.setContext).toHaveBeenCalledWith(
        "worktree",
        expect.objectContaining({
          workspace: "example.com",
          slug: "feature",
          operation: "worktree",
          exitCode: 128,
          stderrTail: "fatal: invalid reference: main",
        }),
      )
    })

    it("emits structured JSON log for git failures", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const gitError = new WorktreeError(
        "WORKTREE_GIT_FAILED",
        "Git worktree failed (exit 128): fatal: invalid reference: main",
        gitDiagnostics,
      )
      vi.mocked(removeWorktree).mockRejectedValue(gitError)

      const req = createRequest("http://localhost/api/worktrees?workspace=example.com&slug=feature", "DELETE")
      await DELETE(req)

      const logCall = consoleSpy.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0] as string)
          return parsed.event === "WORKTREE_GIT_FAILED"
        } catch {
          return false
        }
      })

      expect(logCall).toBeDefined()
      const logData = JSON.parse(logCall![0] as string)
      expect(logData.level).toBe("error")
      expect(logData.event).toBe("WORKTREE_GIT_FAILED")
      expect(logData.method).toBe("DELETE")
      expect(logData.workspace).toBe("example.com")
      expect(logData.slug).toBe("feature")
      expect(logData.operation).toBe("worktree")
      expect(logData.exitCode).toBe(128)
      expect(logData.requestId).toBeDefined()

      consoleSpy.mockRestore()
    })
  })
})
