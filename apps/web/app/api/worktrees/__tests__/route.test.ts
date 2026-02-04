import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"
import type { SessionUser } from "@/features/auth/lib/auth"

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

const MOCK_USER: SessionUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
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
    vi.mocked(getWorkspace).mockReturnValue({
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

  it("POST returns 400 on invalid slug", async () => {
    vi.mocked(createWorktree).mockRejectedValue(new WorktreeError("WORKTREE_INVALID_SLUG", "bad slug"))

    const req = createRequest("http://localhost/api/worktrees", "POST", {
      workspace: "example.com",
      slug: "bad/slug",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.WORKTREE_INVALID_SLUG)
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
})
