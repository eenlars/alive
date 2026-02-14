import { SUPERADMIN } from "@webalive/shared"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
  hasSessionScope: vi.fn(),
}))

vi.mock("@/lib/api/responses", () => ({
  createCorsErrorResponse: vi.fn((_origin, code, status, fields) => {
    return new Response(JSON.stringify({ ok: false, error: code, ...fields }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }),
  createCorsSuccessResponse: vi.fn((_origin, data) => {
    return new Response(JSON.stringify({ ok: true, ...data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }),
}))

vi.mock("@/lib/cors-utils", () => ({
  addCorsHeaders: vi.fn(),
}))

vi.mock("@/lib/domains", () => ({
  filterLocalDomains: vi.fn((hostnames: string[]) => hostnames),
}))

const mockIamFrom = vi.fn()
const mockAppFrom = vi.fn()

vi.mock("@/lib/supabase/server-rls", () => ({
  createRLSIamClient: vi.fn(() =>
    Promise.resolve({
      from: mockIamFrom,
    }),
  ),
  createRLSAppClient: vi.fn(() =>
    Promise.resolve({
      from: mockAppFrom,
    }),
  ),
}))

vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(() => ({
    from: mockAppFrom,
  })),
}))

const { GET } = await import("../route")
const { getSessionUser, hasSessionScope } = await import("@/features/auth/lib/auth")

const REGULAR_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

function createMockRequest(orgId?: string): NextRequest {
  const url = orgId ? `http://localhost/api/auth/workspaces?org_id=${orgId}` : "http://localhost/api/auth/workspaces"
  return new NextRequest(url, {
    method: "GET",
    headers: { origin: "http://localhost:3000" },
  })
}

function mockMemberships(memberships: { org_id: string }[] | null) {
  mockIamFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: memberships, error: null }),
    }),
  })
}

function mockDomains(domains: { hostname: string; is_test_env?: boolean }[] | null) {
  const selectResult = {
    in: vi.fn().mockResolvedValue({ data: domains, error: null }),
    // biome-ignore lint/suspicious/noThenProperty: Mocking Supabase thenable query builder
    then: (resolve: (value: { data: typeof domains; error: null }) => void) => resolve({ data: domains, error: null }),
  }
  mockAppFrom.mockReturnValue({
    select: vi.fn().mockReturnValue(selectResult),
  })
}

describe("GET /api/auth/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSessionUser).mockResolvedValue(REGULAR_USER)
    vi.mocked(hasSessionScope).mockResolvedValue(true)
  })

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe("UNAUTHORIZED")
  })

  it("returns 403 when workspace:list scope is missing", async () => {
    vi.mocked(hasSessionScope).mockResolvedValue(false)

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe("ORG_ACCESS_DENIED")
  })

  it("returns workspaces for authenticated org memberships", async () => {
    mockMemberships([{ org_id: "org-1" }])
    mockDomains([
      { hostname: "site-1.com", is_test_env: false },
      { hostname: "site-2.com", is_test_env: false },
    ])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.workspaces).toEqual(["site-1.com", "site-2.com"])
  })

  it("filters superadmin workspace for non-superadmins", async () => {
    mockMemberships([{ org_id: "org-1" }])
    mockDomains([
      { hostname: "site-1.com", is_test_env: false },
      { hostname: SUPERADMIN.WORKSPACE_NAME, is_test_env: false },
    ])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.workspaces).toEqual(["site-1.com"])
  })

  it("returns 403 when org filter is outside user memberships", async () => {
    mockMemberships([{ org_id: "org-1" }])

    const response = await GET(createMockRequest("org-2"))
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe("ORG_ACCESS_DENIED")
  })
})
