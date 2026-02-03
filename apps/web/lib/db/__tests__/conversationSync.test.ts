/**
 * Tests for Conversation Sync Service
 *
 * Tests the client-side sync logic including:
 * - Debounced sync queue
 * - Batch sync behavior
 * - Conflict handling
 * - Offline handling
 * - Exponential backoff
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock navigator for Node.js environment (CI)
if (typeof navigator === "undefined") {
  // @ts-expect-error - mocking global navigator for tests
  global.navigator = { onLine: true }
}

// Mock Dexie database
const mockConversationsGet = vi.fn()
const mockConversationsUpdate = vi.fn()
const mockConversationsPut = vi.fn()
const mockConversationsWhere = vi.fn()
const mockTabsGet = vi.fn()
const mockTabsWhere = vi.fn()
const mockTabsBulkPut = vi.fn()
const mockTabsPut = vi.fn()
const mockMessagesWhere = vi.fn()
const mockMessagesBulkPut = vi.fn()
const mockMessagesGet = vi.fn()
const mockMessagesPut = vi.fn()

vi.mock("../messageDb", () => ({
  getMessageDb: vi.fn(() => ({
    conversations: {
      get: mockConversationsGet,
      update: mockConversationsUpdate,
      put: mockConversationsPut,
      where: mockConversationsWhere,
    },
    tabs: {
      get: mockTabsGet,
      where: mockTabsWhere,
      bulkPut: mockTabsBulkPut,
      put: mockTabsPut,
      count: vi.fn().mockResolvedValue(5),
    },
    messages: {
      where: mockMessagesWhere,
      bulkPut: mockMessagesBulkPut,
      get: mockMessagesGet,
      put: mockMessagesPut,
    },
  })),
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

// Import after mocking
const {
  queueSync,
  forceSyncNow,
  syncFromServer,
  fetchConversations,
  fetchTabMessages,
  shareConversation,
  unshareConversation,
  archiveConversation,
  deleteConversation,
} = await import("../conversationSync")

// Test data
const TEST_USER_ID = "user-123"
const TEST_WORKSPACE = "test.example.com"
const TEST_ORG_ID = "org-123"

const TEST_CONVERSATION = {
  id: "conv-123",
  workspace: TEST_WORKSPACE,
  orgId: TEST_ORG_ID,
  creatorId: TEST_USER_ID,
  title: "Test Conversation",
  visibility: "private",
  messageCount: 5,
  lastMessageAt: Date.now(),
  firstUserMessageId: "msg-1",
  autoTitleSet: false,
  createdAt: Date.now() - 10000,
  updatedAt: Date.now(),
  deletedAt: null,
  archivedAt: null,
  syncedAt: null,
  remoteUpdatedAt: null,
  pendingSync: true,
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
  syncedAt: null,
  pendingSync: true,
}

const TEST_MESSAGE = {
  id: "msg-123",
  tabId: "tab-123",
  type: "user",
  content: { kind: "text", text: "Hello" },
  version: 1,
  status: "complete",
  origin: "local",
  seq: 1,
  abortedAt: null,
  errorCode: null,
  createdAt: Date.now() - 5000,
  updatedAt: Date.now(),
  syncedAt: null,
  pendingSync: true,
}

describe("Conversation Sync Service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Default: online
    Object.defineProperty(navigator, "onLine", { value: true, writable: true })

    // Default mock implementations
    mockConversationsGet.mockResolvedValue(TEST_CONVERSATION)
    mockConversationsUpdate.mockResolvedValue(1)
    mockConversationsPut.mockResolvedValue("conv-123")
    mockConversationsWhere.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(1),
      }),
    })

    mockTabsWhere.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([TEST_TAB]),
      }),
    })
    mockTabsGet.mockResolvedValue(null)
    mockTabsBulkPut.mockResolvedValue([])
    mockTabsPut.mockResolvedValue("tab-123")

    mockMessagesWhere.mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        and: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([TEST_MESSAGE]),
        }),
      }),
      between: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([TEST_MESSAGE]),
      }),
    })
    mockMessagesBulkPut.mockResolvedValue([])
    mockMessagesGet.mockResolvedValue(null)
    mockMessagesPut.mockResolvedValue("msg-123")

    // Default: successful sync
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          synced: { conversations: 1, tabs: 1, messages: 1 },
        }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe("queueSync (Debounced)", () => {
    it("should debounce multiple calls within 2 seconds", async () => {
      queueSync("conv-1", TEST_USER_ID)
      queueSync("conv-2", TEST_USER_ID)
      queueSync("conv-3", TEST_USER_ID)

      // Before debounce timeout, no fetch should be called
      expect(mockFetch).not.toHaveBeenCalled()

      // Advance timers by 2 seconds
      await vi.advanceTimersByTimeAsync(2000)

      // Now fetch should be called (batch or single)
      expect(mockFetch).toHaveBeenCalled()
    })

    it("should reset debounce timer on new call", async () => {
      queueSync("conv-1", TEST_USER_ID)

      // Advance 1.5 seconds (less than 2 second debounce)
      await vi.advanceTimersByTimeAsync(1500)

      // New call resets timer
      queueSync("conv-2", TEST_USER_ID)

      // Advance another 1.5 seconds (now 3 seconds from first call, 1.5 from second)
      await vi.advanceTimersByTimeAsync(1500)

      // Still shouldn't have fired (only 1.5 seconds since last call)
      expect(mockFetch).not.toHaveBeenCalled()

      // Advance remaining 0.5 seconds
      await vi.advanceTimersByTimeAsync(500)

      // Now should fire
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe("forceSyncNow", () => {
    it("should bypass debounce and sync immediately", async () => {
      forceSyncNow("conv-123", TEST_USER_ID)

      // Should call fetch immediately (no timer needed)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe("Offline Handling", () => {
    it("should skip sync when offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false })

      forceSyncNow("conv-123", TEST_USER_ID)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("should skip fetch when offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false })

      await fetchConversations(TEST_WORKSPACE, TEST_USER_ID, TEST_ORG_ID)

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("Conflict Handling", () => {
    it("should handle 409 conflict response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            error: "Conflict detected",
            conflict: {
              conversationId: "conv-123",
              localUpdatedAt: Date.now(),
              serverUpdatedAt: Date.now() + 1000,
            },
          }),
      })

      forceSyncNow("conv-123", TEST_USER_ID)
      await vi.advanceTimersByTimeAsync(0)

      // Should update conversation to stop syncing
      expect(mockConversationsUpdate).toHaveBeenCalledWith(
        "conv-123",
        expect.objectContaining({
          pendingSync: false,
          lastSyncError: expect.stringContaining("Conflict"),
        }),
      )
    })

    it("should handle batch conflicts without failing entire batch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            synced: { conversations: 1, tabs: 0, messages: 0 },
            conflicts: [
              {
                conversationId: "conv-123",
                localUpdatedAt: Date.now(),
                serverUpdatedAt: Date.now() + 1000,
              },
            ],
          }),
      })

      // Set up multiple conversations
      mockConversationsGet
        .mockResolvedValueOnce(TEST_CONVERSATION)
        .mockResolvedValueOnce({ ...TEST_CONVERSATION, id: "conv-456" })

      mockTabsWhere.mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      })

      // Trigger batch sync
      queueSync("conv-123", TEST_USER_ID)
      queueSync("conv-456", TEST_USER_ID)
      await vi.advanceTimersByTimeAsync(2000)

      // Should handle conflict for first conversation
      expect(mockConversationsUpdate).toHaveBeenCalledWith(
        "conv-123",
        expect.objectContaining({
          pendingSync: false,
        }),
      )
    })
  })

  describe("Exponential Backoff", () => {
    it("should set backoff retry on sync failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"))

      forceSyncNow("conv-123", TEST_USER_ID)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockConversationsUpdate).toHaveBeenCalledWith(
        "conv-123",
        expect.objectContaining({
          lastSyncError: "Network error",
          lastSyncAttemptAt: expect.any(Number),
          nextRetryAt: expect.any(Number),
        }),
      )
    })
  })

  describe("fetchConversations", () => {
    it("should fetch and store conversations from server", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            own: [
              {
                id: "conv-server-1",
                workspace: TEST_WORKSPACE,
                orgId: TEST_ORG_ID,
                creatorId: TEST_USER_ID,
                title: "Server Conversation",
                visibility: "private",
                messageCount: 10,
                lastMessageAt: Date.now(),
                firstUserMessageId: null,
                autoTitleSet: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                deletedAt: null,
                archivedAt: null,
                tabs: [
                  {
                    id: "tab-server-1",
                    conversationId: "conv-server-1",
                    name: "current",
                    position: 0,
                    messageCount: 10,
                    lastMessageAt: Date.now(),
                    createdAt: Date.now(),
                    closedAt: null,
                  },
                ],
              },
            ],
            shared: [],
          }),
      })

      mockConversationsGet.mockResolvedValue(null) // No local version

      await fetchConversations(TEST_WORKSPACE, TEST_USER_ID, TEST_ORG_ID)

      expect(mockConversationsPut).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "conv-server-1",
          pendingSync: false,
          syncedAt: expect.any(Number),
        }),
      )
      expect(mockTabsPut).toHaveBeenCalled()
    })

    it("should skip server update if local has pending changes", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            own: [{ ...TEST_CONVERSATION, tabs: [] }],
            shared: [],
          }),
      })

      // Local has pending changes
      mockConversationsGet.mockResolvedValue({ ...TEST_CONVERSATION, pendingSync: true })

      await fetchConversations(TEST_WORKSPACE, TEST_USER_ID, TEST_ORG_ID)

      // Should NOT overwrite local
      expect(mockConversationsPut).not.toHaveBeenCalled()
    })
  })

  describe("fetchTabMessages", () => {
    beforeEach(() => {
      // Mock window.location for URL construction
      global.window = {
        location: { origin: "http://localhost:3000" },
      } as unknown as Window & typeof globalThis
    })

    afterEach(() => {
      // @ts-expect-error cleanup
      delete global.window
    })

    it("should fetch and merge messages from server", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            messages: [
              {
                id: "msg-server-1",
                tabId: "tab-123",
                type: "assistant",
                content: { kind: "text", text: "Hello back" },
                version: 1,
                status: "complete",
                seq: 2,
                abortedAt: null,
                errorCode: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ],
            hasMore: false,
            nextCursor: null,
          }),
      })

      const result = await fetchTabMessages("tab-123", TEST_USER_ID)

      expect(mockMessagesPut).toHaveBeenCalled()
      expect(result.hasMore).toBe(false)
    })

    it("should not overwrite pending local messages", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            messages: [{ ...TEST_MESSAGE, id: "msg-pending" }],
            hasMore: false,
          }),
      })

      // Local message has pending changes
      mockMessagesGet.mockResolvedValue({ ...TEST_MESSAGE, id: "msg-pending", pendingSync: true })

      await fetchTabMessages("tab-123", TEST_USER_ID)

      // Should NOT call put for pending message
      expect(mockMessagesPut).not.toHaveBeenCalled()
    })
  })

  describe("Conversation Operations", () => {
    describe("shareConversation", () => {
      it("should update visibility and trigger sync", async () => {
        await shareConversation("conv-123", TEST_USER_ID)

        expect(mockConversationsUpdate).toHaveBeenCalledWith("conv-123", {
          visibility: "shared",
          updatedAt: expect.any(Number),
          pendingSync: true,
        })

        // Should trigger immediate sync
        await vi.advanceTimersByTimeAsync(0)
        expect(mockFetch).toHaveBeenCalled()
      })
    })

    describe("unshareConversation", () => {
      it("should update visibility to private", async () => {
        await unshareConversation("conv-123", TEST_USER_ID)

        expect(mockConversationsUpdate).toHaveBeenCalledWith("conv-123", {
          visibility: "private",
          updatedAt: expect.any(Number),
          pendingSync: true,
        })
      })
    })

    describe("archiveConversation", () => {
      it("should set archivedAt timestamp", async () => {
        await archiveConversation("conv-123", TEST_USER_ID)

        expect(mockConversationsUpdate).toHaveBeenCalledWith("conv-123", {
          archivedAt: expect.any(Number),
          updatedAt: expect.any(Number),
          pendingSync: true,
        })
      })
    })

    describe("deleteConversation", () => {
      it("should soft delete with deletedAt timestamp", async () => {
        await deleteConversation("conv-123", TEST_USER_ID)

        expect(mockConversationsUpdate).toHaveBeenCalledWith("conv-123", {
          deletedAt: expect.any(Number),
          updatedAt: expect.any(Number),
          pendingSync: true,
        })
      })
    })
  })

  describe("syncFromServer", () => {
    it("should return stats after syncing", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            own: [{ ...TEST_CONVERSATION, tabs: [] }],
            shared: [],
          }),
      })

      mockConversationsGet.mockResolvedValue(null)
      mockConversationsWhere.mockReturnValue({
        equals: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(3),
        }),
      })

      const result = await syncFromServer(TEST_WORKSPACE, TEST_USER_ID, TEST_ORG_ID)

      expect(result.isOffline).toBe(false)
      expect(result.conversations).toBe(3)
    })

    it("should indicate offline status", async () => {
      Object.defineProperty(navigator, "onLine", { value: false })

      const result = await syncFromServer(TEST_WORKSPACE, TEST_USER_ID, TEST_ORG_ID)

      expect(result.isOffline).toBe(true)
      expect(result.conversations).toBe(0)
    })
  })
})
