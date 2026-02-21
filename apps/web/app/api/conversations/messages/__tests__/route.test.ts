/**
 * Tests for GET /api/conversations/messages endpoint
 *
 * Tests cover:
 * - Authentication required
 * - Tab ID parameter validation
 * - Access control via RLS visibility
 * - Pagination with cursor
 * - Limit parameter
 * - Data transformation
 * - Error handling
 */

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

// Mock auth
vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

// Mock Supabase client
const mockSelectMessages = vi.fn()
const mockSelectTab = vi.fn()
const mockEq = vi.fn()
const mockGt = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockSingle = vi.fn()

const mockFrom = vi.fn()

vi.mock("@/lib/supabase/server-rls", () => ({
  createRLSAppClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
    }),
  ),
}))

// Import after mocking
const { GET } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")

// Test data
const TEST_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

const TEST_TAB_WITH_CONVERSATION = {
  tab_id: "tab-123",
  conversation_id: "conv-123",
  conversations: {
    conversation_id: "conv-123",
  },
}

const TEST_MESSAGE_DB = {
  message_id: "msg-123",
  tab_id: "tab-123",
  type: "user",
  content: { kind: "text", text: "Hello" },
  version: 1,
  status: "complete",
  seq: 1,
  aborted_at: null,
  error_code: null,
  created_at: "2026-02-01T10:00:00Z",
  updated_at: "2026-02-01T10:00:00Z",
}

const TEST_MESSAGE_DB_2 = {
  message_id: "msg-456",
  tab_id: "tab-123",
  type: "assistant",
  content: { kind: "text", text: "Hi there!" },
  version: 1,
  status: "complete",
  seq: 2,
  aborted_at: null,
  error_code: null,
  created_at: "2026-02-01T10:01:00Z",
  updated_at: "2026-02-01T10:01:00Z",
}

function createMockRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/conversations/messages")
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new NextRequest(url)
}

describe("GET /api/conversations/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: authenticated user
    vi.mocked(getSessionUser).mockResolvedValue(TEST_USER)

    // Set up chainable mocks
    mockSingle.mockResolvedValue({
      data: TEST_TAB_WITH_CONVERSATION,
      error: null,
    })

    mockLimit.mockResolvedValue({
      data: [TEST_MESSAGE_DB, TEST_MESSAGE_DB_2],
      error: null,
    })

    mockOrder.mockReturnValue({ limit: mockLimit })
    mockGt.mockReturnValue({ order: mockOrder })

    // mockEq needs to handle both tab queries (with single) and message queries (with order/gt)
    mockEq.mockImplementation(() => ({
      single: mockSingle,
      eq: mockEq,
      gt: mockGt,
      order: mockOrder,
    }))

    mockSelectTab.mockReturnValue({ eq: mockEq })
    mockSelectMessages.mockReturnValue({ eq: mockEq })

    mockFrom.mockImplementation((table: string) => {
      if (table === "conversation_tabs") {
        return { select: mockSelectTab }
      }
      if (table === "messages") {
        return { select: mockSelectMessages }
      }
      return { select: vi.fn() }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("Authentication", () => {
    it("should require session (401 without user)", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("should allow authenticated users", async () => {
      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)

      expect(response.status).toBe(200)
    })
  })

  describe("Input Validation", () => {
    it("should require tabId parameter", async () => {
      const req = createMockRequest({})
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe(ErrorCodes.INVALID_REQUEST)
    })

    it("should accept optional limit parameter", async () => {
      const req = createMockRequest({ tabId: "tab-123", limit: "50" })
      const response = await GET(req)

      expect(response.status).toBe(200)
      // Verify limit was used (limit + 1 for hasMore check)
      expect(mockLimit).toHaveBeenCalledWith(51)
    })

    it("should use default limit of 100", async () => {
      const req = createMockRequest({ tabId: "tab-123" })
      await GET(req)

      expect(mockLimit).toHaveBeenCalledWith(101)
    })
  })

  describe("Access Control", () => {
    it("should return 404 if tab not found", async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: "Not found" },
      })

      const req = createMockRequest({ tabId: "nonexistent-tab" })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe(ErrorCodes.SITE_NOT_FOUND)
    })
  })

  describe("Message Fetching", () => {
    it("should return messages for tab", async () => {
      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.messages).toBeDefined()
      expect(Array.isArray(data.messages)).toBe(true)
    })

    it("should transform database format to client format", async () => {
      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.messages[0]).toMatchObject({
        id: "msg-123",
        tabId: "tab-123",
        type: "user",
        content: { kind: "text", text: "Hello" },
        version: 1,
        status: "complete",
        seq: 1,
      })
    })

    it("should convert timestamps to milliseconds", async () => {
      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(typeof data.messages[0].createdAt).toBe("number")
      expect(data.messages[0].createdAt).toBe(new Date("2026-02-01T10:00:00Z").getTime())
    })

    it("should order messages by seq ascending", async () => {
      const req = createMockRequest({ tabId: "tab-123" })
      await GET(req)

      expect(mockOrder).toHaveBeenCalledWith("seq", { ascending: true })
    })
  })

  describe("Pagination", () => {
    it("should return hasMore: false when fewer messages than limit", async () => {
      mockLimit.mockResolvedValue({
        data: [TEST_MESSAGE_DB], // Only 1 message, less than limit+1
        error: null,
      })

      const req = createMockRequest({ tabId: "tab-123", limit: "10" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.hasMore).toBe(false)
      expect(data.nextCursor).toBeNull()
    })

    it("should return hasMore: true when more messages exist", async () => {
      // Return limit+1 messages to indicate more exist
      const manyMessages = Array.from({ length: 11 }, (_, i) => ({
        ...TEST_MESSAGE_DB,
        message_id: `msg-${i}`,
        seq: i,
        created_at: `2026-02-01T10:0${i}:00Z`,
      }))

      mockLimit.mockResolvedValue({
        data: manyMessages,
        error: null,
      })

      const req = createMockRequest({ tabId: "tab-123", limit: "10" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.hasMore).toBe(true)
      expect(data.messages.length).toBe(10) // Should not include the extra one
    })

    it("should return nextCursor when hasMore is true", async () => {
      const manyMessages = Array.from({ length: 11 }, (_, i) => ({
        ...TEST_MESSAGE_DB,
        message_id: `msg-${i}`,
        seq: i,
        created_at: `2026-02-01T10:0${i}:00Z`,
      }))

      mockLimit.mockResolvedValue({
        data: manyMessages,
        error: null,
      })

      const req = createMockRequest({ tabId: "tab-123", limit: "10" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.nextCursor).toBe("2026-02-01T10:09:00Z")
    })
  })

  describe("Error Handling", () => {
    it("should return 500 on message fetch error", async () => {
      mockLimit.mockResolvedValue({
        data: null,
        error: { message: "Database error" },
      })

      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe(ErrorCodes.QUERY_FAILED)
    })

    it("should handle empty message list", async () => {
      mockLimit.mockResolvedValue({
        data: [],
        error: null,
      })

      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.messages).toEqual([])
      expect(data.hasMore).toBe(false)
    })
  })

  describe("Null Field Handling", () => {
    it("should handle null aborted_at", async () => {
      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.messages[0].abortedAt).toBeNull()
    })

    it("should convert non-null aborted_at to milliseconds", async () => {
      mockLimit.mockResolvedValue({
        data: [
          {
            ...TEST_MESSAGE_DB,
            aborted_at: "2026-02-01T10:05:00Z",
          },
        ],
        error: null,
      })

      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(typeof data.messages[0].abortedAt).toBe("number")
      expect(data.messages[0].abortedAt).toBe(new Date("2026-02-01T10:05:00Z").getTime())
    })

    it("should handle null error_code", async () => {
      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.messages[0].errorCode).toBeNull()
    })

    it("should preserve error_code when present", async () => {
      mockLimit.mockResolvedValue({
        data: [
          {
            ...TEST_MESSAGE_DB,
            status: "error",
            error_code: "RATE_LIMITED",
          },
        ],
        error: null,
      })

      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.messages[0].errorCode).toBe("RATE_LIMITED")
    })
  })

  describe("Message Types", () => {
    it("should handle user messages", async () => {
      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.messages[0].type).toBe("user")
    })

    it("should handle assistant messages", async () => {
      mockLimit.mockResolvedValue({
        data: [TEST_MESSAGE_DB_2],
        error: null,
      })

      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.messages[0].type).toBe("assistant")
    })

    it("should handle tool_use messages", async () => {
      mockLimit.mockResolvedValue({
        data: [
          {
            ...TEST_MESSAGE_DB,
            type: "tool_use",
            content: { name: "Read", input: { path: "/test" } },
          },
        ],
        error: null,
      })

      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.messages[0].type).toBe("tool_use")
    })

    it("should handle streaming status", async () => {
      mockLimit.mockResolvedValue({
        data: [
          {
            ...TEST_MESSAGE_DB,
            status: "streaming",
          },
        ],
        error: null,
      })

      const req = createMockRequest({ tabId: "tab-123" })
      const response = await GET(req)
      const data = await response.json()

      expect(data.messages[0].status).toBe("streaming")
    })
  })
})
