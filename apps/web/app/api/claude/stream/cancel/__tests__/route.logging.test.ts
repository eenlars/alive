import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  verifyWorkspaceAccess: vi.fn(),
  createErrorResponse: vi.fn(),
  cancelStream: vi.fn(),
  cancelStreamByConversationKey: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock("@/features/auth/lib/auth", () => ({
  requireSessionUser: mocks.requireSessionUser,
  verifyWorkspaceAccess: mocks.verifyWorkspaceAccess,
  createErrorResponse: mocks.createErrorResponse,
}))

vi.mock("@/lib/stream/cancellation-registry", () => ({
  cancelStream: mocks.cancelStream,
  cancelStreamByConversationKey: mocks.cancelStreamByConversationKey,
}))

vi.mock("node:fs", () => ({
  appendFileSync: mocks.appendFileSync,
  mkdirSync: mocks.mkdirSync,
}))

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}))

describe("POST /api/claude/stream/cancel logging resilience", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.requireSessionUser.mockResolvedValue({
      id: "test-user-123",
      email: "test@example.com",
      name: "Test User",
    })
    mocks.verifyWorkspaceAccess.mockResolvedValue("test-workspace")
    mocks.createErrorResponse.mockImplementation((error: string, status: number, fields?: Record<string, unknown>) => {
      return new Response(
        JSON.stringify({
          ok: false,
          error,
          message: `Error: ${error}`,
          category: status >= 500 ? "server" : "user",
          ...fields,
        }),
        { status },
      )
    })

    mocks.cancelStream.mockResolvedValue(false)
    mocks.cancelStreamByConversationKey.mockResolvedValue(false)
    mocks.mkdirSync.mockImplementation(() => undefined)
    mocks.appendFileSync.mockImplementation(() => undefined)
    mocks.captureException.mockImplementation(() => undefined)
  })

  it("disables file logging after first write failure to avoid repeated errors", async () => {
    mocks.appendFileSync.mockImplementationOnce(() => {
      throw new Error("EACCES: permission denied")
    })

    const { POST } = await import("../route")

    const req1 = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ requestId: "req-1" }),
      headers: { "Content-Type": "application/json" },
    })
    const req2 = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ requestId: "req-2" }),
      headers: { "Content-Type": "application/json" },
    })

    const response1 = await POST(req1 as any)
    const response2 = await POST(req2 as any)

    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)
    expect(mocks.appendFileSync).toHaveBeenCalledTimes(1)
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
  })
})
