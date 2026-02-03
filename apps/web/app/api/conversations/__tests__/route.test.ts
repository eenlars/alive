/**
 * Tests for GET /api/conversations endpoint
 *
 * Tests cover:
 * - Authentication required
 * - Workspace parameter validation
 * - Fetching own conversations
 * - Fetching shared conversations from org
 * - Excluding deleted conversations
 * - Data transformation (server → client format)
 * - Error handling
 *
 * @vitest-environment node
 * @error-check-disable - Tests use old error format, need migration to ErrorCodes
 */

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

// Mock auth
vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

// Mock org resolver
vi.mock("@/lib/deployment/org-resolver", () => ({
  getOrgIdForUser: vi.fn(),
}))

// Mock Supabase client
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockNeq = vi.fn()
const mockIs = vi.fn()
const mockOrder = vi.fn()

vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(() => ({
        select: mockSelect,
      })),
    }),
  ),
}))

// Import after mocking
const { GET } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { getOrgIdForUser } = await import("@/lib/deployment/org-resolver")

// Test data
const TEST_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
}

const TEST_ORG_ID = "org-123"
const TEST_WORKSPACE = "test.example.com"

const TEST_CONVERSATION_DB = {
  conversation_id: "conv-123",
  workspace: TEST_WORKSPACE,
  org_id: TEST_ORG_ID,
  user_id: TEST_USER.id,
  title: "Test Conversation",
  visibility: "private",
  message_count: 5,
  last_message_at: "2026-02-01T10:00:00Z",
  first_user_message_id: "msg-1",
  auto_title_set: false,
  created_at: "2026-02-01T09:00:00Z",
  updated_at: "2026-02-01T10:00:00Z",
  deleted_at: null,
  archived_at: null,
  conversation_tabs: [
    {
      tab_id: "tab-123",
      conversation_id: "conv-123",
      name: "current",
      position: 0,
      message_count: 5,
      last_message_at: "2026-02-01T10:00:00Z",
      created_at: "2026-02-01T09:00:00Z",
      closed_at: null,
    },
  ],
}

const TEST_SHARED_CONVERSATION_DB = {
  conversation_id: "conv-456",
  workspace: TEST_WORKSPACE,
  org_id: TEST_ORG_ID,
  user_id: "other-user-789",
  title: "Shared Conversation",
  visibility: "shared",
  message_count: 10,
  last_message_at: "2026-02-01T11:00:00Z",
  first_user_message_id: "msg-10",
  auto_title_set: true,
  created_at: "2026-02-01T08:00:00Z",
  updated_at: "2026-02-01T11:00:00Z",
  deleted_at: null,
  archived_at: null,
  conversation_tabs: [],
}

function createMockRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/conversations")
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new NextRequest(url)
}

describe("GET /api/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: authenticated user
    vi.mocked(getSessionUser).mockResolvedValue(TEST_USER)

    // Default: user has org
    vi.mocked(getOrgIdForUser).mockResolvedValue(TEST_ORG_ID)

    // Set up chainable mock for Supabase queries
    mockOrder.mockReturnValue({
      data: [TEST_CONVERSATION_DB],
      error: null,
    })
    mockIs.mockReturnValue({ order: mockOrder })
    mockNeq.mockReturnValue({ is: mockIs })
    mockEq.mockImplementation(() => ({
      eq: mockEq,
      neq: mockNeq,
      is: mockIs,
    }))
    mockSelect.mockReturnValue({ eq: mockEq })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("Authentication", () => {
    it("should require session (401 without user)", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("should allow authenticated users", async () => {
      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)

      expect(response.status).toBe(200)
    })
  })

  describe("Input Validation", () => {
    it("should require workspace parameter", async () => {
      const req = createMockRequest({})
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe(ErrorCodes.INVALID_REQUEST)
    })

    it("should return 404 if user has no org", async () => {
      vi.mocked(getOrgIdForUser).mockResolvedValue(null)

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe(ErrorCodes.ORG_NOT_FOUND)
    })
  })

  describe("Fetching Own Conversations", () => {
    it("should return own conversations for workspace", async () => {
      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.own).toBeDefined()
      expect(Array.isArray(data.own)).toBe(true)
    })

    it("should transform database format to client format", async () => {
      // Mock to return a specific conversation
      mockOrder
        .mockReturnValueOnce({
          data: [TEST_CONVERSATION_DB],
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          error: null,
        })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.own[0]).toMatchObject({
        id: "conv-123",
        workspace: TEST_WORKSPACE,
        orgId: TEST_ORG_ID,
        title: "Test Conversation",
        visibility: "private",
        messageCount: 5,
      })
    })

    it("should convert timestamps to milliseconds", async () => {
      mockOrder
        .mockReturnValueOnce({
          data: [TEST_CONVERSATION_DB],
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          error: null,
        })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      const conv = data.own[0]
      expect(typeof conv.createdAt).toBe("number")
      expect(typeof conv.updatedAt).toBe("number")
      expect(conv.createdAt).toBe(new Date("2026-02-01T09:00:00Z").getTime())
    })

    it("should include tabs with conversations", async () => {
      mockOrder
        .mockReturnValueOnce({
          data: [TEST_CONVERSATION_DB],
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          error: null,
        })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(data.own[0].tabs).toBeDefined()
      expect(data.own[0].tabs.length).toBe(1)
      expect(data.own[0].tabs[0]).toMatchObject({
        id: "tab-123",
        conversationId: "conv-123",
        name: "current",
        position: 0,
      })
    })
  })

  describe("Fetching Shared Conversations", () => {
    it("should return shared conversations from org", async () => {
      // First call: own conversations, second call: shared
      mockOrder
        .mockReturnValueOnce({
          data: [TEST_CONVERSATION_DB],
          error: null,
        })
        .mockReturnValueOnce({
          data: [TEST_SHARED_CONVERSATION_DB],
          error: null,
        })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.shared).toBeDefined()
      expect(Array.isArray(data.shared)).toBe(true)
    })

    it("should include creatorId for shared conversations", async () => {
      mockOrder
        .mockReturnValueOnce({
          data: [],
          error: null,
        })
        .mockReturnValueOnce({
          data: [TEST_SHARED_CONVERSATION_DB],
          error: null,
        })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(data.shared[0].creatorId).toBe("other-user-789")
    })

    it("should continue if shared query fails (graceful degradation)", async () => {
      // Own succeeds, shared fails
      mockOrder
        .mockReturnValueOnce({
          data: [TEST_CONVERSATION_DB],
          error: null,
        })
        .mockReturnValueOnce({
          data: null,
          error: { message: "Query failed" },
        })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      // Should still return 200 with own conversations
      expect(response.status).toBe(200)
      expect(data.own.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Filtering", () => {
    it("should exclude deleted conversations", async () => {
      // The query should call .is("deleted_at", null)
      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      await GET(req)

      // Verify the chain includes is() call for deleted_at
      expect(mockIs).toHaveBeenCalled()
    })

    it("should order by updated_at descending", async () => {
      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      await GET(req)

      expect(mockOrder).toHaveBeenCalledWith("updated_at", { ascending: false })
    })
  })

  describe("Error Handling", () => {
    it("should return 500 on database error for own conversations", async () => {
      mockOrder.mockReturnValueOnce({
        data: null,
        error: { message: "Database error" },
      })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe(ErrorCodes.INTERNAL_ERROR)
    })

    it("should handle empty results gracefully", async () => {
      mockOrder.mockReturnValue({
        data: [],
        error: null,
      })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.own).toEqual([])
      expect(data.shared).toEqual([])
    })
  })

  describe("Null Timestamp Handling", () => {
    it("should handle null last_message_at", async () => {
      const convWithNullTimestamp = {
        ...TEST_CONVERSATION_DB,
        last_message_at: null,
      }

      mockOrder
        .mockReturnValueOnce({
          data: [convWithNullTimestamp],
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          error: null,
        })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(data.own[0].lastMessageAt).toBeNull()
    })

    it("should handle null archived_at and deleted_at", async () => {
      mockOrder
        .mockReturnValueOnce({
          data: [TEST_CONVERSATION_DB],
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          error: null,
        })

      const req = createMockRequest({ workspace: TEST_WORKSPACE })
      const response = await GET(req)
      const data = await response.json()

      expect(data.own[0].archivedAt).toBeNull()
      expect(data.own[0].deletedAt).toBeNull()
    })
  })
})
