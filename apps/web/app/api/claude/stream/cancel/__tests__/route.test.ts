import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as auth from "@/features/auth/lib/auth"
import { tabKey } from "@/features/auth/lib/sessionStore"
import { getRegistrySize, registerCancellation, unregisterCancellation } from "@/lib/stream/cancellation-registry"

const TEST_TAB_GROUP_ID = "00000000-0000-0000-0000-000000000000"

function makeConversationKey(userId: string, tabId: string, workspace = "test-workspace") {
  return tabKey({ userId, workspace, tabGroupId: TEST_TAB_GROUP_ID, tabId })
}

// Mock auth functions
interface MockUser {
  id: string
  email: string
  name: string
}

interface CancelRequestBody {
  workspace?: string
  worktree?: string
  requestId?: string
  tabId?: string
  tabGroupId?: string
}

vi.mock("@/features/auth/lib/auth", () => ({
  requireSessionUser: async (): Promise<MockUser> => ({
    id: "test-user-123",
    email: "test@example.com",
    name: "Test User",
  }),
  verifyWorkspaceAccess: async (_user: MockUser, body: CancelRequestBody): Promise<string> =>
    body.workspace || "test-workspace",
}))

vi.mock("@/lib/api/responses", () => ({
  structuredErrorResponse: (
    error: string,
    { status, details }: { status: number; details?: Record<string, unknown> },
  ) => {
    return new Response(
      JSON.stringify({
        ok: false,
        error,
        message: `Error: ${error}`,
        category: status >= 500 ? "server" : "user",
        ...details,
      }),
      { status },
    )
  },
}))

import { POST } from "../route"

describe("POST /api/claude/stream/cancel", () => {
  beforeEach(() => {
    // Clean up any stale registrations
    const initialSize = getRegistrySize()
    if (initialSize > 0) {
      console.warn(`Registry not clean before test: ${initialSize} entries`)
    }
  })

  afterEach(() => {
    // Cleanup: remove any test registrations
    unregisterCancellation("test-req-1")
    unregisterCancellation("test-req-2")
    unregisterCancellation("test-req-3")
  })

  it("should cancel an active stream", async () => {
    let cancelled = false
    const requestId = "test-req-1"
    const userId = "test-user-123"
    const conversationKey = makeConversationKey(userId, "cancel-active")

    // Register a stream
    registerCancellation(requestId, userId, conversationKey, () => {
      cancelled = true
    })

    // Call cancel endpoint
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ requestId }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("cancelled")
    expect(cancelled).toBe(true)
  })

  it("should return already_complete for non-existent stream", async () => {
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ requestId: "non-existent" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("already_complete")
  })

  it("should return 400 for missing both requestId and tabId", async () => {
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.message).toContain("Either requestId or tabId is required")
  })

  it("should return 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: "{invalid-json",
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.error).toBe("INVALID_JSON")
  })

  it("should return 400 when JSON body is not an object", async () => {
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify(["not", "an", "object"]),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.message).toContain("Request body must be a JSON object")
  })

  it("should return 403 when cancelling another user's stream", async () => {
    let cancelled = false
    const requestId = "test-req-2"
    const ownerUserId = "other-user-456"
    const conversationKey = makeConversationKey(ownerUserId, "forbidden-cancel")

    // Register a stream owned by different user
    registerCancellation(requestId, ownerUserId, conversationKey, () => {
      cancelled = true
    })

    // Try to cancel as test-user-123
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ requestId }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.ok).toBe(false)
    expect(cancelled).toBe(false) // Should NOT be cancelled
  })

  it("should be idempotent (calling twice is safe)", async () => {
    let cancelCount = 0
    const requestId = "test-req-3"
    const userId = "test-user-123"
    const conversationKey = makeConversationKey(userId, "idempotent-cancel")

    // Register a stream
    registerCancellation(requestId, userId, conversationKey, () => {
      cancelCount++
    })

    // First call - should cancel
    const req1 = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ requestId }),
      headers: { "Content-Type": "application/json" },
    })

    const response1 = await POST(req1 as any)
    const data1 = await response1.json()

    expect(response1.status).toBe(200)
    expect(data1.status).toBe("cancelled")
    expect(cancelCount).toBe(1)

    // Second call - should return already_complete
    const req2 = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ requestId }),
      headers: { "Content-Type": "application/json" },
    })

    const response2 = await POST(req2 as any)
    const data2 = await response2.json()

    expect(response2.status).toBe(200)
    expect(data2.status).toBe("already_complete")
    expect(cancelCount).toBe(1) // Should NOT increment
  })

  // tabId fallback tests (super-early Stop case)
  it("should cancel by tabId when requestId not available", async () => {
    let cancelled = false
    const requestId = "test-req-conv-1"
    const userId = "test-user-123"
    const tabId = "tab-abc-123"
    const tabGroupId = "11111111-1111-1111-1111-111111111111"
    const workspace = "test-workspace"
    const tabKeyValue = tabKey({ userId, workspace, tabGroupId, tabId })

    // Register a stream
    registerCancellation(requestId, userId, tabKeyValue, () => {
      cancelled = true
    })

    // Call cancel endpoint with tabId (super-early Stop)
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ tabId, tabGroupId, workspace }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("cancelled")
    expect(data.tabId).toBe(tabId)
    expect(cancelled).toBe(true)
  })

  it("should return already_complete for non-existent tabId", async () => {
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({
        tabId: "non-existent",
        tabGroupId: "11111111-1111-1111-1111-111111111111",
        workspace: "test",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("already_complete")
  })

  it("should not find another user's stream when cancelling by tabId (security by isolation)", async () => {
    let cancelled = false
    const requestId = "test-req-conv-2"
    const ownerUserId = "other-user-456"
    const tabId = "tab-xyz-789"
    const tabGroupId = "11111111-1111-1111-1111-111111111111"
    const workspace = "test-workspace"
    const tabKeyValue = tabKey({ userId: ownerUserId, workspace, tabGroupId, tabId })

    // Register a stream owned by different user
    registerCancellation(requestId, ownerUserId, tabKeyValue, () => {
      cancelled = true
    })

    // Try to cancel as test-user-123 using tabId
    // Security: tabKey is built using caller's userId, so will never match
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ tabId, tabGroupId, workspace }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    // Should return "already_complete" (not found) - users are isolated by tabKey
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("already_complete")
    expect(cancelled).toBe(false) // Should NOT be cancelled - different user

    // Cleanup
    unregisterCancellation(requestId)
  })

  it("should return 400 when tabId is provided without tabGroupId", async () => {
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ tabId: "some-tab", workspace: "test-workspace" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.message).toContain("tabGroupId is required")
  })

  it("should return 400 when tabGroupId is not a string", async () => {
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ tabId: "some-tab", tabGroupId: 123, workspace: "test-workspace" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.ok).toBe(false)
    expect(data.message).toContain("tabGroupId is required")
  })

  it("should return 401 when tabId cancellation workspace access is denied", async () => {
    const workspaceAccessSpy = vi.spyOn(auth, "verifyWorkspaceAccess").mockResolvedValueOnce(null as unknown as string)

    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({
        tabId: "tab-unauthorized",
        tabGroupId: "11111111-1111-1111-1111-111111111111",
        workspace: "forbidden-workspace",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.ok).toBe(false)
    expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")

    workspaceAccessSpy.mockRestore()
  })

  it("should prefer requestId over tabId when both provided", async () => {
    let cancelled1 = false
    let cancelled2 = false
    const requestId1 = "test-req-primary"
    const requestId2 = "test-req-fallback"
    const userId = "test-user-123"
    const tabId = "tab-both-123"
    const tabGroupId = "11111111-1111-1111-1111-111111111111"
    const workspace = "test-workspace"
    const tabKeyValue = tabKey({ userId, workspace, tabGroupId, tabId })

    // Register two streams: one for requestId, one for tabKey
    registerCancellation(requestId1, userId, tabKeyValue, () => {
      cancelled1 = true
    })
    registerCancellation(requestId2, userId, tabKeyValue, () => {
      cancelled2 = true
    })

    // Call cancel endpoint with BOTH requestId and tabId
    const req = new Request("http://localhost/api/claude/stream/cancel", {
      method: "POST",
      body: JSON.stringify({ requestId: requestId1, tabId, tabGroupId, workspace }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req as any)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("cancelled")
    expect(data.requestId).toBe(requestId1) // Should use requestId path
    expect(cancelled1).toBe(true) // Primary path
    expect(cancelled2).toBe(false) // Fallback path NOT used

    // Cleanup
    unregisterCancellation(requestId1)
    unregisterCancellation(requestId2)
  })

  // Worktree validation tests (prevent session key corruption)
  describe("worktree validation", () => {
    it("should reject worktree containing :: (session key delimiter)", async () => {
      const req = new Request("http://localhost/api/claude/stream/cancel", {
        method: "POST",
        body: JSON.stringify({
          tabId: "some-tab",
          tabGroupId: "11111111-1111-1111-1111-111111111111",
          workspace: "test-workspace",
          worktree: "foo::bar", // Malicious: contains session key delimiter
        }),
        headers: { "Content-Type": "application/json" },
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.message).toContain("Invalid worktree slug")
    })

    it("should reject reserved worktree slugs", async () => {
      const req = new Request("http://localhost/api/claude/stream/cancel", {
        method: "POST",
        body: JSON.stringify({
          tabId: "some-tab",
          tabGroupId: "11111111-1111-1111-1111-111111111111",
          workspace: "test-workspace",
          worktree: "user", // Reserved slug
        }),
        headers: { "Content-Type": "application/json" },
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.message).toContain("Invalid worktree slug")
    })

    it("should reject worktree with spaces", async () => {
      const req = new Request("http://localhost/api/claude/stream/cancel", {
        method: "POST",
        body: JSON.stringify({
          tabId: "some-tab",
          tabGroupId: "11111111-1111-1111-1111-111111111111",
          workspace: "test-workspace",
          worktree: "foo bar",
        }),
        headers: { "Content-Type": "application/json" },
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.message).toContain("Invalid worktree slug")
    })

    it("should normalize and accept valid worktree with uppercase", async () => {
      let cancelled = false
      const requestId = "test-req-worktree-valid"
      const userId = "test-user-123"
      const tabId = "tab-worktree-123"
      const tabGroupId = "11111111-1111-1111-1111-111111111111"
      const workspace = "test-workspace"
      const worktree = "feature-1" // Will be normalized from "Feature-1"
      const tabKeyValue = tabKey({ userId, workspace, worktree, tabGroupId, tabId })

      registerCancellation(requestId, userId, tabKeyValue, () => {
        cancelled = true
      })

      const req = new Request("http://localhost/api/claude/stream/cancel", {
        method: "POST",
        body: JSON.stringify({
          tabId,
          tabGroupId,
          workspace,
          worktree: "Feature-1", // Uppercase should be normalized
        }),
        headers: { "Content-Type": "application/json" },
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.status).toBe("cancelled")
      expect(cancelled).toBe(true)

      unregisterCancellation(requestId)
    })

    it("should allow cancel without worktree", async () => {
      let cancelled = false
      const requestId = "test-req-no-worktree"
      const userId = "test-user-123"
      const tabId = "tab-no-wt-123"
      const tabGroupId = "11111111-1111-1111-1111-111111111111"
      const workspace = "test-workspace"
      const tabKeyValue = tabKey({ userId, workspace, tabGroupId, tabId })

      registerCancellation(requestId, userId, tabKeyValue, () => {
        cancelled = true
      })

      const req = new Request("http://localhost/api/claude/stream/cancel", {
        method: "POST",
        body: JSON.stringify({
          tabId,
          tabGroupId,
          workspace,
          // No worktree - should work
        }),
        headers: { "Content-Type": "application/json" },
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.status).toBe("cancelled")
      expect(cancelled).toBe(true)

      unregisterCancellation(requestId)
    })
  })
})
