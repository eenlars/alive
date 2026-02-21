import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const getSessionUserMock = vi.fn()
const validateUserOrgAccessMock = vi.fn()
const getUserQuotaMock = vi.fn()
const parseGithubRepoMock = vi.fn((_url: string) => ({ owner: "example", repo: "repo" }))
const importGithubRepoMock = vi.fn()
const cleanupImportDirMock = vi.fn()
const getAccessTokenMock = vi.fn()
const runStrictDeploymentMock = vi.fn()
const siteMetadataExistsMock = vi.fn((_slug: string) => false)

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: () => getSessionUserMock(),
}))

vi.mock("@/features/auth/lib/jwt", () => ({
  createSessionToken: vi.fn(() => "new-session-token"),
  verifySessionToken: vi.fn(() => ({
    orgIds: ["org-123"],
    scopes: [],
    orgRoles: {},
  })),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: "session-cookie" })),
  })),
}))

vi.mock("@/lib/api/server", () => ({
  handleBody: vi.fn(() => ({
    slug: "testsite",
    repoUrl: "https://github.com/example/repo",
    orgId: "org-1",
    siteIdeas: "imported site",
  })),
  isHandleBodyError: vi.fn(() => false),
  alrighty: vi.fn((_endpoint: string, payload: Record<string, unknown>) => {
    const response = new Response(JSON.stringify(payload), { status: 200 })
    ;(response as Response & { cookies: { set: typeof vi.fn } }).cookies = { set: vi.fn() }
    return response
  }),
}))

vi.mock("@/lib/api/responses", () => ({
  structuredErrorResponse: vi.fn(
    (code: string, opts: { status: number; details?: Record<string, unknown> }) =>
      new Response(JSON.stringify({ ok: false, error: code, ...opts.details }), { status: opts.status }),
  ),
}))

vi.mock("@/lib/config", () => ({
  buildSubdomain: vi.fn((slug: string) => `${slug}.alive.best`),
}))

vi.mock("@/lib/deployment/org-resolver", () => ({
  validateUserOrgAccess: (...args: unknown[]) => validateUserOrgAccessMock(...args),
}))

vi.mock("@/lib/deployment/user-quotas", () => ({
  getUserQuota: (...args: unknown[]) => getUserQuotaMock(...args),
}))

vi.mock("@/lib/deployment/github-import", () => ({
  parseGithubRepo: (url: string) => parseGithubRepoMock(url),
  importGithubRepo: (...args: unknown[]) => importGithubRepoMock(...args),
  cleanupImportDir: (...args: unknown[]) => cleanupImportDirMock(...args),
}))

vi.mock("@/lib/deployment/deploy-pipeline", () => ({
  runStrictDeployment: (...args: unknown[]) => runStrictDeploymentMock(...args),
}))

vi.mock("@/lib/deployment/ssl-validation", () => ({
  validateSSLCertificate: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/oauth/oauth-instances", () => ({
  getOAuthInstance: vi.fn(() => ({
    getAccessToken: (...args: unknown[]) => getAccessTokenMock(...args),
  })),
}))

vi.mock("@/lib/error-logger", () => ({
  errorLogger: { capture: vi.fn() },
}))

vi.mock("@/lib/siteMetadataStore", () => ({
  siteMetadataStore: {
    exists: (slug: string) => siteMetadataExistsMock(slug),
    setSite: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock("@webalive/shared", async importOriginal => {
  const actual = await importOriginal<typeof import("@webalive/shared")>()
  return {
    ...actual,
    getOAuthKeyForProvider: vi.fn(() => "github"),
  }
})

const { POST } = await import("../route")

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/import-repo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/import-repo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSessionUserMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
    })
    validateUserOrgAccessMock.mockResolvedValue(true)
    getUserQuotaMock.mockResolvedValue({
      canCreateSite: true,
      maxSites: 10,
      currentSites: 1,
    })
    getAccessTokenMock.mockResolvedValue("github-token")
    siteMetadataExistsMock.mockReturnValue(false)
    parseGithubRepoMock.mockReturnValue({ owner: "example", repo: "repo" })
    importGithubRepoMock.mockResolvedValue({
      templatePath: "/tmp/import/template",
      cleanupDir: "/tmp/import",
    })
    runStrictDeploymentMock.mockResolvedValue({
      domain: "testsite.alive.best",
      port: 3700,
      serviceName: "site@testsite-alive-best.service",
    })
  })

  it("requires authentication", async () => {
    getSessionUserMock.mockResolvedValueOnce(null)

    const response = await POST(createRequest({ slug: "testsite", repoUrl: "https://github.com/example/repo" }))

    expect(response.status).toBe(401)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe(ErrorCodes.UNAUTHORIZED)
    expect(runStrictDeploymentMock).not.toHaveBeenCalled()
  })

  it("uses the strict deployment pipeline for GitHub imports", async () => {
    const response = await POST(
      createRequest({
        slug: "testsite",
        repoUrl: "https://github.com/example/repo",
        orgId: "org-1",
      }),
    )

    expect(response.status).toBe(200)
    expect(runStrictDeploymentMock).toHaveBeenCalledOnce()
    expect(runStrictDeploymentMock.mock.calls[0][0]).toMatchObject({
      domain: "testsite.alive.best",
      email: "owner@example.com",
      orgId: "org-1",
      templatePath: "/tmp/import/template",
    })
    expect(cleanupImportDirMock).toHaveBeenCalledWith("/tmp/import")
  })

  it("returns 403 when site quota is exceeded", async () => {
    getUserQuotaMock.mockResolvedValueOnce({
      canCreateSite: false,
      maxSites: 3,
      currentSites: 3,
    })

    const response = await POST(
      createRequest({
        slug: "testsite",
        repoUrl: "https://github.com/example/repo",
        orgId: "org-1",
      }),
    )

    expect(response.status).toBe(403)
    expect(runStrictDeploymentMock).not.toHaveBeenCalled()
    expect(cleanupImportDirMock).not.toHaveBeenCalled()
  })

  it("returns 409 when slug already exists", async () => {
    siteMetadataExistsMock.mockReturnValueOnce(true)

    const response = await POST(
      createRequest({
        slug: "testsite",
        repoUrl: "https://github.com/example/repo",
      }),
    )

    expect(response.status).toBe(409)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe(ErrorCodes.SLUG_TAKEN)
    expect(runStrictDeploymentMock).not.toHaveBeenCalled()
  })

  it("returns 400 when repository format is invalid", async () => {
    parseGithubRepoMock.mockImplementationOnce(() => {
      throw new Error("Invalid GitHub repo format")
    })

    const response = await POST(
      createRequest({
        slug: "testsite",
        repoUrl: "invalid-input",
      }),
    )

    expect(response.status).toBe(400)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe(ErrorCodes.VALIDATION_ERROR)
    expect(runStrictDeploymentMock).not.toHaveBeenCalled()
  })

  it("returns 400 when download fails", async () => {
    importGithubRepoMock.mockRejectedValueOnce(new Error("Repository example/repo not found"))

    const response = await POST(
      createRequest({
        slug: "testsite",
        repoUrl: "https://github.com/example/repo",
      }),
    )

    expect(response.status).toBe(400)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe(ErrorCodes.GITHUB_CLONE_FAILED)
  })

  it("proceeds without GitHub token for public repos", async () => {
    getAccessTokenMock.mockResolvedValueOnce(null)

    const response = await POST(
      createRequest({
        slug: "testsite",
        repoUrl: "https://github.com/example/repo",
        orgId: "org-1",
      }),
    )

    expect(response.status).toBe(200)
    expect(importGithubRepoMock).toHaveBeenCalledWith("https://github.com/example/repo", undefined, undefined)
  })

  it("proceeds without GitHub token when OAuth throws", async () => {
    getAccessTokenMock.mockRejectedValueOnce(new Error("OAuth not configured"))

    const response = await POST(
      createRequest({
        slug: "testsite",
        repoUrl: "https://github.com/example/repo",
        orgId: "org-1",
      }),
    )

    expect(response.status).toBe(200)
    expect(importGithubRepoMock).toHaveBeenCalledWith("https://github.com/example/repo", undefined, undefined)
  })

  it("passes GitHub token when available", async () => {
    getAccessTokenMock.mockResolvedValueOnce("github-token-123")

    const response = await POST(
      createRequest({
        slug: "testsite",
        repoUrl: "https://github.com/example/repo",
        orgId: "org-1",
      }),
    )

    expect(response.status).toBe(200)
    expect(importGithubRepoMock).toHaveBeenCalledWith("https://github.com/example/repo", "github-token-123", undefined)
  })
})
