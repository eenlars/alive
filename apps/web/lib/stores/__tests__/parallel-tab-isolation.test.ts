/**
 * Parallel Tab Isolation Test Suite
 *
 * Tests the core architecture that enables multiple browser tabs to work
 * concurrently without 409 CONVERSATION_BUSY errors.
 *
 * THE PROBLEM (before this fix):
 * - activeTabByWorkspace was stored in localStorage (shared across browser tabs)
 * - When Tab A and Tab B opened the same workspace, they shared the same activeTab
 * - Both tabs sent the same tabId to the server → 409 lock conflict
 *
 * THE FIX:
 * - Split tabStore into tabDataStore (localStorage) and tabViewStore (sessionStorage)
 * - Tab history (tabsByWorkspace) is shared via localStorage
 * - Active selection (activeTabByWorkspace) is isolated via sessionStorage
 * - Each browser tab gets its own active tab selection
 *
 * WHAT THESE TESTS VERIFY:
 * 1. tabDataStore is shared (localStorage behavior)
 * 2. tabViewStore is isolated (sessionStorage behavior)
 * 3. New browser tabs create their own session, not share existing
 * 4. Actions correctly coordinate between both stores
 * 5. Backwards compatibility layer works for existing code
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useTabDataStore } from "../tabDataStore"
import { useTabActions, useTabStore } from "../tabStore"
import { useTabViewStore } from "../tabViewStore"

// ============================================================================
// Test Helpers
// ============================================================================

/** Reset both stores to clean state */
function resetStores() {
  useTabDataStore.setState({ tabsByWorkspace: {} })
  useTabViewStore.setState({
    activeTabByWorkspace: {},
    tabsExpandedByWorkspace: {},
  })
}

/** Simulate a fresh browser tab by resetting sessionStorage state only */
function simulateNewBrowserTab() {
  // In reality, sessionStorage is per-browser-tab
  // Resetting tabViewStore simulates opening a new browser tab
  useTabViewStore.setState({
    activeTabByWorkspace: {},
    tabsExpandedByWorkspace: {},
  })
}

/** Get actions for testing (stable singleton) */
function getActions() {
  return useTabActions()
}

// ============================================================================
// Tests
// ============================================================================

describe("Parallel Tab Isolation Architecture", () => {
  const workspace = "example.com"

  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    resetStores()
  })

  describe("Store Separation", () => {
    it("tabDataStore holds shared tab history", () => {
      const actions = getActions()

      // Create a tab
      const { tabGroupId, tabId } = actions.createTabGroupWithTab(workspace)

      // Verify data is in tabDataStore
      const dataState = useTabDataStore.getState()
      const tabs = dataState.tabsByWorkspace[workspace] ?? []

      expect(tabs).toHaveLength(1)
      expect(tabs[0].id).toBe(tabId)
      expect(tabs[0].tabGroupId).toBe(tabGroupId)
    })

    it("tabViewStore holds per-browser-tab active selection", () => {
      const actions = getActions()

      // Create a tab (this also sets it as active)
      const { tabId } = actions.createTabGroupWithTab(workspace)

      // Verify active selection is in tabViewStore
      const viewState = useTabViewStore.getState()
      expect(viewState.activeTabByWorkspace[workspace]).toBe(tabId)

      // Verify it's NOT in tabDataStore (separation of concerns)
      const dataState = useTabDataStore.getState()
      expect(dataState).not.toHaveProperty("activeTabByWorkspace")
    })

    it("tab history is independent of active selection", () => {
      const actions = getActions()

      // Create multiple tabs
      const tab1 = actions.createTabGroupWithTab(workspace)
      actions.createTabGroupWithTab(workspace) // Create second tab (we don't need the result)

      // Change active selection
      actions.setActiveTab(workspace, tab1.tabId)

      // Verify both tabs exist in data store regardless of which is active
      const dataState = useTabDataStore.getState()
      const tabs = dataState.tabsByWorkspace[workspace] ?? []
      expect(tabs).toHaveLength(2)

      // Verify active selection is separate
      const viewState = useTabViewStore.getState()
      expect(viewState.activeTabByWorkspace[workspace]).toBe(tab1.tabId)
    })
  })

  describe("Browser Tab Isolation (the core fix)", () => {
    it("simulating a new browser tab starts with no active selection", () => {
      const actions = getActions()

      // Browser Tab A creates a tab and sets it active
      const { tabId: tabA } = actions.createTabGroupWithTab(workspace)
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBe(tabA)

      // Simulate opening a new browser tab (sessionStorage is fresh)
      simulateNewBrowserTab()

      // New browser tab has NO active selection
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBeUndefined()

      // But tab history is still visible (localStorage is shared)
      const dataState = useTabDataStore.getState()
      expect(dataState.tabsByWorkspace[workspace]).toHaveLength(1)
    })

    it("two browser tabs can have different active tabs for same workspace", () => {
      const actions = getActions()

      // Browser Tab A creates tabs and selects tab1
      const { tabId: tab1 } = actions.createTabGroupWithTab(workspace)
      const { tabId: tab2 } = actions.createTabGroupWithTab(workspace)
      actions.setActiveTab(workspace, tab1)

      // Capture Browser Tab A's active selection
      const browserTabAActive = useTabViewStore.getState().activeTabByWorkspace[workspace]
      expect(browserTabAActive).toBe(tab1)

      // Simulate Browser Tab B (fresh sessionStorage)
      simulateNewBrowserTab()

      // Browser Tab B selects tab2
      actions.setActiveTab(workspace, tab2)

      // Browser Tab B has different active selection
      const browserTabBActive = useTabViewStore.getState().activeTabByWorkspace[workspace]
      expect(browserTabBActive).toBe(tab2)
      expect(browserTabBActive).not.toBe(browserTabAActive)
    })

    it("creating tab in new browser tab creates unique tabId (not shared)", () => {
      const actions = getActions()

      // Browser Tab A creates a tab
      const { tabId: tabIdA } = actions.createTabGroupWithTab(workspace)

      // Simulate Browser Tab B
      simulateNewBrowserTab()

      // Browser Tab B creates its own tab
      const { tabId: tabIdB } = actions.createTabGroupWithTab(workspace)

      // Each browser tab has a unique tabId (critical for server lock)
      expect(tabIdA).not.toBe(tabIdB)

      // Both tabs exist in shared history
      const dataState = useTabDataStore.getState()
      expect(dataState.tabsByWorkspace[workspace]).toHaveLength(2)

      // Browser Tab B's active selection is its own tab
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBe(tabIdB)
    })

    it("server lock keys would be different for each browser tab", () => {
      const userId = "user-123"
      const tabGroupId = "group-abc"
      const actions = getActions()

      // Browser Tab A creates a tab
      const { tabId: tabIdA } = actions.createTabGroupWithTab(workspace)

      // Simulate Browser Tab B creating its own tab
      simulateNewBrowserTab()
      const { tabId: tabIdB } = actions.createTabGroupWithTab(workspace)

      // Construct session keys as server would (from tabKey function)
      const sessionKeyA = `${userId}::${workspace}::${tabGroupId}::${tabIdA}`
      const sessionKeyB = `${userId}::${workspace}::${tabGroupId}::${tabIdB}`

      // Keys are different - no lock conflict!
      expect(sessionKeyA).not.toBe(sessionKeyB)
    })
  })

  describe("Actions Coordinate Both Stores", () => {
    it("addTab creates in data store and sets active in view store", () => {
      const actions = getActions()

      // First create a tab group
      const { tabGroupId } = actions.createTabGroupWithTab(workspace)

      // Add another tab to the group
      const newTab = actions.addTab(workspace, tabGroupId, "New Tab")

      expect(newTab).not.toBeNull()
      expect(newTab?.id).toBeDefined()

      // Verify in data store
      const dataState = useTabDataStore.getState()
      const tabs = dataState.tabsByWorkspace[workspace] ?? []
      expect(tabs.some(t => t.id === newTab?.id)).toBe(true)

      // Verify active in view store
      const viewState = useTabViewStore.getState()
      expect(viewState.activeTabByWorkspace[workspace]).toBe(newTab?.id)
    })

    it("removeTab updates active selection if removing active tab", () => {
      const actions = getActions()

      // Create multiple tabs in same group
      const { tabGroupId, tabId: tab1 } = actions.createTabGroupWithTab(workspace)
      const tab2 = actions.addTab(workspace, tabGroupId)

      // Make tab1 active (it should already be, but explicit)
      actions.setActiveTab(workspace, tab1)
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBe(tab1)

      // Remove tab1 (the active one)
      actions.removeTab(workspace, tab1)

      // Active should switch to tab2
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBe(tab2?.id)
    })

    it("setActiveTab only updates view store, not data store", () => {
      const actions = getActions()

      // Create tabs
      const { tabId: tab1 } = actions.createTabGroupWithTab(workspace)
      const { tabId: tab2 } = actions.createTabGroupWithTab(workspace)

      // Capture data store state
      const dataStateBefore = JSON.stringify(useTabDataStore.getState())

      // Change active tab
      actions.setActiveTab(workspace, tab1)
      actions.setActiveTab(workspace, tab2)
      actions.setActiveTab(workspace, tab1)

      // Data store unchanged (no writes to localStorage for active selection)
      const dataStateAfter = JSON.stringify(useTabDataStore.getState())
      expect(dataStateAfter).toBe(dataStateBefore)

      // View store updated
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBe(tab1)
    })

    it("collapseTabsAndClear clears both stores", () => {
      const actions = getActions()

      // Create tabs
      actions.createTabGroupWithTab(workspace)
      actions.createTabGroupWithTab(workspace)

      // Verify data exists
      expect(useTabDataStore.getState().tabsByWorkspace[workspace]?.length).toBe(2)
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBeDefined()

      // Clear
      actions.collapseTabsAndClear(workspace)

      // Both stores cleared for this workspace
      expect(useTabDataStore.getState().tabsByWorkspace[workspace]).toHaveLength(0)
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBeUndefined()
      expect(useTabViewStore.getState().tabsExpandedByWorkspace[workspace]).toBe(false)
    })
  })

  describe("Backwards Compatibility Layer", () => {
    it("useTabStore.getState() returns combined state", () => {
      const actions = getActions()

      // Create tab
      const { tabId } = actions.createTabGroupWithTab(workspace)

      // Legacy getState should return both data and view
      const state = useTabStore.getState()

      // State includes data
      expect(state.tabsByWorkspace[workspace]).toHaveLength(1)

      // State includes view
      expect(state.activeTabByWorkspace[workspace]).toBe(tabId)

      // State includes actions
      expect(typeof state.addTab).toBe("function")
      expect(typeof state.removeTab).toBe("function")
      expect(typeof state.setActiveTab).toBe("function")
    })

    it("useTabStore.setState() routes to correct stores", () => {
      // Set data via legacy API
      useTabStore.setState({
        tabsByWorkspace: {
          [workspace]: [
            { id: "test-tab", tabGroupId: "test-group", name: "Test", tabNumber: 1, createdAt: Date.now() },
          ],
        },
      })

      // Verify routed to data store
      expect(useTabDataStore.getState().tabsByWorkspace[workspace]).toHaveLength(1)

      // Set view via legacy API
      useTabStore.setState({
        activeTabByWorkspace: { [workspace]: "test-tab" },
        tabsExpandedByWorkspace: { [workspace]: true },
      })

      // Verify routed to view store
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBe("test-tab")
      expect(useTabViewStore.getState().tabsExpandedByWorkspace[workspace]).toBe(true)
    })

    it("useTabStore.persist works with HydrationManager", () => {
      // Verify persist API exists
      expect(useTabStore.persist).toBeDefined()
      expect(typeof useTabStore.persist.rehydrate).toBe("function")
      expect(typeof useTabStore.persist.hasHydrated).toBe("function")

      // hasHydrated should be callable and return a boolean
      // In test env without real storage, it returns false
      const hydrated = useTabStore.persist.hasHydrated()
      expect(typeof hydrated).toBe("boolean")
    })
  })

  describe("Workspace Isolation", () => {
    it("different workspaces have independent tab histories", () => {
      const actions = getActions()
      const workspace1 = "site1.com"
      const workspace2 = "site2.com"

      // Create tabs in different workspaces
      actions.createTabGroupWithTab(workspace1)
      actions.createTabGroupWithTab(workspace1)
      actions.createTabGroupWithTab(workspace2)

      // Each workspace has its own tabs
      expect(useTabDataStore.getState().tabsByWorkspace[workspace1]).toHaveLength(2)
      expect(useTabDataStore.getState().tabsByWorkspace[workspace2]).toHaveLength(1)
    })

    it("different workspaces have independent active selections", () => {
      const actions = getActions()
      const workspace1 = "site1.com"
      const workspace2 = "site2.com"

      // Create and set active tabs in different workspaces
      const { tabId: w1Tab } = actions.createTabGroupWithTab(workspace1)
      const { tabId: w2Tab } = actions.createTabGroupWithTab(workspace2)

      // Each workspace has its own active
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace1]).toBe(w1Tab)
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace2]).toBe(w2Tab)

      // Changing one doesn't affect the other
      actions.setActiveTab(workspace1, w1Tab)
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace2]).toBe(w2Tab)
    })
  })

  describe("Edge Cases", () => {
    it("handles empty workspace gracefully", () => {
      const viewState = useTabViewStore.getState()
      expect(viewState.activeTabByWorkspace.nonexistent).toBeUndefined()

      const dataState = useTabDataStore.getState()
      expect(dataState.tabsByWorkspace.nonexistent).toBeUndefined()
    })

    it("handles rapid tab creation", () => {
      const actions = getActions()

      // Rapid fire tab creation
      const tabIds: string[] = []
      for (let i = 0; i < 10; i++) {
        const { tabId } = actions.createTabGroupWithTab(workspace)
        tabIds.push(tabId)
      }

      // All tabs created with unique IDs
      const uniqueIds = new Set(tabIds)
      expect(uniqueIds.size).toBe(10)

      // All tabs in data store
      expect(useTabDataStore.getState().tabsByWorkspace[workspace]).toHaveLength(10)

      // Last created is active
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBe(tabIds[9])
    })

    it("handles setting nonexistent tab as active", () => {
      const actions = getActions()

      // Create a tab first
      actions.createTabGroupWithTab(workspace)

      // Try to set a nonexistent tab as active
      // This should not throw, just update the view store
      actions.setActiveTab(workspace, "nonexistent-tab-id")

      // View store is updated (it doesn't validate against data store)
      expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBe("nonexistent-tab-id")
    })
  })
})

describe("Regression: Cross-Tab Collision Prevention", () => {
  const workspace = "example.com"

  beforeEach(() => {
    useTabDataStore.setState({ tabsByWorkspace: {} })
    useTabViewStore.setState({
      activeTabByWorkspace: {},
      tabsExpandedByWorkspace: {},
    })
  })

  /**
   * THE BUG (before fix):
   * 1. User opens browser Tab A → creates chat tab "uuid-A" → activeTab = "uuid-A"
   * 2. User opens browser Tab B → hydrates from localStorage → activeTab = "uuid-A" (same!)
   * 3. Both browser tabs send tabId="uuid-A" to server
   * 4. Server lock conflict → 409 CONVERSATION_BUSY
   *
   * THE FIX:
   * - activeTabByWorkspace moved to sessionStorage (isolated per browser tab)
   * - Browser Tab B has no activeTab until it creates its own
   */
  it("new browser tab does not inherit active tab from localStorage", () => {
    const actions = getActions()

    // Browser Tab A creates a tab
    const { tabId: tabA } = actions.createTabGroupWithTab(workspace)
    expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBe(tabA)

    // Simulate Browser Tab B opening (fresh sessionStorage)
    simulateNewBrowserTab()

    // Browser Tab B should NOT have tabA as active
    // This is the critical fix - before, it would have inherited tabA
    expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).not.toBe(tabA)
    expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBeUndefined()
  })

  it("two browser tabs sending different tabIds prevents 409", () => {
    const actions = getActions()

    // Simulate the exact scenario that caused bugs
    // Browser Tab A: working on their chat
    const { tabId: tabIdA, tabGroupId: groupA } = actions.createTabGroupWithTab(workspace)

    // Browser Tab B opens (fresh session)
    simulateNewBrowserTab()

    // Browser Tab B creates their own chat (not reusing Tab A's)
    const { tabId: tabIdB, tabGroupId: groupB } = actions.createTabGroupWithTab(workspace)

    // CRITICAL: tabIds are different
    expect(tabIdA).not.toBe(tabIdB)

    // CRITICAL: tabGroupIds are different (each browser tab started new conversation)
    expect(groupA).not.toBe(groupB)

    // Both tabs exist in shared history (sidebar shows both)
    const tabs = useTabDataStore.getState().tabsByWorkspace[workspace] ?? []
    expect(tabs).toHaveLength(2)
    expect(tabs.find(t => t.id === tabIdA)).toBeDefined()
    expect(tabs.find(t => t.id === tabIdB)).toBeDefined()
  })

  it("tab history is visible across browser tabs (sidebar works)", () => {
    const actions = getActions()

    // Browser Tab A creates some chats
    actions.createTabGroupWithTab(workspace)
    actions.createTabGroupWithTab(workspace)
    actions.createTabGroupWithTab(workspace)

    // Verify 3 tabs in history
    expect(useTabDataStore.getState().tabsByWorkspace[workspace]).toHaveLength(3)

    // Browser Tab B opens
    simulateNewBrowserTab()

    // Browser Tab B can see all the tabs in sidebar (shared localStorage)
    const tabsVisibleToB = useTabDataStore.getState().tabsByWorkspace[workspace] ?? []
    expect(tabsVisibleToB).toHaveLength(3)

    // But Browser Tab B has no active selection yet
    expect(useTabViewStore.getState().activeTabByWorkspace[workspace]).toBeUndefined()
  })
})
