/**
 * Tests for POST /api/conversations/sync endpoint
 *
 * Tests cover:
 * - Authentication required
 * - Single conversation sync
 * - Batch sync (multiple conversations)
 * - Conflict detection
 * - Input validation
 */

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

// Mock auth
vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

// Mock Supabase client
const mockUpsert = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()

vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            upsert: mockUpsert,
            select: mockSelect,
          }
        }
        return {
          upsert: mockUpsert,
        }
      }),
    }),
  ),
}))

// Import after mocking
const { POST } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")

// Test data
const TEST_USER = {
  id: "user-test-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
}

const TEST_CONVERSATION = {
  id: "conv-123",
  workspace: "test.example.com",
  orgId: "org-123",
  title: "Test Conversation",
  visibility: "private" as const,
  messageCount: 5,
  lastMessageAt: Date.now(),
  firstUserMessageId: "msg-1",
  autoTitleSet: false,
  createdAt: Date.now() - 10000,
  updatedAt: Date.now(),
  deletedAt: null,
  archivedAt: null,
}

const TEST_TAB = {
  id: "tab-123",
  conversationId: "conv-123",
  name: "current",
  position: 0,
  messageCount: 5,
  lastMessageAt: Date.now(),
  createdAt: Date.now() - 10000,
  closedAt: null,
}

const TEST_MESSAGE = {
  id: "msg-123",
  tabId: "tab-123",
  type: "user" as const,
  content: { kind: "text", text: "Hello" },
  version: 1,
  status: "complete" as const,
  seq: 1,
  abortedAt: null,
  errorCode: null,
  createdAt: Date.now() - 5000,
  updatedAt: Date.now(),
}

function createMockRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/conversations/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/conversations/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: authenticated user
    vi.mocked(getSessionUser).mockResolvedValue(TEST_USER)

    // Default: successful upserts
    mockUpsert.mockResolvedValue({ error: null })

    // Default: no existing conversation (no conflict)
    mockSelect.mockReturnValue({
      eq: mockEq,
    })
    mockEq.mockReturnValue({
      single: mockSingle,
    })
    mockSingle.mockResolvedValue({ data: null, error: null })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("Authentication", () => {
    it("should require session (401 without user)", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const req = createMockRequest({
        conversation: TEST_CONVERSATION,
        tabs: [],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("should allow authenticated users", async () => {
      const req = createMockRequest({
        conversation: TEST_CONVERSATION,
        tabs: [],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })
  })

  describe("Input Validation", () => {
    it("should require orgId", async () => {
      const req = createMockRequest({
        conversation: { ...TEST_CONVERSATION, orgId: undefined },
        tabs: [],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe(ErrorCodes.ORG_ID_REQUIRED)
    })

    it("should accept valid single conversation payload", async () => {
      const req = createMockRequest({
        conversation: TEST_CONVERSATION,
        tabs: [TEST_TAB],
        messages: [TEST_MESSAGE],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.synced.conversations).toBe(1)
      expect(data.synced.tabs).toBe(1)
      expect(data.synced.messages).toBe(1)
    })
  })

  describe("Single Conversation Sync", () => {
    it("should sync conversation without tabs or messages", async () => {
      const req = createMockRequest({
        conversation: TEST_CONVERSATION,
        tabs: [],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.synced.conversations).toBe(1)
      expect(data.synced.tabs).toBe(0)
      expect(data.synced.messages).toBe(0)
    })

    it("should sync conversation with tabs", async () => {
      const req = createMockRequest({
        conversation: TEST_CONVERSATION,
        tabs: [TEST_TAB, { ...TEST_TAB, id: "tab-456", position: 1 }],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.synced.tabs).toBe(2)
    })

    it("should sync conversation with messages", async () => {
      const req = createMockRequest({
        conversation: TEST_CONVERSATION,
        tabs: [TEST_TAB],
        messages: [TEST_MESSAGE, { ...TEST_MESSAGE, id: "msg-456", seq: 2, type: "assistant" }],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.synced.messages).toBe(2)
    })

    it("should handle shared visibility", async () => {
      const req = createMockRequest({
        conversation: { ...TEST_CONVERSATION, visibility: "shared" },
        tabs: [],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })
  })

  describe("Batch Sync", () => {
    it("should sync multiple conversations in one request", async () => {
      const req = createMockRequest({
        conversations: [
          {
            conversation: TEST_CONVERSATION,
            tabs: [TEST_TAB],
            messages: [TEST_MESSAGE],
          },
          {
            conversation: { ...TEST_CONVERSATION, id: "conv-456", title: "Second" },
            tabs: [{ ...TEST_TAB, id: "tab-789", conversationId: "conv-456" }],
            messages: [],
          },
        ],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.synced.conversations).toBe(2)
      expect(data.synced.tabs).toBe(2)
      expect(data.synced.messages).toBe(1)
    })

    it("should report errors for invalid conversations in batch", async () => {
      const req = createMockRequest({
        conversations: [
          {
            conversation: TEST_CONVERSATION,
            tabs: [],
            messages: [],
          },
          {
            conversation: { ...TEST_CONVERSATION, id: "conv-bad", orgId: undefined },
            tabs: [],
            messages: [],
          },
        ],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.synced.conversations).toBe(1)
      expect(data.errors).toBeDefined()
      expect(data.errors.length).toBe(1)
      expect(data.errors[0]).toContain("conv-bad")
    })
  })

  describe("Conflict Detection", () => {
    it("should detect conflict when server has newer data", async () => {
      // Server has data updated at time X+1000
      const serverUpdatedAt = new Date(Date.now() + 1000).toISOString()
      mockSingle.mockResolvedValue({
        data: { updated_at: serverUpdatedAt },
        error: null,
      })

      const req = createMockRequest({
        conversation: {
          ...TEST_CONVERSATION,
          remoteUpdatedAt: Date.now() - 5000, // Client thinks server was at X-5000
        },
        tabs: [],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe(ErrorCodes.CONVERSATION_BUSY)
      expect(data.conflict).toBeDefined()
      expect(data.conflict.conversationId).toBe("conv-123")
    })

    it("should allow sync when server data is older", async () => {
      // Server has data from 10 seconds ago
      const serverUpdatedAt = new Date(Date.now() - 10000).toISOString()
      mockSingle.mockResolvedValue({
        data: { updated_at: serverUpdatedAt },
        error: null,
      })

      const req = createMockRequest({
        conversation: {
          ...TEST_CONVERSATION,
          remoteUpdatedAt: Date.now() - 5000, // Client's last known server state
        },
        tabs: [],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should skip conflict check when remoteUpdatedAt is not provided", async () => {
      const req = createMockRequest({
        conversation: TEST_CONVERSATION, // No remoteUpdatedAt
        tabs: [],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      // select should not be called for conflict check
      expect(mockSelect).not.toHaveBeenCalled()
    })

    it("should report conflicts in batch without failing entire request", async () => {
      // First conversation has conflict
      mockSingle
        .mockResolvedValueOnce({
          data: { updated_at: new Date(Date.now() + 1000).toISOString() },
          error: null,
        })
        // Second conversation has no conflict
        .mockResolvedValueOnce({
          data: null,
          error: null,
        })

      const req = createMockRequest({
        conversations: [
          {
            conversation: { ...TEST_CONVERSATION, remoteUpdatedAt: Date.now() - 5000 },
            tabs: [],
            messages: [],
          },
          {
            conversation: {
              ...TEST_CONVERSATION,
              id: "conv-456",
              remoteUpdatedAt: Date.now() - 5000,
            },
            tabs: [],
            messages: [],
          },
        ],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.synced.conversations).toBe(1)
      expect(data.conflicts).toBeDefined()
      expect(data.conflicts.length).toBe(1)
      expect(data.conflicts[0].conversationId).toBe("conv-123")
    })
  })

  describe("Database Error Handling", () => {
    it("should return 500 on conversation upsert failure", async () => {
      mockUpsert.mockResolvedValueOnce({
        error: { message: "Database error" },
      })

      const req = createMockRequest({
        conversation: TEST_CONVERSATION,
        tabs: [],
        messages: [],
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("INTERNAL_ERROR")
    })

    it("should handle tab upsert failure", async () => {
      // First call (conversation) succeeds, second call (tabs) fails
      mockUpsert.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "Tab error" } })

      const req = createMockRequest({
        conversation: TEST_CONVERSATION,
        tabs: [TEST_TAB],
        messages: [],
      })
      const response = await POST(req)
      await response.json() // consume body

      expect(response.status).toBe(500)
    })
  })

  describe("Timestamp Conversion", () => {
    it("should convert timestamps to ISO format", async () => {
      const now = Date.now()
      const req = createMockRequest({
        conversation: {
          ...TEST_CONVERSATION,
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
          archivedAt: now,
        },
        tabs: [],
        messages: [],
      })

      await POST(req)

      // Verify upsert was called with ISO strings
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString(),
          deleted_at: new Date(now).toISOString(),
          archived_at: new Date(now).toISOString(),
        }),
        expect.any(Object),
      )
    })

    it("should handle null timestamps", async () => {
      const req = createMockRequest({
        conversation: {
          ...TEST_CONVERSATION,
          deletedAt: null,
          archivedAt: null,
          lastMessageAt: null,
        },
        tabs: [],
        messages: [],
      })

      await POST(req)

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          deleted_at: null,
          archived_at: null,
          last_message_at: null,
        }),
        expect.any(Object),
      )
    })
  })
})
