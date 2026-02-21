import * as Sentry from "@sentry/nextjs"
import { SUPERADMIN } from "@webalive/shared"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SessionUser } from "@/features/auth/lib/auth"

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

const mockUser: SessionUser = {
  id: "u1",
  email: "user@example.com",
  name: "User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

let membershipsData: Array<{ org_id: string }> | null = []
let domainsData: Array<{ domain_id: string; hostname: string; org_id: string | null }> | null = []
let aliveDomainData: { domain_id: string; hostname: string; org_id: string | null } | null = null
let aliveDomainError: { message: string } | null = null

const mockCreateServiceAppClient = vi.fn(() => ({
  from: (table: string) => {
    if (table !== "domains") throw new Error(`Unexpected service table: ${table}`)
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: aliveDomainData, error: aliveDomainError }),
        }),
      }),
    }
  },
}))

vi.mock("@/lib/error-codes", () => ({
  ErrorCodes: {
    ORG_ACCESS_DENIED: "ORG_ACCESS_DENIED",
    INTERNAL_ERROR: "INTERNAL_ERROR",
    SITE_NOT_FOUND: "SITE_NOT_FOUND",
  },
}))

vi.mock("@/features/auth/lib/protectedRoute", () => ({
  protectedRoute: (handler: (ctx: { user: SessionUser; req: NextRequest; requestId: string }) => Promise<Response>) => {
    return (req: NextRequest) => handler({ user: mockUser, req, requestId: "req-sites-test" })
  },
}))

vi.mock("@/lib/api/server", () => ({
  alrighty: vi.fn((_route: string, payload: Record<string, unknown>) => {
    return new Response(JSON.stringify({ ok: true, ...payload }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }),
}))

vi.mock("@/lib/api/responses", () => ({
  structuredErrorResponse: vi.fn((code: string, opts?: { status?: number; details?: Record<string, unknown> }) => {
    return new Response(JSON.stringify({ ok: false, error: code, details: opts?.details }), {
      status: opts?.status ?? 500,
      headers: { "Content-Type": "application/json" },
    })
  }),
}))

vi.mock("@/lib/supabase/server-rls", () => ({
  createRLSIamClient: vi.fn(() =>
    Promise.resolve({
      from: (table: string) => {
        if (table !== "org_memberships") throw new Error(`Unexpected iam table: ${table}`)
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: membershipsData, error: null }),
          }),
        }
      },
    }),
  ),
  createRLSAppClient: vi.fn(() =>
    Promise.resolve({
      from: (table: string) => {
        if (table !== "domains") throw new Error(`Unexpected app table: ${table}`)
        return {
          select: () => ({
            in: () => ({
              order: () => Promise.resolve({ data: domainsData, error: null }),
            }),
          }),
        }
      },
    }),
  ),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceAppClient: mockCreateServiceAppClient,
}))

const { GET } = await import("../route")

function request(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" })
}

describe("GET /api/sites", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.id = "u1"
    mockUser.email = "user@example.com"
    mockUser.name = "User"
    mockUser.canSelectAnyModel = false
    mockUser.isAdmin = false
    mockUser.isSuperadmin = false
    mockUser.enabledModels = []

    membershipsData = [{ org_id: "org-1" }]
    domainsData = [{ domain_id: "d1", hostname: "site-1.com", org_id: "org-1" }]
    aliveDomainData = { domain_id: "alive-id", hostname: SUPERADMIN.WORKSPACE_NAME, org_id: "org-alive" }
    aliveDomainError = null
  })

  it("returns empty sites when user has no org memberships", async () => {
    membershipsData = null

    const res = await GET(request("http://localhost/api/sites"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.sites).toEqual([])
  })

  it("returns user org sites for regular users", async () => {
    const res = await GET(request("http://localhost/api/sites"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.sites).toEqual([{ id: "d1", hostname: "site-1.com", org_id: "org-1" }])
    expect(mockCreateServiceAppClient).not.toHaveBeenCalled()
  })

  it("includes alive workspace for superadmin when missing", async () => {
    mockUser.isSuperadmin = true

    const res = await GET(request("http://localhost/api/sites"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.sites[0]).toEqual({ id: "alive-id", hostname: SUPERADMIN.WORKSPACE_NAME, org_id: "org-alive" })
    expect(data.sites[1]).toEqual({ id: "d1", hostname: "site-1.com", org_id: "org-1" })
  })

  it("does not include alive workspace when org filter is set to a different org", async () => {
    mockUser.isSuperadmin = true
    membershipsData = [{ org_id: "org-1" }]

    const res = await GET(request("http://localhost/api/sites?org_id=org-1"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.sites).toEqual([{ id: "d1", hostname: "site-1.com", org_id: "org-1" }])
  })

  it("does not duplicate alive workspace if already in site list", async () => {
    mockUser.isSuperadmin = true
    domainsData = [
      { domain_id: "alive-id", hostname: SUPERADMIN.WORKSPACE_NAME, org_id: "org-alive" },
      { domain_id: "d1", hostname: "site-1.com", org_id: "org-1" },
    ]

    const res = await GET(request("http://localhost/api/sites"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.sites).toEqual([
      { id: "alive-id", hostname: SUPERADMIN.WORKSPACE_NAME, org_id: "org-alive" },
      { id: "d1", hostname: "site-1.com", org_id: "org-1" },
    ])
    expect(mockCreateServiceAppClient).not.toHaveBeenCalled()
  })

  it("returns 500 and reports to Sentry when alive domain DB query fails for superadmin", async () => {
    mockUser.isSuperadmin = true
    aliveDomainError = { message: "connection refused" }

    const res = await GET(request("http://localhost/api/sites"))

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("INTERNAL_ERROR")
    expect(Sentry.captureException).toHaveBeenCalledWith(aliveDomainError)
  })

  it("returns 500 and reports to Sentry when alive domain row is missing from database", async () => {
    mockUser.isSuperadmin = true
    aliveDomainData = null

    const res = await GET(request("http://localhost/api/sites"))

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("SITE_NOT_FOUND")
    expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining("not found in database"), "error")
  })

  it("returns 500 and reports to Sentry when alive domain has no org_id", async () => {
    mockUser.isSuperadmin = true
    aliveDomainData = { domain_id: "alive-id", hostname: SUPERADMIN.WORKSPACE_NAME, org_id: null }

    const res = await GET(request("http://localhost/api/sites"))

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("INTERNAL_ERROR")
    expect(Sentry.captureMessage).toHaveBeenCalledWith("Alive domain has no org_id configured", "error")
  })
})
