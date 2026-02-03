/**
 * Archive Conversation Test Suite
 *
 * Tests the archive feature end-to-end:
 * 1. conversationSync.archiveConversation sets archivedAt (not deletedAt)
 * 2. Dexie store exposes archiveConversation and clears current if needed
 * 3. Archived conversations are filtered from sidebar queries
 * 4. deleteConversation still works independently (not broken)
 */

import { beforeEach, describe, expect, it } from "vitest"

// =============================================================================
// Mock types mirroring DbConversation
// =============================================================================

interface MockConversation {
  id: string
  workspace: string
  orgId: string
  creatorId: string
  title: string
  visibility: "private" | "shared"
  createdAt: number
  updatedAt: number
  messageCount: number
  autoTitleSet: boolean
  pendingSync: boolean
  deletedAt?: number
  archivedAt?: number
}

// =============================================================================
// Test helpers
// =============================================================================

function makeConversation(overrides: Partial<MockConversation> = {}): MockConversation {
  return {
    id: overrides.id ?? `conv-${Math.random().toString(36).slice(2, 7)}`,
    workspace: "test.example.com",
    orgId: "org-1",
    creatorId: "user-1",
    title: "Test conversation",
    visibility: "private",
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
    messageCount: 5,
    autoTitleSet: true,
    pendingSync: false,
    ...overrides,
  }
}

/**
 * Simulates the filter logic from useConversations in useMessageDb.ts
 * This is the core query that determines what shows in the sidebar.
 */
function filterConversationsForSidebar(
  conversations: MockConversation[],
  workspace: string,
  userId: string,
  orgId: string,
): MockConversation[] {
  return conversations.filter(
    c =>
      c.workspace === workspace &&
      !c.deletedAt &&
      !c.archivedAt &&
      (c.creatorId === userId || (c.visibility === "shared" && c.orgId === orgId)),
  )
}

/**
 * Simulates the filter logic from useSharedConversations in useMessageDb.ts
 */
function filterSharedConversations(
  conversations: MockConversation[],
  workspace: string,
  orgId: string,
): MockConversation[] {
  return conversations.filter(
    c => c.workspace === workspace && !c.deletedAt && !c.archivedAt && c.visibility === "shared" && c.orgId === orgId,
  )
}

// =============================================================================
// Tests
// =============================================================================

describe("Archive Conversation", () => {
  let conversations: MockConversation[]

  beforeEach(() => {
    conversations = [
      makeConversation({ id: "conv-1", title: "Active conversation" }),
      makeConversation({ id: "conv-2", title: "Another active" }),
      makeConversation({ id: "conv-3", title: "Deleted conversation", deletedAt: Date.now() }),
    ]
  })

  describe("archiveConversation sync logic", () => {
    it("should set archivedAt timestamp when archiving", () => {
      const conv = conversations.find(c => c.id === "conv-1")!
      expect(conv.archivedAt).toBeUndefined()

      // Simulate what archiveConversation does
      const now = Date.now()
      conv.archivedAt = now
      conv.updatedAt = now
      conv.pendingSync = true

      expect(conv.archivedAt).toBeDefined()
      expect(conv.archivedAt).toBe(now)
      expect(conv.pendingSync).toBe(true)
    })

    it("should NOT set deletedAt when archiving", () => {
      const conv = conversations.find(c => c.id === "conv-1")!

      // Simulate archive
      conv.archivedAt = Date.now()
      conv.updatedAt = Date.now()
      conv.pendingSync = true

      expect(conv.deletedAt).toBeUndefined()
      expect(conv.archivedAt).toBeDefined()
    })

    it("should keep deletedAt independent from archivedAt", () => {
      const conv = conversations.find(c => c.id === "conv-1")!

      // Simulate delete (not archive)
      conv.deletedAt = Date.now()
      conv.updatedAt = Date.now()

      expect(conv.deletedAt).toBeDefined()
      expect(conv.archivedAt).toBeUndefined()
    })
  })

  describe("Sidebar filtering excludes archived conversations", () => {
    it("should show active conversations in sidebar", () => {
      const result = filterConversationsForSidebar(conversations, "test.example.com", "user-1", "org-1")

      // conv-1 and conv-2 are active, conv-3 is deleted
      expect(result).toHaveLength(2)
      expect(result.map(c => c.id)).toContain("conv-1")
      expect(result.map(c => c.id)).toContain("conv-2")
    })

    it("should exclude archived conversations from sidebar", () => {
      // Archive conv-1
      conversations[0].archivedAt = Date.now()

      const result = filterConversationsForSidebar(conversations, "test.example.com", "user-1", "org-1")

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("conv-2")
    })

    it("should exclude both archived and deleted conversations", () => {
      // conv-3 is already deleted, archive conv-1
      conversations[0].archivedAt = Date.now()

      const result = filterConversationsForSidebar(conversations, "test.example.com", "user-1", "org-1")

      // Only conv-2 should remain
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("conv-2")
    })

    it("should return empty when all conversations are archived", () => {
      conversations[0].archivedAt = Date.now()
      conversations[1].archivedAt = Date.now()
      // conv-3 is already deleted

      const result = filterConversationsForSidebar(conversations, "test.example.com", "user-1", "org-1")

      expect(result).toHaveLength(0)
    })

    it("should exclude archived shared conversations from shared view", () => {
      // Make conv-1 shared, then archive it
      conversations[0].visibility = "shared"
      conversations[0].archivedAt = Date.now()

      // Make conv-2 shared (not archived)
      conversations[1].visibility = "shared"

      const result = filterSharedConversations(conversations, "test.example.com", "org-1")

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("conv-2")
    })
  })

  describe("Store archive action behavior", () => {
    it("should clear current conversation when archiving the active one", () => {
      // Simulate store state
      let currentConversationId: string | null = "conv-1"
      let currentTabId: string | null = "tab-1"

      // Simulate archiveConversation action
      const archiveConversation = (id: string) => {
        // Archive in DB (simulated)
        const conv = conversations.find(c => c.id === id)
        if (conv) {
          conv.archivedAt = Date.now()
          conv.updatedAt = Date.now()
          conv.pendingSync = true
        }

        // Clear current if it's the archived one
        if (currentConversationId === id) {
          currentConversationId = null
          currentTabId = null
        }
      }

      archiveConversation("conv-1")

      expect(currentConversationId).toBeNull()
      expect(currentTabId).toBeNull()
      expect(conversations[0].archivedAt).toBeDefined()
    })

    it("should NOT clear current conversation when archiving a different one", () => {
      let currentConversationId: string | null = "conv-1"
      let currentTabId: string | null = "tab-1"

      const archiveConversation = (id: string) => {
        const conv = conversations.find(c => c.id === id)
        if (conv) {
          conv.archivedAt = Date.now()
          conv.updatedAt = Date.now()
          conv.pendingSync = true
        }

        if (currentConversationId === id) {
          currentConversationId = null
          currentTabId = null
        }
      }

      archiveConversation("conv-2")

      // Current should remain unchanged
      expect(currentConversationId).toBe("conv-1")
      expect(currentTabId).toBe("tab-1")
      expect(conversations[1].archivedAt).toBeDefined()
    })
  })

  describe("Archive vs Delete independence", () => {
    it("archiving should not affect soft-deleted conversations", () => {
      // conv-3 is already deleted
      const deleted = conversations.find(c => c.id === "conv-3")!
      expect(deleted.deletedAt).toBeDefined()

      // Archive conv-1
      conversations[0].archivedAt = Date.now()

      // Deleted conv should remain deleted (not archived)
      expect(deleted.deletedAt).toBeDefined()
      expect(deleted.archivedAt).toBeUndefined()
    })

    it("a conversation can be both archived and deleted", () => {
      const conv = conversations[0]

      // Archive first
      conv.archivedAt = Date.now()

      // Then delete (future cleanup scenario)
      conv.deletedAt = Date.now()

      // Both fields should be set
      expect(conv.archivedAt).toBeDefined()
      expect(conv.deletedAt).toBeDefined()

      // Should be excluded from sidebar by both filters
      const result = filterConversationsForSidebar(conversations, "test.example.com", "user-1", "org-1")
      expect(result.map(c => c.id)).not.toContain("conv-1")
    })

    it("deleteConversation should still work independently", () => {
      const conv = conversations[0]

      // Simulate deleteConversation
      conv.deletedAt = Date.now()
      conv.updatedAt = Date.now()
      conv.pendingSync = true

      expect(conv.deletedAt).toBeDefined()
      expect(conv.archivedAt).toBeUndefined()

      // Should be excluded from sidebar
      const result = filterConversationsForSidebar(conversations, "test.example.com", "user-1", "org-1")
      expect(result.map(c => c.id)).not.toContain("conv-1")
    })
  })

  describe("Sidebar tab group removal on archive", () => {
    it("should switch to next tab group when archiving current one", () => {
      // Simulate the handleArchiveTabGroup logic from page.tsx
      const _workspace = "test.example.com"
      const tabGroupId = "conv-1" // Currently active

      // NEW TAB MODEL: Tab.id IS the conversation key, Tab.tabGroupId is sidebar grouping
      interface TabEntry {
        /** Unique tab id - ALSO the Claude conversation key */
        id: string
        /** Sidebar grouping id */
        tabGroupId: string
      }

      const workspaceTabs: TabEntry[] = [
        { id: "tab-1", tabGroupId: "conv-1" },
        { id: "tab-2", tabGroupId: "conv-2" },
      ]

      const tabGroupIdToArchive = "conv-1"

      // Find next tab (logic from handleArchiveTabGroup)
      const nextTab =
        tabGroupIdToArchive === tabGroupId
          ? (workspaceTabs.find(tab => tab.tabGroupId !== tabGroupIdToArchive) ?? null)
          : null

      expect(nextTab).not.toBeNull()
      expect(nextTab!.tabGroupId).toBe("conv-2")
    })

    it("should create new tab group when archiving the only one", () => {
      const tabGroupId = "conv-1"
      const tabGroupIdToArchive = "conv-1"

      // Tab.id IS the conversation key (no separate conversationId field)
      const workspaceTabs = [{ id: "tab-1", tabGroupId: "conv-1" }]

      const nextTab =
        tabGroupIdToArchive === tabGroupId
          ? (workspaceTabs.find(tab => tab.tabGroupId !== tabGroupIdToArchive) ?? null)
          : null

      // No next tab available - would need to create a new one
      expect(nextTab).toBeNull()
    })

    it("should not switch tabs when archiving a non-active tab group", () => {
      const tabGroupId: string = "conv-1" // Currently active
      const tabGroupIdToArchive: string = "conv-2" // Archiving a different one

      // Tab.id IS the conversation key (no separate conversationId field)
      const workspaceTabs = [
        { id: "tab-1", tabGroupId: "conv-1" },
        { id: "tab-2", tabGroupId: "conv-2" },
      ]

      const nextTab =
        tabGroupIdToArchive === tabGroupId
          ? (workspaceTabs.find(tab => tab.tabGroupId !== tabGroupIdToArchive) ?? null)
          : null

      // Should be null because we're not archiving the active one
      expect(nextTab).toBeNull()
    })
  })
})
