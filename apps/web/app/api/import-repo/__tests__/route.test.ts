import { existsSync } from "node:fs"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const { mockCookieStore, mockGetAccessToken } = vi.hoisted(() => ({
  mockCookieStore: {
    get: vi.fn(() => ({ value: "session-cookie" })),
  },
  mockGetAccessToken: vi.fn(),
}))

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}))

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/features/auth/lib/jwt", () => ({
  createSessionToken: vi.fn(),
  verifySessionToken: vi.fn(),
}))

vi.mock("@/lib/deployment/org-resolver", () => ({
  validateUserOrgAccess: vi.fn(),
}))

vi.mock("@/lib/deployment/user-quotas", () => ({
  getUserQuota: vi.fn(),
}))

vi.mock("@/lib/config", () => ({
  buildSubdomain: vi.fn(),
}))

vi.mock("@/lib/siteMetadataStore", () => ({
  siteMetadataStore: {
    exists: vi.fn(),
    setSite: vi.fn(),
  },
}))

vi.mock("@/lib/deployment/github-import", () => ({
  parseGithubRepo: vi.fn(),
  importGithubRepo: vi.fn(),
  cleanupImportDir: vi.fn(),
}))

vi.mock("@/lib/deployment/deploy-site", () => ({
  deploySite: vi.fn(),
}))

vi.mock("@/lib/deployment/domain-registry", () => ({
  DomainRegistrationError: class DomainRegistrationError extends Error {
    errorCode = "DOMAIN_ALREADY_EXISTS"
    details = {}
  },
  registerDomain: vi.fn(),
}))

vi.mock("@/lib/oauth/oauth-instances", () => ({
  getOAuthInstance: vi.fn(() => ({
    getAccessToken: mockGetAccessToken,
  })),
}))

vi.mock("@/types/guards/api", () => ({
  loadDomainPasswords: vi.fn(),
}))

vi.mock("@/lib/deployment/ssl-validation", () => ({
  validateSSLCertificate: vi.fn(),
}))

vi.mock("@/lib/error-logger", () => ({
  errorLogger: {
    capture: vi.fn(),
  },
}))

const { POST } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { createSessionToken, verifySessionToken } = await import("@/features/auth/lib/jwt")
const { validateUserOrgAccess } = await import("@/lib/deployment/org-resolver")
const { getUserQuota } = await import("@/lib/deployment/user-quotas")
const { buildSubdomain } = await import("@/lib/config")
const { siteMetadataStore } = await import("@/lib/siteMetadataStore")
const { parseGithubRepo, importGithubRepo, cleanupImportDir } = await import("@/lib/deployment/github-import")
const { deploySite } = await import("@/lib/deployment/deploy-site")
const { registerDomain } = await import("@/lib/deployment/domain-registry")
const { loadDomainPasswords } = await import("@/types/guards/api")

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "User One",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

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
    process.env.SKIP_SSL_VALIDATION = "true"

    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(getSessionUser).mockResolvedValue(TEST_USER)
    vi.mocked(validateUserOrgAccess).mockResolvedValue(true)
    vi.mocked(getUserQuota).mockResolvedValue({
      canCreateSite: true,
      maxSites: 10,
      currentSites: 1,
    })
    vi.mocked(buildSubdomain).mockReturnValue("imported.alive.test")
    vi.mocked(siteMetadataStore.exists).mockResolvedValue(false)
    vi.mocked(siteMetadataStore.setSite).mockResolvedValue(undefined)
    vi.mocked(parseGithubRepo).mockReturnValue({ owner: "octocat", repo: "Hello-World" })
    vi.mocked(importGithubRepo).mockReturnValue({
      templatePath: "/tmp/import-template",
      cleanupDir: "/tmp/github-import-test",
    })
    vi.mocked(deploySite).mockResolvedValue({
      port: 3888,
      domain: "imported.alive.test",
      serviceName: "site-imported",
    })
    vi.mocked(registerDomain).mockResolvedValue(true)
    vi.mocked(loadDomainPasswords).mockReturnValue({
      "imported.alive.test": { port: 3888 },
    })
    vi.mocked(verifySessionToken).mockResolvedValue({
      sub: TEST_USER.id,
      userId: TEST_USER.id,
      email: TEST_USER.email,
      name: TEST_USER.name,
      workspaces: ["existing.alive.test"],
      iat: 1,
      exp: 2,
    })
    vi.mocked(createSessionToken).mockResolvedValue("new-session-token")
    mockGetAccessToken.mockResolvedValue(null)
    mockCookieStore.get.mockReturnValue({ value: "session-cookie" })
  })

  afterEach(() => {
    delete process.env.SKIP_SSL_VALIDATION
  })

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const response = await POST(
      createRequest({
        slug: "my-repo",
        repoUrl: "octocat/Hello-World",
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
  })

  it("imports public repositories when GitHub token is missing", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({
      sub: TEST_USER.id,
      userId: TEST_USER.id,
      email: TEST_USER.email,
      name: TEST_USER.name,
      workspaces: ["existing.alive.test", "imported.alive.test"],
      iat: 1,
      exp: 2,
    })

    const response = await POST(
      createRequest({
        slug: "my-repo",
        repoUrl: "octocat/Hello-World",
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.domain).toBe("imported.alive.test")
    expect(data.chatUrl).toBe("/chat?wk=imported.alive.test")
    expect(importGithubRepo).toHaveBeenCalledWith("octocat/Hello-World", null, undefined)
    expect(createSessionToken).toHaveBeenCalledWith(TEST_USER.id, TEST_USER.email, TEST_USER.name, [
      "existing.alive.test",
      "imported.alive.test",
    ])
    expect(cleanupImportDir).toHaveBeenCalledWith("/tmp/github-import-test")
  })

  it("returns 409 when slug already exists", async () => {
    vi.mocked(siteMetadataStore.exists).mockResolvedValue(true)

    const response = await POST(
      createRequest({
        slug: "my-repo",
        repoUrl: "octocat/Hello-World",
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error).toBe(ErrorCodes.SLUG_TAKEN)
  })

  it("returns 400 when repository format is invalid", async () => {
    vi.mocked(parseGithubRepo).mockImplementation(() => {
      throw new Error("Invalid GitHub repo format")
    })

    const response = await POST(
      createRequest({
        slug: "my-repo",
        repoUrl: "invalid-input",
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.VALIDATION_ERROR)
  })

  it("returns 400 when clone fails", async () => {
    vi.mocked(importGithubRepo).mockImplementation(() => {
      throw new Error("Git clone failed: not found")
    })

    const response = await POST(
      createRequest({
        slug: "my-repo",
        repoUrl: "octocat/Hello-World",
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe(ErrorCodes.GITHUB_CLONE_FAILED)
  })
})
