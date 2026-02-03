import { beforeEach, describe, expect, it, vi } from "vitest"

// In-memory storage for mocked database
const mockSessions = new Map<string, { sdk_session_id: string }>()

// Helper to create session key for storage
function makeDbKey(userId: string, domainId: string, tabId: string) {
  return `${userId}::${domainId}::${tabId}`
}

// Mock Supabase clients before importing sessionStore
vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { domain_id: "test-domain-id" }, error: null })),
        })),
      })),
    })),
  })),
}))

vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "sessions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, userId: string) => ({
              eq: vi.fn((_col: string, domainId: string) => ({
                eq: vi.fn((_col: string, tabId: string) => ({
                  single: vi.fn(async () => {
                    const key = makeDbKey(userId, domainId, tabId)
                    const data = mockSessions.get(key)
                    return { data: data || null, error: null }
                  }),
                })),
              })),
            })),
          })),
          upsert: vi.fn(
            async (data: { user_id: string; domain_id: string; tab_id: string; sdk_session_id: string }) => {
              const key = makeDbKey(data.user_id, data.domain_id, data.tab_id)
              mockSessions.set(key, { sdk_session_id: data.sdk_session_id })
              return { data: null, error: null }
            },
          ),
          delete: vi.fn(() => ({
            eq: vi.fn((_col: string, userId: string) => ({
              eq: vi.fn((_col: string, domainId: string) => ({
                eq: vi.fn(async (_col: string, tabId: string) => {
                  const key = makeDbKey(userId, domainId, tabId)
                  mockSessions.delete(key)
                  return { data: null, error: null }
                }),
              })),
            })),
          })),
        }
      }
      return {}
    }),
  })),
}))

import { sessionStore, tabKey, tryLockConversation, unlockConversation } from "@/features/auth/lib/sessionStore"

// Use real workspace and user from migrated database (demo.goalive.nl)
const TEST_WORKSPACE = "demo.goalive.nl"
const TEST_USER_ID = "ace1261c-2b9a-4845-8d41-4f6ecab8cb37" // demo.goalive.nl user

describe("Session Store - Tab Locking", () => {
  beforeEach(async () => {
    // Clear mock database
    mockSessions.clear()

    await sessionStore.delete(
      tabKey({ userId: TEST_USER_ID, workspace: TEST_WORKSPACE, tabGroupId: "test-tabgroup", tabId: "test-tab-1" }),
    )
    await sessionStore.delete(
      tabKey({ userId: TEST_USER_ID, workspace: TEST_WORKSPACE, tabGroupId: "test-tabgroup", tabId: "test-tab-2" }),
    )
  })

  describe("tabKey", () => {
    it("should create consistent keys from same parameters", () => {
      const key1 = tabKey({ userId: "user1", workspace: "workspace1", tabGroupId: "test-tabgroup", tabId: "tab1" })
      const key2 = tabKey({ userId: "user1", workspace: "workspace1", tabGroupId: "test-tabgroup", tabId: "tab1" })
      expect(key1).toBe(key2)
    })

    it("should create different keys for different tabs", () => {
      const key1 = tabKey({ userId: "user1", workspace: "workspace1", tabGroupId: "test-tabgroup", tabId: "tab1" })
      const key2 = tabKey({ userId: "user1", workspace: "workspace1", tabGroupId: "test-tabgroup", tabId: "tab2" })
      expect(key1).not.toBe(key2)
    })

    it("should include tabId in the key", () => {
      const key = tabKey({ userId: "user1", workspace: "workspace1", tabGroupId: "test-tabgroup", tabId: "tab1" })
      expect(key).toContain("tab1")
    })

    it("should use default workspace when not provided", () => {
      const key = tabKey({ userId: "user1", tabGroupId: "test-tabgroup", tabId: "tab1" })
      expect(key).toContain("default")
    })

    it("should allow different tabs to be locked independently", () => {
      const key1 = tabKey({ userId: "user1", workspace: "workspace1", tabGroupId: "test-tabgroup", tabId: "tab1" })
      const key2 = tabKey({ userId: "user1", workspace: "workspace1", tabGroupId: "test-tabgroup", tabId: "tab2" })

      const lock1 = tryLockConversation(key1)
      const lock2 = tryLockConversation(key2)

      expect(lock1).toBe(true)
      expect(lock2).toBe(true) // Different tabs should NOT block each other

      unlockConversation(key1)
      unlockConversation(key2)
    })

    it("should block same tab from concurrent requests", () => {
      const key = tabKey({ userId: "user1", workspace: "workspace1", tabGroupId: "test-tabgroup", tabId: "same-tab" })

      const first = tryLockConversation(key)
      const second = tryLockConversation(key)

      expect(first).toBe(true)
      expect(second).toBe(false) // Same tab SHOULD be blocked

      unlockConversation(key)
    })
  })

  describe("Tab Locking", () => {
    it("should acquire lock for new tab", () => {
      const key = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-lock-1",
      })
      const acquired = tryLockConversation(key)
      expect(acquired).toBe(true)
      unlockConversation(key)
    })

    it("should prevent concurrent locks", () => {
      const key = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-lock-2",
      })

      const first = tryLockConversation(key)
      const second = tryLockConversation(key)

      expect(first).toBe(true)
      expect(second).toBe(false)

      unlockConversation(key)
    })

    it("should release lock and allow reacquisition", () => {
      const key = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-lock-3",
      })

      tryLockConversation(key)
      unlockConversation(key)

      const reacquired = tryLockConversation(key)
      expect(reacquired).toBe(true)

      unlockConversation(key)
    })

    it("should handle multiple independent tab locks", () => {
      const key1 = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-multi-1",
      })
      const key2 = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-multi-2",
      })

      const lock1 = tryLockConversation(key1)
      const lock2 = tryLockConversation(key2)

      expect(lock1).toBe(true)
      expect(lock2).toBe(true)

      unlockConversation(key1)
      unlockConversation(key2)
    })

    it("should allow same tab for different users", () => {
      const key1 = tabKey({
        userId: "user1",
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "shared-tab",
      })
      const key2 = tabKey({
        userId: "user2",
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "shared-tab",
      })

      const lock1 = tryLockConversation(key1)
      const lock2 = tryLockConversation(key2)

      expect(lock1).toBe(true)
      expect(lock2).toBe(true)

      unlockConversation(key1)
      unlockConversation(key2)
    })

    it("should be idempotent when unlocking", () => {
      const key = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-idempotent",
      })

      tryLockConversation(key)
      unlockConversation(key)
      unlockConversation(key) // Second unlock should not throw

      const reacquired = tryLockConversation(key)
      expect(reacquired).toBe(true)

      unlockConversation(key)
    })

    it("should handle rapid lock/unlock cycles", () => {
      const key = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-rapid",
      })

      for (let i = 0; i < 10; i++) {
        const acquired = tryLockConversation(key)
        expect(acquired).toBe(true)
        unlockConversation(key)
      }
    })
  })

  describe("parseKey validation (via sessionStore)", () => {
    it("should reject keys with wrong segment count (old 3-segment format)", async () => {
      // Simulate a stale key from the old format: userId::workspace::tabId
      const malformedKey = "user1::workspace1::tab1" as ReturnType<typeof tabKey>
      await expect(sessionStore.get(malformedKey)).rejects.toThrow("expected 4 segments")
    })

    it("should reject keys with too many segments", async () => {
      const malformedKey = "a::b::c::d::e" as ReturnType<typeof tabKey>
      await expect(sessionStore.get(malformedKey)).rejects.toThrow("expected 4 segments")
    })

    it("should reject empty keys", async () => {
      const malformedKey = "" as ReturnType<typeof tabKey>
      await expect(sessionStore.get(malformedKey)).rejects.toThrow("expected 4 segments")
    })

    it("should accept valid 4-segment keys", async () => {
      const validKey = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-valid",
      })
      // Should not throw — null result is fine
      const result = await sessionStore.get(validKey)
      expect(result).toBeNull()
    })
  })

  describe("sessionStore", () => {
    beforeEach(async () => {
      // Clear memory store before each test
      await sessionStore.delete(
        tabKey({ userId: TEST_USER_ID, workspace: TEST_WORKSPACE, tabGroupId: "test-tabgroup", tabId: "test-tab-1" }),
      )
      await sessionStore.delete(
        tabKey({ userId: TEST_USER_ID, workspace: TEST_WORKSPACE, tabGroupId: "test-tabgroup", tabId: "test-tab-2" }),
      )
    })

    it("should store and retrieve session IDs", async () => {
      const key = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-store-1",
      })
      const sessionId = "session-abc-123"

      await sessionStore.set(key, sessionId)
      const retrieved = await sessionStore.get(key)

      expect(retrieved).toBe(sessionId)
    })

    it("should return null for non-existent keys", async () => {
      const key = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "non-existent",
      })
      const retrieved = await sessionStore.get(key)
      expect(retrieved).toBeNull()
    })

    it("should delete stored sessions", async () => {
      const key = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-delete",
      })
      const sessionId = "session-abc-123"

      await sessionStore.set(key, sessionId)
      await sessionStore.delete(key)

      const retrieved = await sessionStore.get(key)
      expect(retrieved).toBeNull()
    })

    it("should overwrite existing sessions", async () => {
      const key = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-overwrite",
      })

      await sessionStore.set(key, "session-1")
      await sessionStore.set(key, "session-2")

      const retrieved = await sessionStore.get(key)
      expect(retrieved).toBe("session-2")
    })

    it("should handle multiple independent sessions", async () => {
      const key1 = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-multi-a",
      })
      const key2 = tabKey({
        userId: TEST_USER_ID,
        workspace: TEST_WORKSPACE,
        tabGroupId: "test-tabgroup",
        tabId: "test-tab-multi-b",
      })

      await sessionStore.set(key1, "session-1")
      await sessionStore.set(key2, "session-2")

      const retrieved1 = await sessionStore.get(key1)
      const retrieved2 = await sessionStore.get(key2)

      expect(retrieved1).toBe("session-1")
      expect(retrieved2).toBe("session-2")
    })
  })
})
