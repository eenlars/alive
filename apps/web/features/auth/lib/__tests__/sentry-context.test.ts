import * as Sentry from "@sentry/nextjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { runWithRequestContext } from "../../../../tests/setup"

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  captureException: vi.fn(),
  getCurrentScope: vi.fn(() => ({
    setTag: vi.fn(),
  })),
}))

vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    }),
  ),
}))

import { getSessionUser } from "../auth"
import { createSessionToken, SESSION_SCOPES } from "../jwt"

async function withCookie<T>(token: string, fn: () => Promise<T>): Promise<T> {
  const request = new Request("http://localhost", {
    headers: { cookie: `${COOKIE_NAMES.SESSION}=${token}` },
  })
  return runWithRequestContext(request, fn)
}

async function withNoCookie<T>(fn: () => Promise<T>): Promise<T> {
  const request = new Request("http://localhost")
  return runWithRequestContext(request, fn)
}

describe("Sentry user context in getSessionUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sets Sentry user with id and email on successful auth", async () => {
    const token = await createSessionToken({
      userId: "user-123",
      email: "alice@example.com",
      name: "Alice",
      scopes: [SESSION_SCOPES.WORKSPACE_ACCESS],
      orgIds: [],
      orgRoles: {},
    })

    const user = await withCookie(token, () => getSessionUser())

    expect(user).not.toBeNull()
    expect(Sentry.setUser).toHaveBeenCalledWith({
      id: "user-123",
      email: "alice@example.com",
    })
  })

  it("clears Sentry user when no session cookie", async () => {
    const user = await withNoCookie(() => getSessionUser())

    expect(user).toBeNull()
    expect(Sentry.setUser).toHaveBeenCalledWith(null)
  })

  it("clears Sentry user when JWT is invalid", async () => {
    const user = await withCookie("invalid-jwt-token", () => getSessionUser())

    expect(user).toBeNull()
    expect(Sentry.setUser).toHaveBeenCalledWith(null)
  })

  it("never includes name in Sentry user (PII minimization)", async () => {
    const token = await createSessionToken({
      userId: "user-456",
      email: "bob@example.com",
      name: "Bob Smith",
      scopes: [SESSION_SCOPES.WORKSPACE_ACCESS],
      orgIds: [],
      orgRoles: {},
    })

    await withCookie(token, () => getSessionUser())

    const setUserArg = vi.mocked(Sentry.setUser).mock.calls[0][0]
    expect(setUserArg).not.toHaveProperty("name")
  })
})
