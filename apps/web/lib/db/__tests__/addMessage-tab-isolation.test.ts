/**
 * Dexie Store addMessage Tab Isolation Tests
 *
 * Tests the ACTUAL dexieMessageStore.addMessage() against a real IndexedDB (fake-indexeddb).
 * This is the integration test that proves messages route to the correct tab
 * even when the user has switched to a different tab mid-stream.
 *
 * The mock-based tests in tab-isolation.test.ts test the routing LOGIC.
 * This file tests the REAL Dexie store implementation.
 *
 * TERMINOLOGY NOTE:
 * - In Dexie schema: DbTab.conversationId = tabGroupId (sidebar grouping)
 * - In Zustand Tab store: Tab.id IS the conversation key, Tab.tabGroupId is sidebar grouping
 * - The `tabId` parameter in addMessage() is the target tab (Tab.id = conversation key)
 */

import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useTabDataStore } from "@/lib/stores/tabDataStore"
import { useDexieMessageStore } from "../dexieMessageStore"
import { getMessageDb } from "../messageDb"

const TEST_USER_ID = "test-user-123"
const TEST_ORG_ID = "test-org-456"
const TEST_WORKSPACE = "test.example.com"

/**
 * Helper: Set up the store with a session and two tabs in separate tab groups.
 * Returns the Dexie conversationIds (= tabGroupIds in the new model) and tabIds for both tabs.
 *
 * Note: In Dexie, conversationId refers to the sidebar grouping (tabGroupId).
 * The tabId IS the Claude conversation key (single source of truth).
 */
async function setupTwoTabs() {
  const store = useDexieMessageStore.getState()

  // Set session
  store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

  // Create first conversation + tab (Tab A)
  const resultA = await store.ensureTabGroupWithTab(TEST_WORKSPACE, "tabgroup-A", "tab-A")

  // Create second conversation + tab (Tab B)
  const resultB = await store.ensureTabGroupWithTab(TEST_WORKSPACE, "tabgroup-B", "tab-B")

  return {
    tabA: { conversationId: resultA.conversationId, tabId: "tab-A" },
    tabB: { conversationId: resultB.conversationId, tabId: "tab-B" },
  }
}

describe("addMessage tab isolation (Dexie integration)", () => {
  beforeEach(() => {
    // Reset Zustand store between tests
    useDexieMessageStore.setState({
      session: null,
      currentTabGroupId: null,
      currentTabId: null,
      currentWorkspace: null,
      isLoading: false,
      isSyncing: false,
      activeStreamByTab: {},
      streamingBuffers: {},
    })
    useTabDataStore.setState({ tabsByWorkspace: {} })
  })

  afterEach(async () => {
    // Clean up IndexedDB
    const db = getMessageDb(TEST_USER_ID)
    await db.delete()
    await db.open()
    useTabDataStore.setState({ tabsByWorkspace: {} })
  })

  it("should store message in the target tab, not the current tab", async () => {
    const { tabB } = await setupTwoTabs()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    // User is currently looking at Tab B (this is the "current" tab)
    store.switchTab("tab-B")
    store.switchConversation(tabB.conversationId, "tab-B")

    // But a stream for Tab A sends a message with targetTabId="tab-A"
    await store.addMessage(
      {
        id: "msg-1",
        type: "sdk_message",
        content: { type: "text", text: "This belongs to Tab A" },
        timestamp: new Date(),
      },
      "tab-A",
    )

    // Verify: message is in Tab A
    const tabAMessages = await db.messages.where("tabId").equals("tab-A").toArray()
    expect(tabAMessages).toHaveLength(1)
    expect(tabAMessages[0].tabId).toBe("tab-A")

    // Verify: message is NOT in Tab B
    const tabBMessages = await db.messages.where("tabId").equals("tab-B").toArray()
    expect(tabBMessages).toHaveLength(0)
  })

  it("should store message in current tab when targetTabId matches currentTabId", async () => {
    const { tabA } = await setupTwoTabs()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    // User is on Tab A
    store.switchTab("tab-A")
    store.switchConversation(tabA.conversationId, "tab-A")

    // Stream for Tab A sends message (targetTabId matches currentTabId)
    await store.addMessage(
      {
        id: "msg-1",
        type: "user",
        content: "Hello from Tab A",
        timestamp: new Date(),
      },
      "tab-A",
    )

    const tabAMessages = await db.messages.where("tabId").equals("tab-A").toArray()
    expect(tabAMessages).toHaveLength(1)
  })

  it("should update the correct conversation metadata when targeting a non-current tab", async () => {
    const { tabA, tabB } = await setupTwoTabs()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    // User is on Tab B
    store.switchTab("tab-B")
    store.switchConversation(tabB.conversationId, "tab-B")

    // Stream for Tab A sends a user message (should set title on conversation A, not B)
    await store.addMessage(
      {
        id: "msg-1",
        type: "user",
        content: "Build me a landing page",
        timestamp: new Date(),
      },
      "tab-A",
    )

    // Conversation A should have updated metadata
    const convoA = await db.conversations.get(tabA.conversationId)
    expect(convoA?.messageCount).toBe(1)
    expect(convoA?.lastMessageAt).toBeGreaterThan(0)

    // Conversation B should be untouched
    const convoB = await db.conversations.get(tabB.conversationId)
    expect(convoB?.messageCount ?? 0).toBe(0)
  })

  it("should handle multiple messages to different tabs interleaved", async () => {
    const { tabB } = await setupTwoTabs()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    // User is on Tab B but streams are active for both tabs
    store.switchTab("tab-B")
    store.switchConversation(tabB.conversationId, "tab-B")

    // Interleaved messages from two streams
    await store.addMessage(
      { id: "msg-A1", type: "sdk_message", content: { type: "text", text: "A first" }, timestamp: new Date() },
      "tab-A",
    )
    await store.addMessage(
      { id: "msg-B1", type: "sdk_message", content: { type: "text", text: "B first" }, timestamp: new Date() },
      "tab-B",
    )
    await store.addMessage(
      { id: "msg-A2", type: "sdk_message", content: { type: "text", text: "A second" }, timestamp: new Date() },
      "tab-A",
    )

    const tabAMessages = await db.messages.where("tabId").equals("tab-A").toArray()
    const tabBMessages = await db.messages.where("tabId").equals("tab-B").toArray()

    expect(tabAMessages).toHaveLength(2)
    expect(tabBMessages).toHaveLength(1)

    // Verify ordering (seq should be correct per tab)
    expect(tabAMessages[0].seq).toBeLessThan(tabAMessages[1].seq)
  })

  it("should update the correct tab metadata", async () => {
    const { tabB } = await setupTwoTabs()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    // User is on Tab B
    store.switchTab("tab-B")
    store.switchConversation(tabB.conversationId, "tab-B")

    // Add message to Tab A
    await store.addMessage(
      { id: "msg-1", type: "sdk_message", content: { type: "text", text: "For A" }, timestamp: new Date() },
      "tab-A",
    )

    // Tab A's metadata should be updated
    const tabARecord = await db.tabs.get("tab-A")
    expect(tabARecord?.messageCount).toBe(1)
    expect(tabARecord?.lastMessageAt).toBeGreaterThan(0)

    // Tab B's metadata should be untouched
    const tabBRecord = await db.tabs.get("tab-B")
    expect(tabBRecord?.messageCount ?? 0).toBe(0)
  })

  it("should recover target tab mapping from tab store when Dexie mapping is missing", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    const tabId = "tab-race"
    const tabGroupId = "tabgroup-race"
    const now = Date.now()

    useTabDataStore.setState({
      tabsByWorkspace: {
        [TEST_WORKSPACE]: [
          {
            id: tabId,
            tabGroupId,
            name: "Tab 1",
            tabNumber: 1,
            createdAt: now,
          },
        ],
      },
    })

    await store.addMessage(
      {
        id: "msg-race-1",
        type: "user",
        content: "First message should not be dropped",
        timestamp: new Date(),
      },
      tabId,
    )

    const db = getMessageDb(TEST_USER_ID)
    const storedTab = await db.tabs.get(tabId)
    const storedConversation = await db.conversations.get(tabGroupId)
    const messages = await db.messages.where("tabId").equals(tabId).toArray()

    expect(storedTab?.conversationId).toBe(tabGroupId)
    expect(storedConversation?.workspace).toBe(TEST_WORKSPACE)
    expect(messages).toHaveLength(1)
    expect(messages[0].id).toBe("msg-race-1")
  })
})
