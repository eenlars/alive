import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/lib/error-logger", () => ({
  errorLogger: {
    capture: vi.fn(),
    query: vi.fn(),
    stats: vi.fn(),
  },
}))

const { POST, GET } = await import("../logs/error/route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { errorLogger } = await import("@/lib/error-logger")

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

describe("POST /api/logs/error", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 when body is not a JSON object", async () => {
    const req = new NextRequest("http://localhost/api/logs/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe("VALIDATION_ERROR")
    expect(data.details.reason).toContain("JSON object")
  })

  it("accepts valid payload and captures the error entry", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser(false))
    vi.mocked(errorLogger.capture).mockReturnValue({
      id: "err-1",
      timestamp: "2026-02-21T00:00:00.000Z",
      category: "oauth",
      source: "frontend",
      message: "OAuth failed",
    })

    const req = new NextRequest("http://localhost/api/logs/error", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "vitest" },
      body: JSON.stringify({
        category: "oauth",
        message: "OAuth failed",
        details: { code: "bad_state" },
        stack: "stack",
        url: "https://terminal.alive.best/oauth/callback",
      }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ ok: true, id: "err-1" })
    expect(errorLogger.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "oauth",
        source: "frontend",
        message: "OAuth failed",
        userId: "user-1",
        userAgent: "vitest",
      }),
    )
  })
})

describe("GET /api/logs/error", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 for non-superadmin users", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser(false))

    const req = new NextRequest("http://localhost/api/logs/error", { method: "GET" })
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toBe("FORBIDDEN")
  })

  it("returns filtered error logs for superadmins", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser(true))
    vi.mocked(errorLogger.query).mockReturnValue([
      {
        id: "err-1",
        timestamp: "2026-02-21T00:00:00.000Z",
        category: "oauth",
        source: "frontend",
        message: "OAuth failed",
      },
    ])
    vi.mocked(errorLogger.stats).mockReturnValue({
      oauth: { count: 1, lastSeen: "2026-02-21T00:00:00.000Z" },
    })

    const req = new NextRequest(
      "http://localhost/api/logs/error?category=oauth&source=frontend&limit=999&since=2026-02-01T00:00:00.000Z",
      { method: "GET" },
    )
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.total).toBe(1)
    expect(errorLogger.query).toHaveBeenCalledTimes(1)

    const options = vi.mocked(errorLogger.query).mock.calls[0][0]
    expect(options).toMatchObject({
      category: "oauth",
      source: "frontend",
      limit: 200,
    })
    expect(options?.since).toBeInstanceOf(Date)
  })
})
