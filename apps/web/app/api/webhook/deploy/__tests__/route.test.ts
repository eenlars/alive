import fs from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

const { GET } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")

function makeUser(isSuperadmin: boolean) {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "User",
    canSelectAnyModel: false,
    isAdmin: isSuperadmin,
    isSuperadmin,
    enabledModels: [],
  }
}

describe("GET /api/webhook/deploy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 401 for unauthenticated users", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toBe("NO_SESSION")
  })

  it("returns 403 for non-superadmin users", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser(false))

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toBe("FORBIDDEN")
  })

  it("returns deployment status for superadmins", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser(true))
    vi.spyOn(fs, "readdirSync").mockReturnValue([
      "deploy-2026-02-21T18-00-00-000Z.log",
      "random.txt",
      "deploy-2026-02-21T19-00-00-000Z.log",
    ] as never)

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.recentDeployments).toEqual([
      "deploy-2026-02-21T19-00-00-000Z.log",
      "deploy-2026-02-21T18-00-00-000Z.log",
    ])
  })
})
