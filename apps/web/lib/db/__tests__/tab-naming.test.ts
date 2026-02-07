/**
 * Tab Naming Tests (Dexie integration)
 *
 * Verifies that new tabs get proper names like "Tab 1", "Tab 2" instead of
 * the old hardcoded "current" default. Uses fake-indexeddb for real Dexie operations.
 *
 * Regression test for: tabs always showing "current" as their name
 */

import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useDexieMessageStore } from "../dexieMessageStore"
import { getMessageDb } from "../messageDb"

const TEST_USER_ID = "test-user-tab-naming"
const TEST_ORG_ID = "test-org-456"
const TEST_WORKSPACE = "tab-naming-test.example.com"

describe("Tab naming in Dexie", () => {
  beforeEach(() => {
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
  })

  afterEach(async () => {
    const db = getMessageDb(TEST_USER_ID)
    await db.delete()
    await db.open()
  })

  it("initializeConversation should create tab with name 'Tab 1', not 'current'", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    const result = await store.initializeConversation(TEST_WORKSPACE)

    const db = getMessageDb(TEST_USER_ID)
    const tab = await db.tabs.get(result.tabId)

    expect(tab).toBeDefined()
    expect(tab!.name).toBe("Tab 1")
    expect(tab!.name).not.toBe("current")
  })

  it("ensureTabGroupWithTab should create tab with sequential name", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    // Create first tab in group
    const result1 = await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-a", "tab-1")
    const db = getMessageDb(TEST_USER_ID)
    const tab1 = await db.tabs.get("tab-1")

    expect(tab1).toBeDefined()
    expect(tab1!.name).toBe("Tab 1")
    expect(tab1!.name).not.toBe("current")

    // Create second tab in same group
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-a", "tab-2")
    const tab2 = await db.tabs.get("tab-2")

    expect(tab2).toBeDefined()
    expect(tab2!.name).toBe("Tab 2")
    expect(result1.created).toBe(true)
  })

  it("ensureTabGroupWithTab should not rename existing tab", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    // Create tab
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-b", "tab-existing")
    const db = getMessageDb(TEST_USER_ID)

    // Rename it manually
    await db.tabs.update("tab-existing", { name: "My custom name" })

    // Call ensureTabGroupWithTab again with same tabId — should NOT overwrite
    const result = await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-b", "tab-existing")

    const tab = await db.tabs.get("tab-existing")
    expect(tab!.name).toBe("My custom name")
    expect(result.created).toBe(false)
  })

  it("renameTab should update name in Dexie and mark pendingSync", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    const result = await store.initializeConversation(TEST_WORKSPACE)
    const db = getMessageDb(TEST_USER_ID)

    // Verify initial name
    const before = await db.tabs.get(result.tabId)
    expect(before!.name).toBe("Tab 1")

    // Rename
    await store.renameTab(result.tabId, "Design review")

    const after = await db.tabs.get(result.tabId)
    expect(after!.name).toBe("Design review")
    expect(after!.pendingSync).toBe(true)
  })

  it("renameTab should trim whitespace", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    const result = await store.initializeConversation(TEST_WORKSPACE)

    await store.renameTab(result.tabId, "  spaced out  ")

    const db = getMessageDb(TEST_USER_ID)
    const tab = await db.tabs.get(result.tabId)
    expect(tab!.name).toBe("spaced out")
  })

  it("renameTab should fallback to 'untitled' for empty name", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    const result = await store.initializeConversation(TEST_WORKSPACE)

    await store.renameTab(result.tabId, "   ")

    const db = getMessageDb(TEST_USER_ID)
    const tab = await db.tabs.get(result.tabId)
    expect(tab!.name).toBe("untitled")
  })

  it("renameTab should be a no-op without a session", async () => {
    const store = useDexieMessageStore.getState()
    // No session set — renameTab should silently return

    // Should not throw
    await store.renameTab("nonexistent-tab", "New name")
  })

  it("renameTab should be a no-op for nonexistent tab", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    // Should not throw
    await store.renameTab("tab-that-does-not-exist", "New name")
  })

  it("addTab should use provided name, not 'current'", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    // initializeConversation sets currentTabGroupId which addTab requires
    await store.initializeConversation(TEST_WORKSPACE)

    const newTabId = await store.addTab("Bug triage")

    const db = getMessageDb(TEST_USER_ID)
    const tab = await db.tabs.get(newTabId)
    expect(tab).toBeDefined()
    expect(tab!.name).toBe("Bug triage")
    expect(tab!.name).not.toBe("current")
  })

  it("addTab default name should not be 'current'", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    await store.initializeConversation(TEST_WORKSPACE)
    const newTabId = await store.addTab()

    const db = getMessageDb(TEST_USER_ID)
    const tab = await db.tabs.get(newTabId)
    expect(tab!.name).not.toBe("current")
    expect(tab!.name).toBe("new tab") // the default parameter
  })

  it("sequential tab numbering should survive closed tabs in the group", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    // Create 3 tabs in same group
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-c", "tab-c1")
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-c", "tab-c2")
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-c", "tab-c3")

    const db = getMessageDb(TEST_USER_ID)

    // Close the middle tab
    await db.tabs.update("tab-c2", { closedAt: Date.now() })

    // Add a 4th tab — the closed tab still occupies a position slot,
    // so the new tab should be Tab 4 (existingTabs.length + 1 = 4)
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-c", "tab-c4")
    const tab4 = await db.tabs.get("tab-c4")
    expect(tab4!.name).toBe("Tab 4")
  })

  it("rename should persist across re-reads from Dexie", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    const result = await store.initializeConversation(TEST_WORKSPACE)

    // Rename the tab
    await store.renameTab(result.tabId, "Sprint planning")

    // Re-read fresh from Dexie (simulates page reload reading from IndexedDB)
    const db = getMessageDb(TEST_USER_ID)
    const freshTab = await db.tabs.get(result.tabId)
    expect(freshTab!.name).toBe("Sprint planning")
    expect(freshTab!.pendingSync).toBe(true)
  })

  it("tabs in different conversations should number independently", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    // Two separate conversations each get "Tab 1"
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "conv-x", "tab-x1")
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "conv-y", "tab-y1")

    const db = getMessageDb(TEST_USER_ID)
    const tabX = await db.tabs.get("tab-x1")
    const tabY = await db.tabs.get("tab-y1")

    expect(tabX!.name).toBe("Tab 1")
    expect(tabY!.name).toBe("Tab 1")
  })

  it("renameTab should not affect other tabs in the same group", async () => {
    const store = useDexieMessageStore.getState()
    store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })

    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-d", "tab-d1")
    await store.ensureTabGroupWithTab(TEST_WORKSPACE, "group-d", "tab-d2")

    await store.renameTab("tab-d1", "Renamed tab")

    const db = getMessageDb(TEST_USER_ID)
    const tab1 = await db.tabs.get("tab-d1")
    const tab2 = await db.tabs.get("tab-d2")

    expect(tab1!.name).toBe("Renamed tab")
    expect(tab2!.name).toBe("Tab 2") // untouched
  })
})
