import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

const { DELETE } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { createIamClient } = await import("@/lib/supabase/iam")

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

function mockIamClient(options: {
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
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
      canSelectAnyModel: false,
      isAdmin: false,
      isSuperadmin: false,
      enabledModels: [],
    })

    mockIamClient({
      currentMembership: { role: "viewer" },
      targetMembership: { role: "member" },
    })

    const res = await DELETE(makeDeleteRequest("org-1", "target-1"))
    expect(res.status).toBe(403)
  })

  it("returns 403 when admin tries to remove owner", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      canSelectAnyModel: false,
      isAdmin: false,
      isSuperadmin: false,
      enabledModels: [],
    })

    mockIamClient({
      currentMembership: { role: "admin" },
      targetMembership: { role: "owner" },
    })

    const res = await DELETE(makeDeleteRequest("org-1", "owner-1"))
    expect(res.status).toBe(403)
  })

  it("returns 200 when owner removes member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      name: "Owner",
      canSelectAnyModel: false,
      isAdmin: false,
      isSuperadmin: false,
      enabledModels: [],
    })

    mockIamClient({
      currentMembership: { role: "owner" },
      targetMembership: { role: "member" },
    })

    const res = await DELETE(makeDeleteRequest("org-1", "member-1"))
    expect(res.status).toBe(200)
  })

  it("returns 403 when owner tries to remove self and no other owner exists", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      name: "Owner",
      canSelectAnyModel: false,
      isAdmin: false,
      isSuperadmin: false,
      enabledModels: [],
    })

    mockIamClient({
      currentMembership: { role: "owner" },
      targetMembership: { role: "owner" },
      otherOwners: [],
    })

    const res = await DELETE(makeDeleteRequest("org-1", "owner-1"))
    expect(res.status).toBe(403)
  })

  it("returns 200 when owner self-leaves with another owner present", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      name: "Owner",
      canSelectAnyModel: false,
      isAdmin: false,
      isSuperadmin: false,
      enabledModels: [],
    })

    mockIamClient({
      currentMembership: { role: "owner" },
      targetMembership: { role: "owner" },
      otherOwners: [{ user_id: "owner-2" }],
    })

    const res = await DELETE(makeDeleteRequest("org-1", "owner-1"))
    expect(res.status).toBe(200)
  })
})
