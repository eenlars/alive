import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

const { GET, POST, DELETE, OPTIONS } = await import("../route")
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

function makeGetRequest(orgId?: string): NextRequest {
  const url = orgId ? `http://localhost/api/auth/org-members?orgId=${orgId}` : "http://localhost/api/auth/org-members"
  return new NextRequest(url, {
    method: "GET",
    headers: { origin: "http://localhost" },
  })
}

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth/org-members", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  })
}

function makeDeleteRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth/org-members", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
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

  it("returns 400 when orgId query param is missing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(400)
  })

  it("returns 403 when user is not a member of the org", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

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

  it("returns 200 with members sorted by email when user is a member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    let fromCallCount = 0
    const mockFrom = vi.fn(() => {
      fromCallCount++
      if (fromCallCount === 1) {
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
    expect(data.ok).toBe(true)
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

  it("returns 500 when database query fails", async () => {
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
              data: null,
              error: { message: "DB connection failed" },
            }),
          })),
        })),
      }
    })

    vi.mocked(createIamClient).mockResolvedValue({ from: mockFrom } as never)

    const res = await GET(makeGetRequest("org-1"))
    expect(res.status).toBe(500)
  })

  it("handles empty members list gracefully", async () => {
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
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      }
    })

    vi.mocked(createIamClient).mockResolvedValue({ from: mockFrom } as never)

    const res = await GET(makeGetRequest("org-1"))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.members).toEqual([])
  })

  it("returns member with display_name=null when not set", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    let fromCallCount = 0
    const mockFrom = vi.fn(() => {
      fromCallCount++
      if (fromCallCount === 1) {
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
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [{ user_id: "u1", role: "member", users: { email: "user@test.com", display_name: null } }],
              error: null,
            }),
          })),
        })),
      }
    })

    vi.mocked(createIamClient).mockResolvedValue({ from: mockFrom } as never)

    const res = await GET(makeGetRequest("org-1"))
    const data = await res.json()
    expect(data.members[0].display_name).toBeNull()
  })
})

// ============================================================================
// POST /api/auth/org-members (Add member)
// ============================================================================

function mockIamClientForPost(options: {
  callerRole?: string | null
  targetUser?: { user_id: string; email: string; display_name: string | null } | null
  existingMembership?: { user_id: string } | null
  insertError?: { code?: string; message: string } | null
}) {
  const fromCalls: string[] = []

  const mockFrom = vi.fn((table: string) => {
    fromCalls.push(table)
    const callIndex = fromCalls.length

    if (table === "org_memberships" && callIndex === 1) {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: options.callerRole ? { role: options.callerRole } : null,
                error: options.callerRole ? null : { code: "PGRST116" },
              }),
            })),
          })),
        })),
      }
    }

    if (table === "users") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: options.targetUser ?? null,
              error: options.targetUser ? null : { code: "PGRST116" },
            }),
          })),
        })),
      }
    }

    if (table === "org_memberships" && callIndex === 3) {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: options.existingMembership ?? null,
                error: options.existingMembership ? null : { code: "PGRST116" },
              }),
            })),
          })),
        })),
      }
    }

    if (table === "org_memberships" && callIndex === 4) {
      return {
        insert: vi.fn().mockResolvedValue({
          error: options.insertError ?? null,
        }),
      }
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    }
  })

  vi.mocked(createIamClient).mockResolvedValue({ from: mockFrom } as never)
}

describe("POST /api/auth/org-members", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Authentication ---

  it("returns 401 when user is unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com" }))
    expect(res.status).toBe(401)
  })

  // --- Input validation (handleBody + Zod schema) ---

  it("returns 400 when orgId is missing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await POST(makePostRequest({ email: "new@test.com" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when orgId is empty string", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await POST(makePostRequest({ orgId: "", email: "new@test.com" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when email is missing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await POST(makePostRequest({ orgId: "org-1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when email is invalid format", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await POST(makePostRequest({ orgId: "org-1", email: "not-an-email" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid role value (owner)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com", role: "owner" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid role value (superadmin)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com", role: "superadmin" }))
    expect(res.status).toBe(400)
  })

  // --- Authorization ---

  it("returns 403 when caller is not in the org", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForPost({
      callerRole: null,
    })

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com" }))
    expect(res.status).toBe(403)
  })

  it("returns 403 when caller is a member (not admin/owner)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForPost({
      callerRole: "member",
    })

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com" }))
    expect(res.status).toBe(403)
  })

  // --- Target user lookup ---

  it("returns 404 when target email is not found in system", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForPost({
      callerRole: "admin",
      targetUser: null,
    })

    const res = await POST(makePostRequest({ orgId: "org-1", email: "nonexistent@test.com" }))
    expect(res.status).toBe(404)

    const data = await res.json()
    expect(data.error).toBe("USER_NOT_FOUND")
  })

  // --- Duplicate membership ---

  it("returns 409 when user is already a member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForPost({
      callerRole: "owner",
      targetUser: { user_id: "target-1", email: "existing@test.com", display_name: "Existing" },
      existingMembership: { user_id: "target-1" },
    })

    const res = await POST(makePostRequest({ orgId: "org-1", email: "existing@test.com" }))
    expect(res.status).toBe(409)

    const data = await res.json()
    expect(data.error).toBe("MEMBER_ALREADY_EXISTS")
  })

  // --- DB insert failure ---

  it("returns 409 on concurrent invite race (PostgreSQL 23505)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForPost({
      callerRole: "admin",
      targetUser: { user_id: "target-1", email: "new@test.com", display_name: "New" },
      existingMembership: null,
      insertError: { code: "23505", message: "unique_violation" },
    })

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com" }))
    expect(res.status).toBe(409)

    const data = await res.json()
    expect(data.error).toBe("MEMBER_ALREADY_EXISTS")
  })

  it("returns 500 when database insert fails (non-constraint error)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForPost({
      callerRole: "admin",
      targetUser: { user_id: "target-1", email: "new@test.com", display_name: "New" },
      existingMembership: null,
      insertError: { message: "connection lost" },
    })

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com" }))
    expect(res.status).toBe(500)
  })

  // --- Happy paths ---

  it("returns 200 when admin adds a member (default role)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForPost({
      callerRole: "admin",
      targetUser: { user_id: "target-1", email: "new@test.com", display_name: "New User" },
      existingMembership: null,
      insertError: null,
    })

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com" }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.member).toEqual({
      user_id: "target-1",
      email: "new@test.com",
      display_name: "New User",
      role: "member",
    })
  })

  it("returns 200 when owner adds a member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForPost({
      callerRole: "owner",
      targetUser: { user_id: "target-1", email: "new@test.com", display_name: null },
      existingMembership: null,
      insertError: null,
    })

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com" }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.member.display_name).toBeNull()
  })

  it("allows explicit admin role assignment", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForPost({
      callerRole: "owner",
      targetUser: { user_id: "target-1", email: "new@test.com", display_name: "Admin User" },
      existingMembership: null,
      insertError: null,
    })

    const res = await POST(makePostRequest({ orgId: "org-1", email: "new@test.com", role: "admin" }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.member.role).toBe("admin")
  })

  it("normalizes email (trims whitespace and lowercases)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    // Track the email value passed to the users table .eq("email", ...) call
    let emailUsedInLookup: string | undefined
    const fromCalls: string[] = []

    const mockFrom = vi.fn((table: string) => {
      fromCalls.push(table)
      const callIndex = fromCalls.length

      if (table === "org_memberships" && callIndex === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
              })),
            })),
          })),
        }
      }

      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, val: string) => {
              emailUsedInLookup = val
              return {
                single: vi.fn().mockResolvedValue({
                  data: { user_id: "target-1", email: "new@test.com", display_name: "New User" },
                  error: null,
                }),
              }
            }),
          })),
        }
      }

      if (table === "org_memberships" && callIndex === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
              })),
            })),
          })),
        }
      }

      if (table === "org_memberships" && callIndex === 4) {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
        })),
      }
    })

    vi.mocked(createIamClient).mockResolvedValue({ from: mockFrom } as never)

    // Email with leading/trailing spaces and mixed case
    const res = await POST(makePostRequest({ orgId: "org-1", email: "  New@Test.com  " }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.member.email).toBe("new@test.com")

    // Verify the DB lookup used the normalized email, not the raw input
    expect(emailUsedInLookup).toBe("new@test.com")
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

  // --- Authentication ---

  it("returns 401 when user is unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "target-1" }))
    expect(res.status).toBe(401)
  })

  // --- Input validation (handleBody + Zod schema) ---

  it("returns 400 when orgId is missing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await DELETE(makeDeleteRequest({ targetUserId: "target-1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when targetUserId is missing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when orgId is empty string", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await DELETE(makeDeleteRequest({ orgId: "", targetUserId: "target-1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when targetUserId is empty string", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "" }))
    expect(res.status).toBe(400)
  })

  // --- Authorization ---

  it("returns 403 when caller is not in the org", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForDelete({
      currentMembership: null,
      targetMembership: { role: "member" },
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "target-1" }))
    expect(res.status).toBe(403)
  })

  it("returns 403 for unsupported role values", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForDelete({
      currentMembership: { role: "viewer" },
      targetMembership: { role: "member" },
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "target-1" }))
    expect(res.status).toBe(403)
  })

  it("returns 403 when member tries to remove another member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForDelete({
      currentMembership: { role: "member" },
      targetMembership: { role: "member" },
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "other-member" }))
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

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "owner-1" }))
    expect(res.status).toBe(403)
  })

  it("returns 403 when admin tries to remove another admin", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "admin-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "admin" },
      targetMembership: { role: "admin" },
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "admin-2" }))
    expect(res.status).toBe(403)
  })

  // --- Target user not found ---

  it("returns 404 when target user is not in the org", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "owner-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "owner" },
      targetMembership: null,
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "nonexistent-user" }))
    expect(res.status).toBe(404)
  })

  // --- Owner self-leave ---

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

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "owner-1" }))
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

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "owner-1" }))
    expect(res.status).toBe(200)
  })

  // --- Happy paths ---

  it("returns 200 when owner removes a member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "owner-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "owner" },
      targetMembership: { role: "member" },
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "member-1" }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.message).toBe("Member removed successfully")
  })

  it("returns 200 when owner removes an admin", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "owner-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "owner" },
      targetMembership: { role: "admin" },
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "admin-1" }))
    expect(res.status).toBe(200)
  })

  it("returns 200 when admin removes a member", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "admin-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "admin" },
      targetMembership: { role: "member" },
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "member-1" }))
    expect(res.status).toBe(200)
  })

  it("returns 200 when member self-leaves", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    mockIamClientForDelete({
      currentMembership: { role: "member" },
      targetMembership: { role: "member" },
    })

    // Self-leave: targetUserId matches the user's id
    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: MOCK_USER.id }))
    expect(res.status).toBe(200)
  })

  it("returns 200 when admin self-leaves", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "admin-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "admin" },
      targetMembership: { role: "admin" },
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "admin-1" }))
    expect(res.status).toBe(200)
  })

  // --- DB failures ---

  it("returns 500 when delete query fails", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...MOCK_USER,
      id: "owner-1",
    })

    mockIamClientForDelete({
      currentMembership: { role: "owner" },
      targetMembership: { role: "member" },
      deleteError: { message: "connection lost" },
    })

    const res = await DELETE(makeDeleteRequest({ orgId: "org-1", targetUserId: "member-1" }))
    expect(res.status).toBe(500)
  })
})

// ============================================================================
// OPTIONS /api/auth/org-members
// ============================================================================

describe("OPTIONS /api/auth/org-members", () => {
  it("returns 200 with CORS headers", async () => {
    const req = new NextRequest("http://localhost/api/auth/org-members", {
      method: "OPTIONS",
      headers: { origin: "http://localhost" },
    })

    const res = await OPTIONS(req)
    expect(res.status).toBe(200)
  })
})
