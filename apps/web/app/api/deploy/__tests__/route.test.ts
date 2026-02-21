import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const requireSessionUserMock = vi.fn()
const validateUserOrgAccessMock = vi.fn()
const getUserQuotaMock = vi.fn()
const validateTemplateFromDbMock = vi.fn()
const runStrictDeploymentMock = vi.fn()
const validateSSLCertificateMock = vi.fn()

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

vi.mock("@/lib/api/responses", () => ({
  structuredErrorResponse: (code: string, opts: { status: number; details?: Record<string, unknown> }) =>
    new Response(JSON.stringify({ ok: false, error: code, ...opts.details }), { status: opts.status }),
}))

vi.mock("@/features/manager/lib/domain-utils", () => ({
  normalizeAndValidateDomain: vi.fn(() => ({
    domain: "example.com",
    isValid: true,
  })),
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

vi.mock("@/lib/deployment/ssl-validation", () => ({
  validateSSLCertificate: (...args: unknown[]) => validateSSLCertificateMock(...args),
}))

const { POST } = await import("../route")

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/deploy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionUserMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
    })
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
        source_path: "/srv/webalive/templates/blank.alive.best",
      },
    })
    runStrictDeploymentMock.mockResolvedValue({
      domain: "example.com",
      port: 3700,
      serviceName: "site@example-com.service",
    })
    validateSSLCertificateMock.mockResolvedValue({ success: true })
  })

  it("uses the strict deployment pipeline for authenticated users", async () => {
    const response = await POST(
      createRequest({
        domain: "Example.com",
        orgId: "org-1",
        templateId: "tmpl_blank",
      }),
    )

    expect(response.status).toBe(200)
    expect(runStrictDeploymentMock).toHaveBeenCalledOnce()
    expect(runStrictDeploymentMock.mock.calls[0][0]).toMatchObject({
      domain: "example.com",
      email: "owner@example.com",
      orgId: "org-1",
      templatePath: "/srv/webalive/templates/blank.alive.best",
    })

    const payload = (await response.json()) as { ok: boolean; domain: string }
    expect(payload.ok).toBe(true)
    expect(payload.domain).toBe("example.com")
  })

  it("returns 401 when authentication is missing", async () => {
    const { AuthenticationError } = await import("@/features/auth/lib/auth")
    requireSessionUserMock.mockRejectedValueOnce(new AuthenticationError())

    const response = await POST(
      createRequest({
        domain: "example.com",
        orgId: "org-1",
      }),
    )

    expect(response.status).toBe(401)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe(ErrorCodes.UNAUTHORIZED)
    expect(runStrictDeploymentMock).not.toHaveBeenCalled()
  })

  it("returns 403 when site quota is exceeded", async () => {
    getUserQuotaMock.mockResolvedValueOnce({
      canCreateSite: false,
      maxSites: 3,
      currentSites: 3,
    })

    const response = await POST(
      createRequest({
        domain: "example.com",
        orgId: "org-1",
        templateId: "tmpl_blank",
      }),
    )

    expect(response.status).toBe(403)
    expect(runStrictDeploymentMock).not.toHaveBeenCalled()
  })
})
