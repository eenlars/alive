import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

const { GET, DELETE } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { createIamClient } = await import("@/lib/supabase/iam")

const MOCK_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

function makeGetRequest(orgId: string): NextRequest {
  return new NextRequest(`http://localhost/api/auth/org-members?orgId=${orgId}`, {
    method: "GET",
    headers: { origin: "http://localhost" },
  })
}

function makeDeleteRequest(orgId: string, targetUserId: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/org-members", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify({ orgId, targetUserId }),
  })
}

// ============================================================================
// GET /api/auth/org-members
// ============================================================================

describe("GET /api/auth/org-members", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when user is unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const res = await GET(makeGetRequest("org-1"))
    expect(res.status).toBe(401)
  })

  it("returns 403 when user is not a member of the org", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    // Caller membership check returns no membership
    const mockFrom = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
          })),
        })),
      })),
    }))

    vi.mocked(createIamClient).mockResolvedValue({ from: mockFrom } as never)

    const res = await GET(makeGetRequest("org-1"))
    expect(res.status).toBe(403)
  })

  it("returns 200 with members when user is a member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    let fromCallCount = 0
    const mockFrom = vi.fn(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        // Caller membership check
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
              })),
            })),
          })),
        }
      }
      // Members query
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [
                { user_id: "u1", role: "owner", users: { email: "b@test.com", display_name: "B" } },
                { user_id: "u2", role: "member", users: { email: "a@test.com", display_name: null } },
              ],
              error: null,
            }),
          })),
        })),
      }
    })

    vi.mocked(createIamClient).mockResolvedValue({ from: mockFrom } as never)

    const res = await GET(makeGetRequest("org-1"))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.members).toHaveLength(2)
    // Sorted by email
    expect(data.members[0].email).toBe("a@test.com")
    expect(data.members[1].email).toBe("b@test.com")
  })

  it("filters out members with invalid roles", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    let fromCallCount = 0
    const mockFrom = vi.fn(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
              })),
            })),
          })),
        }
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [
                { user_id: "u1", role: "owner", users: { email: "owner@test.com", display_name: null } },
                { user_id: "u2", role: "viewer", users: { email: "viewer@test.com", display_name: null } },
                { user_id: "u3", role: "member", users: { email: "member@test.com", display_name: null } },
              ],
              error: null,
            }),
          })),
        })),
      }
    })

    vi.mocked(createIamClient).mockResolvedValue({ from: mockFrom } as never)

    const res = await GET(makeGetRequest("org-1"))
    expect(res.status).toBe(200)

    const data = await res.json()
    // "viewer" should be filtered out
    expect(data.members).toHaveLength(2)
    expect(data.members.map((m: { email: string }) => m.email)).toEqual(["member@test.com", "owner@test.com"])
  })
})

// ============================================================================
// DELETE /api/auth/org-members
// ============================================================================

function mockIamClientForDelete(options: {
  currentMembership?: { role: string } | null
  targetMembership?: { role: string } | null
  otherOwners?: Array<{ user_id: string }>
  deleteError?: { message: string } | null
}) {
  const selectResults = [
    { data: options.currentMembership ?? null, error: null },
    { data: options.targetMembership ?? null, error: null },
    { data: options.otherOwners ?? [], error: null },
  ]

  const mockFrom = vi.fn(() => ({
    select: vi.fn(() => {
      const result = selectResults.shift() ?? { data: null, error: null }
      const chain = {
        eq: vi.fn(() => chain),
        neq: vi.fn(() => Promise.resolve(result)),
        single: vi.fn(() => Promise.resolve(result)),
      }
      return chain
    }),
    delete: vi.fn(() => {
      let eqCount = 0
      const chain = {
        eq: vi.fn(() => {
          eqCount += 1
          if (eqCount < 2) return chain
          return Promise.resolve({ error: options.deleteError ?? null })
        }),
      }
      return chain
    }),
  }))

  vi.mocked(createIamClient).mockResolvedValue({ from: mockFrom } as never)
}

describe("DELETE /api/auth/org-members", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when user is unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const res = await DELETE(makeDeleteRequest("org-1", "target-1"))
    expect(res.status).toBe(401)
  })

  it("returns 403 for unsupported role values", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForDelete({
      currentMembership: { role: "viewer" },
      targetMembership: { role: "member" },
    })

    const res = await DELETE(makeDeleteRequest("org-1", "target-1"))
    expect(res.status).toBe(403)
  })

  it("returns 403 when admin tries to remove owner", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "admin-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "admin" },
      targetMembership: { role: "owner" },
    })

    const res = await DELETE(makeDeleteRequest("org-1", "owner-1"))
    expect(res.status).toBe(403)
  })

  it("returns 200 when owner removes member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "owner-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "owner" },
      targetMembership: { role: "member" },
    })

    const res = await DELETE(makeDeleteRequest("org-1", "member-1"))
    expect(res.status).toBe(200)
  })

  it("returns 403 when owner tries to remove self and no other owner exists", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "owner-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "owner" },
      targetMembership: { role: "owner" },
      otherOwners: [],
    })

    const res = await DELETE(makeDeleteRequest("org-1", "owner-1"))
    expect(res.status).toBe(403)
  })

  it("returns 200 when owner self-leaves with another owner present", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "owner-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "owner" },
      targetMembership: { role: "owner" },
      otherOwners: [{ user_id: "owner-2" }],
    })

    const res = await DELETE(makeDeleteRequest("org-1", "owner-1"))
    expect(res.status).toBe(200)
  })
})
