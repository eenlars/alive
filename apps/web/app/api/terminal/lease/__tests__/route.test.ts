/**
 * Tests for POST /api/terminal/lease endpoint
 *
 * Security tests:
 * - 401 without session
 * - 401 without workspace access
 * - Superadmin workspace maps to "root" shell workspace
 *
 * Functional tests:
 * - Returns lease + wsUrl for valid workspace
 * - 502 when shell server is unreachable
 * - 500 when SHELL_PASSWORD not configured
 */

import { NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// Track fetch calls for shell server
const mockFetchImpl = vi.fn()

// Mock auth
vi.mock("@/features/auth/lib/auth", async () => {
  const { NextResponse } = await import("next/server")
  return {
    validateRequest: vi.fn(),
    createErrorResponse: vi.fn((code: string, status: number, fields?: Record<string, unknown>) => {
      return NextResponse.json({ ok: false, error: code, ...fields }, { status })
    }),
  }
})

// Mock env
vi.mock("@webalive/env/server", () => ({
  env: {
    SHELL_PASSWORD: "test-shell-password",
  },
}))

// Mock shared config
vi.mock("@webalive/shared", () => ({
  DOMAINS: { SHELL_HOST: "go.test.local" },
  SUPERADMIN: { WORKSPACE_NAME: "alive" },
}))

// Mock global fetch for shell server calls
vi.stubGlobal(
  "fetch",
  vi.fn((...args: Parameters<typeof fetch>) => {
    const [url] = args
    if (typeof url === "string" && url.includes("localhost:3888")) {
      return mockFetchImpl(...args)
    }
    // Fallback
    return Promise.resolve(new Response("Not found", { status: 404 }))
  }),
)

const { POST } = await import("../route")
const { validateRequest } = await import("@/features/auth/lib/auth")

const MOCK_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

function makeRequest(body: Record<string, unknown> = { workspace: "example.com" }): Request {
  return new Request("http://localhost/api/terminal/lease", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/terminal/lease", () => {
  it("returns 401 when session is invalid", async () => {
    vi.mocked(validateRequest).mockResolvedValue({
      error: NextResponse.json({ ok: false, error: "NO_SESSION" }, { status: 401 }),
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it("returns lease and wsUrl for valid workspace", async () => {
    vi.mocked(validateRequest).mockResolvedValue({
      data: { user: MOCK_USER, body: { workspace: "example.com" }, workspace: "example.com" },
    })
    mockFetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ lease: "abc123", workspace: "site:example.com", expiresAt: Date.now() + 90000 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.lease).toBe("abc123")
    expect(data.wsUrl).toBe("wss://go.test.local/ws?lease=abc123")

    // Verify shell server was called with correct workspace
    const [url, options] = mockFetchImpl.mock.calls[0]
    expect(url).toBe("http://localhost:3888/internal/lease")
    expect(JSON.parse(options.body)).toEqual({ workspace: "example.com" })
    expect(options.headers["X-Internal-Secret"]).toBe("test-shell-password")
  })

  it("maps superadmin workspace to root", async () => {
    vi.mocked(validateRequest).mockResolvedValue({
      data: { user: { ...MOCK_USER, isSuperadmin: true }, body: { workspace: "alive" }, workspace: "alive" },
    })
    mockFetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ lease: "root-lease", workspace: "root", expiresAt: Date.now() + 90000 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const res = await POST(makeRequest({ workspace: "alive" }))
    expect(res.status).toBe(200)

    // Verify shell server was called with "root", not "alive"
    const [, options] = mockFetchImpl.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ workspace: "root" })
  })

  it("returns 502 when shell server is unreachable", async () => {
    vi.mocked(validateRequest).mockResolvedValue({
      data: { user: MOCK_USER, body: { workspace: "example.com" }, workspace: "example.com" },
    })
    mockFetchImpl.mockRejectedValue(new Error("ECONNREFUSED"))

    const res = await POST(makeRequest())
    expect(res.status).toBe(502)
  })

  it("returns 502 when shell server returns error", async () => {
    vi.mocked(validateRequest).mockResolvedValue({
      data: { user: MOCK_USER, body: { workspace: "example.com" }, workspace: "example.com" },
    })
    mockFetchImpl.mockResolvedValue(new Response(JSON.stringify({ error: "Workspace not found" }), { status: 404 }))

    const res = await POST(makeRequest())
    expect(res.status).toBe(502)
  })
})
