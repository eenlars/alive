import { beforeEach, describe, expect, it, vi } from "vitest"
import { runWithRequestContext } from "../../../../tests/setup"
import { COOKIE_NAMES } from "@/lib/auth/cookies"

vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(),
}))

vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

import { createSessionToken, SESSION_SCOPES } from "../jwt"
import { type SessionUser, verifyWorkspaceAccess } from "../auth"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

function createUser(id: string): SessionUser {
  return {
    id,
    email: `${id}@example.com`,
    name: "Test User",
    canSelectAnyModel: false,
    isAdmin: false,
    isSuperadmin: false,
    enabledModels: [],
  }
}

function mockWorkspaceOrgId(orgId: string | null) {
  vi.mocked(createAppClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: orgId ? { org_id: orgId } : null }),
        }),
      }),
    }),
  } as never)
}

function mockMemberships(memberships: Array<{ org_id: string; role: "owner" | "admin" | "member" }>) {
  vi.mocked(createIamClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: memberships }),
      }),
    }),
  } as never)
}

async function withSessionToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
  const request = new Request("http://localhost", {
    headers: {
      cookie: `${COOKIE_NAMES.SESSION}=${token}`,
    },
  })
  return runWithRequestContext(request, fn)
}

describe("Auth Scopes and Cached Org Authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("verifyWorkspaceAccess denies when workspace:access scope is missing", async () => {
    const user = createUser("user-scope-missing")
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      scopes: [SESSION_SCOPES.ORG_READ],
      orgIds: ["org-scope-missing"],
      orgRoles: { "org-scope-missing": "owner" },
    })

    const result = await withSessionToken(token, async () =>
      verifyWorkspaceAccess(user, { workspace: "scope-missing.example.com" }, "[test-scope-missing]"),
    )

    expect(result).toBeNull()
    expect(createAppClient).not.toHaveBeenCalled()
    expect(createIamClient).not.toHaveBeenCalled()
  })

  it("verifyWorkspaceAccess denies when workspace org is not in user memberships", async () => {
    const user = createUser("user-org-mismatch")
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      scopes: [SESSION_SCOPES.WORKSPACE_ACCESS],
      orgIds: ["org-a"],
      orgRoles: { "org-a": "owner" },
    })

    mockWorkspaceOrgId("org-b")
    mockMemberships([{ org_id: "org-a", role: "owner" }])

    const result = await withSessionToken(token, async () =>
      verifyWorkspaceAccess(user, { workspace: "org-mismatch.example.com" }, "[test-org-mismatch]"),
    )

    expect(result).toBeNull()
  })

  it("verifyWorkspaceAccess allows valid access and reuses 5-minute caches", async () => {
    const user = createUser("user-cache-hit")
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      scopes: [SESSION_SCOPES.WORKSPACE_ACCESS],
      orgIds: ["org-cache-hit"],
      orgRoles: { "org-cache-hit": "owner" },
    })

    mockWorkspaceOrgId("org-cache-hit")
    mockMemberships([{ org_id: "org-cache-hit", role: "owner" }])

    const first = await withSessionToken(token, async () =>
      verifyWorkspaceAccess(user, { workspace: "cache-hit.example.com" }, "[test-cache-first]"),
    )

    const second = await withSessionToken(token, async () =>
      verifyWorkspaceAccess(user, { workspace: "cache-hit.example.com" }, "[test-cache-second]"),
    )

    expect(first).toBe("cache-hit.example.com")
    expect(second).toBe("cache-hit.example.com")
    expect(createAppClient).toHaveBeenCalledTimes(1)
    expect(createIamClient).toHaveBeenCalledTimes(1)
  })
})
