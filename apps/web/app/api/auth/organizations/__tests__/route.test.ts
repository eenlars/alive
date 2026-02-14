import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server-rls", () => ({
  createRLSIamClient: vi.fn(),
  createRLSAppClient: vi.fn(),
}))

const { GET } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { createRLSIamClient, createRLSAppClient } = await import("@/lib/supabase/server-rls")

const MOCK_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost/api/auth/organizations", {
    method: "GET",
    headers: { origin: "http://localhost", host: "localhost" },
  })
}

describe("GET /api/auth/organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when user is unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it("returns empty organizations when user has no memberships", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    vi.mocked(createRLSIamClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    } as never)

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.organizations).toEqual([])
  })

  it("skips memberships with invalid roles and returns empty when all invalid", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    // Memberships have only invalid roles
    vi.mocked(createRLSIamClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              { org_id: "org-1", role: "viewer" },
              { org_id: "org-2", role: "superadmin" },
            ],
            error: null,
          }),
        })),
      })),
    } as never)

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.organizations).toEqual([])
    // Should NOT call orgs or domains since orgIds is empty
    expect(createRLSAppClient).not.toHaveBeenCalled()
  })

  it("returns valid organizations and skips invalid roles", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    // Memberships: one valid, one invalid
    const iamMockFrom = vi.fn((table: string) => {
      if (table === "org_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                { org_id: "org-valid", role: "owner" },
                { org_id: "org-invalid", role: "viewer" },
              ],
              error: null,
            }),
          })),
        }
      }
      // orgs table
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [{ org_id: "org-valid", name: "Valid Org", credits: 100 }],
              error: null,
            }),
          })),
        })),
      }
    })

    vi.mocked(createRLSIamClient).mockResolvedValue({
      from: iamMockFrom,
    } as never)

    // Domains
    vi.mocked(createRLSAppClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: [{ org_id: "org-valid" }, { org_id: "org-valid" }],
            error: null,
          }),
        })),
      })),
    } as never)

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.organizations).toHaveLength(1)
    expect(data.organizations[0]).toEqual({
      org_id: "org-valid",
      name: "Valid Org",
      credits: 100,
      workspace_count: 2,
      role: "owner",
    })
    expect(data.current_user_id).toBe("user-1")
  })
})
