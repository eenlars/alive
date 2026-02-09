/**
 * Tests for POST /api/deploy-subdomain
 *
 * Critical test: Caddy routing must be configured AFTER the domain is
 * written to Supabase. If configureCaddy runs before registerDomain,
 * the routing generator won't include the new domain and the site will
 * be unreachable (routed to preview-proxy wildcard instead).
 */

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Track call order across mocked functions
const callOrder: string[] = []

// --- Mocks ---

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(() => ({
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
  })),
}))

vi.mock("@/features/auth/lib/jwt", () => ({
  createSessionToken: vi.fn(() => "mock-token"),
  verifySessionToken: vi.fn(() => ({
    workspaces: ["existing.alive.best"],
  })),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: "mock-session-cookie" })),
  })),
}))

vi.mock("@/lib/api/server", () => ({
  handleBody: vi.fn(() => ({
    slug: "testsite",
    siteIdeas: "A test site",
    templateId: "blank",
    orgId: "org-1",
    email: "test@example.com",
    password: undefined,
  })),
  isHandleBodyError: vi.fn(() => false),
  alrighty: vi.fn((_endpoint: string, payload: Record<string, unknown>) => {
    // Return a NextResponse-like object with cookies.set
    const headers = new Headers({ "content-type": "application/json" })
    const response = new Response(JSON.stringify(payload), { status: 200, headers })
    ;(response as Response & { cookies: { set: typeof vi.fn } }).cookies = { set: vi.fn() }
    return response
  }),
}))

vi.mock("@/lib/config", () => ({
  buildSubdomain: vi.fn((slug: string) => `${slug}.alive.best`),
}))

vi.mock("@/lib/deployment/org-resolver", () => ({
  validateUserOrgAccess: vi.fn(() => true),
}))

vi.mock("@/lib/deployment/user-quotas", () => ({
  getUserQuota: vi.fn(() => ({ canCreateSite: true, maxSites: 10, currentSites: 1 })),
  getUserQuotaByEmail: vi.fn(() => null),
}))

vi.mock("@/lib/deployment/template-validation", () => ({
  validateTemplateFromDb: vi.fn(() => ({
    valid: true,
    template: { template_id: "blank", source_path: "/srv/webalive/sites/blank.alive.best" },
  })),
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

vi.mock("@/types/guards/api", () => ({
  loadDomainPasswords: vi.fn(() => ({
    "testsite.alive.best": { port: 3700 },
  })),
}))

// The critical mocks: deploySite, registerDomain, configureCaddy — track ordering
vi.mock("@/lib/deployment/deploy-site", () => ({
  deploySite: vi.fn(async () => {
    callOrder.push("deploySite")
    return { port: 3700, domain: "testsite.alive.best", serviceName: "site@testsite-alive-best.service" }
  }),
}))

vi.mock("@/lib/deployment/domain-registry", () => ({
  registerDomain: vi.fn(async () => {
    callOrder.push("registerDomain")
  }),
  DomainRegistrationError: class DomainRegistrationError extends Error {
    errorCode: string
    details: Record<string, unknown>
    constructor(message: string, errorCode: string, details: Record<string, unknown>) {
      super(message)
      this.errorCode = errorCode
      this.details = details
    }
  },
}))

vi.mock("@webalive/site-controller", () => ({
  configureCaddy: vi.fn(async () => {
    callOrder.push("configureCaddy")
  }),
}))

vi.mock("@/lib/api/responses", () => ({
  structuredErrorResponse: vi.fn(
    (code: string, opts: { status: number; details?: Record<string, unknown> }) =>
      new Response(JSON.stringify({ ok: false, error: code, ...opts.details }), { status: opts.status }),
  ),
}))

vi.mock("@/lib/error-codes", () => ({
  ErrorCodes: {
    UNAUTHORIZED: "UNAUTHORIZED",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    SLUG_TAKEN: "SLUG_TAKEN",
    SITE_LIMIT_EXCEEDED: "SITE_LIMIT_EXCEEDED",
    INVALID_TEMPLATE: "INVALID_TEMPLATE",
    TEMPLATE_NOT_FOUND: "TEMPLATE_NOT_FOUND",
    DEPLOYMENT_FAILED: "DEPLOYMENT_FAILED",
    ORG_ACCESS_DENIED: "ORG_ACCESS_DENIED",
  },
}))

vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
  }
})

// Import after all mocks
const { POST } = await import("../route")

function createMockRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/deploy-subdomain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/deploy-subdomain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callOrder.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls configureCaddy AFTER registerDomain (not during deploySite)", async () => {
    const request = createMockRequest({
      slug: "testsite",
      siteIdeas: "Test",
      templateId: "blank",
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    // The critical assertion: configureCaddy must come AFTER registerDomain
    // If this order is wrong, the routing generator won't include the new domain
    // and the site will be unreachable (goes to preview-proxy wildcard → "Invalid preview host")
    expect(callOrder).toEqual(["deploySite", "registerDomain", "configureCaddy"])
  })

  it("configureCaddy receives the correct domain and port", async () => {
    const { configureCaddy } = await import("@webalive/site-controller")

    const request = createMockRequest({
      slug: "testsite",
      siteIdeas: "Test",
      templateId: "blank",
    })

    await POST(request)

    expect(configureCaddy).toHaveBeenCalledOnce()
    expect(vi.mocked(configureCaddy).mock.calls[0][0]).toMatchObject({
      domain: "testsite.alive.best",
      port: 3700,
    })
  })
})
