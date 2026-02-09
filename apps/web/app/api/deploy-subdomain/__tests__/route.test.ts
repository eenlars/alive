import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const requireSessionUserMock = vi.fn()
const validateUserOrgAccessMock = vi.fn()
const getUserQuotaMock = vi.fn()
const validateTemplateFromDbMock = vi.fn()
const runStrictDeploymentMock = vi.fn()
const handleBodyMock = vi.fn()
const isHandleBodyErrorMock = vi.fn()

vi.mock("@/features/auth/lib/auth", () => {
  class AuthenticationError extends Error {
    constructor(message = "Authentication required") {
      super(message)
      this.name = "AuthenticationError"
    }
  }

  return {
    AuthenticationError,
    requireSessionUser: () => requireSessionUserMock(),
  }
})

vi.mock("@/features/auth/lib/jwt", () => ({
  createSessionToken: vi.fn(() => "new-session-token"),
  verifySessionToken: vi.fn(() => ({
    workspaces: ["existing.alive.best"],
  })),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: "session-cookie" })),
  })),
}))

vi.mock("@/lib/api/server", () => ({
  handleBody: (...args: unknown[]) => handleBodyMock(...args),
  isHandleBodyError: (...args: unknown[]) => isHandleBodyErrorMock(...args),
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

vi.mock("@/lib/deployment/template-validation", () => ({
  validateTemplateFromDb: (...args: unknown[]) => validateTemplateFromDbMock(...args),
}))

vi.mock("@/lib/deployment/deploy-pipeline", () => ({
  runStrictDeployment: (...args: unknown[]) => runStrictDeploymentMock(...args),
}))

vi.mock("@/lib/deployment/template-stats", () => ({
  incrementTemplateDeployCount: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/deployment/ssl-validation", () => ({
  validateSSLCertificate: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/error-logger", () => ({
  errorLogger: { capture: vi.fn() },
}))

vi.mock("@/lib/siteMetadataStore", () => ({
  siteMetadataStore: {
    exists: vi.fn(() => false),
    setSite: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock("@webalive/site-controller", () => {
  class DeploymentError extends Error {
    code = "DEPLOY_FAILED"
    statusCode = 500
  }

  return {
    DeploymentError,
  }
})

vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
  }
})

const { POST } = await import("../route")

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/deploy-subdomain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/deploy-subdomain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionUserMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
    })
    handleBodyMock.mockResolvedValue({
      slug: "testsite",
      siteIdeas: "A test site",
      templateId: "tmpl_blank",
      orgId: "org-1",
    })
    isHandleBodyErrorMock.mockReturnValue(false)
    validateUserOrgAccessMock.mockResolvedValue(true)
    getUserQuotaMock.mockResolvedValue({
      canCreateSite: true,
      maxSites: 10,
      currentSites: 1,
    })
    validateTemplateFromDbMock.mockResolvedValue({
      valid: true,
      template: {
        template_id: "tmpl_blank",
        source_path: "/srv/webalive/sites/blank.alive.best",
      },
    })
    runStrictDeploymentMock.mockResolvedValue({
      domain: "testsite.alive.best",
      port: 3700,
      serviceName: "site@testsite-alive-best.service",
    })
  })

  it("requires authentication", async () => {
    const { AuthenticationError } = await import("@/features/auth/lib/auth")
    requireSessionUserMock.mockRejectedValueOnce(new AuthenticationError())

    const response = await POST(createRequest({ slug: "testsite", siteIdeas: "Test", templateId: "tmpl_blank" }))

    expect(response.status).toBe(401)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe(ErrorCodes.UNAUTHORIZED)
    expect(runStrictDeploymentMock).not.toHaveBeenCalled()
  })

  it("uses the strict deployment pipeline for authenticated users", async () => {
    const response = await POST(
      createRequest({
        slug: "testsite",
        siteIdeas: "Test",
        templateId: "tmpl_blank",
        orgId: "org-1",
      }),
    )

    expect(response.status).toBe(200)
    expect(runStrictDeploymentMock).toHaveBeenCalledOnce()
    expect(runStrictDeploymentMock.mock.calls[0][0]).toMatchObject({
      domain: "testsite.alive.best",
      email: "owner@example.com",
      orgId: "org-1",
      templatePath: "/srv/webalive/sites/blank.alive.best",
    })
    expect(runStrictDeploymentMock.mock.calls[0][0]).not.toHaveProperty("password")
  })

  it("returns 403 when site quota is exceeded", async () => {
    getUserQuotaMock.mockResolvedValueOnce({
      canCreateSite: false,
      maxSites: 3,
      currentSites: 3,
    })

    const response = await POST(
      createRequest({ slug: "testsite", siteIdeas: "Test", templateId: "tmpl_blank", orgId: "org-1" }),
    )

    expect(response.status).toBe(403)
    expect(runStrictDeploymentMock).not.toHaveBeenCalled()
  })
})
