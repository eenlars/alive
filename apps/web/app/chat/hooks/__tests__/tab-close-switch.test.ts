/**
 * Tab Close → Switch Conversation test
 *
 * Regression test for React error #185 (max update depth exceeded).
 *
 * Root cause: handleTabClose called removeTab but did NOT call onSwitchConversation.
 * Two competing effects then fought over state:
 *   1. useTabs effect detected activeTabInGroup changed → called switchTab → setTabId
 *   2. page.tsx effect saw tabForSession=null (stale tabId) → created unwanted tab group
 * These ping-ponged until React hit the 50-update limit.
 *
 * Fix: handleTabClose proactively reads the new active tab from the store after
 * removeTab and calls onSwitchConversation synchronously — no effect cascade needed.
 *
 * This test exercises the real Zustand tabStore (no React, no effects) to verify:
 *   1. removeTab picks a valid new active tab
 *   2. The new active tab's id (which IS the conversation key) is available to call onSwitchConversation
 *
 * NEW TAB MODEL:
 * - Tab.id = unique tab identifier AND Claude conversation key (single source of truth)
 * - Tab.tabGroupId = sidebar grouping
 * - addTab(workspace, tabGroupId, name?) - name is optional display name
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useTabStore } from "@/lib/stores/tabStore"

const WS = "test.example.com"
const GROUP = "group-1"

function resetStore() {
  useTabStore.setState({
    tabsByWorkspace: {},
    activeTabByWorkspace: {},
    tabsExpandedByWorkspace: {},
    nextTabNumberByWorkspace: {},
  })
}

/**
 * Simulates what handleTabClose does after removeTab:
 * Read the new active tab from the store and return its id.
 * Tab.id IS the Claude conversation key (single source of truth).
 */
function getNewActiveTabId(workspace: string, closedTabId: string): string | null {
  const state = useTabStore.getState()
  const newActiveId = state.activeTabByWorkspace[workspace]
  if (!newActiveId || newActiveId === closedTabId) return null
  const allTabs = state.tabsByWorkspace[workspace] ?? []
  const newActiveTab = allTabs.find(t => t.id === newActiveId)
  return newActiveTab?.id ?? null
}

describe("Tab close → switch conversation (regression for React #185)", () => {
  beforeEach(resetStore)
  afterEach(resetStore)

  it("after closing active tab, store has a different active tab with valid tabId", () => {
    const { addTab, removeTab } = useTabStore.getState()

    // addTab(workspace, tabGroupId, name?) - name is optional display label
    const tabA = addTab(WS, GROUP, "Tab A")!
    const tabB = addTab(WS, GROUP, "Tab B")!

    // tabB is active (addTab sets latest as active)
    expect(useTabStore.getState().activeTabByWorkspace[WS]).toBe(tabB.id)

    // Close active tab (tabB)
    removeTab(WS, tabB.id)

    const switchTo = getNewActiveTabId(WS, tabB.id)
    // Tab.id IS the conversation key - should switch to tabA
    expect(switchTo).toBe(tabA.id)
  })

  it("after closing non-active tab, active tab stays the same", () => {
    const { addTab, setActiveTab, removeTab } = useTabStore.getState()

    addTab(WS, GROUP, "Tab A")
    const tabB = addTab(WS, GROUP, "Tab B")!
    const tabC = addTab(WS, GROUP, "Tab C")!

    setActiveTab(WS, tabB.id)

    removeTab(WS, tabC.id)

    expect(useTabStore.getState().activeTabByWorkspace[WS]).toBe(tabB.id)
    const switchTo = getNewActiveTabId(WS, tabC.id)
    // Tab.id IS the conversation key - should stay on tabB
    expect(switchTo).toBe(tabB.id)
  })

  it("closing the first tab selects the next tab", () => {
    const { addTab, setActiveTab, removeTab } = useTabStore.getState()

    const tabA = addTab(WS, GROUP, "Tab A")!
    const tabB = addTab(WS, GROUP, "Tab B")!
    addTab(WS, GROUP, "Tab C")

    setActiveTab(WS, tabA.id)
    removeTab(WS, tabA.id)

    const switchTo = getNewActiveTabId(WS, tabA.id)
    // Tab.id IS the conversation key - should switch to tabB (next tab)
    expect(switchTo).toBe(tabB.id)
  })

  it("does not close the last remaining tab", () => {
    const { addTab, removeTab } = useTabStore.getState()

    const tabA = addTab(WS, GROUP, "Tab A")!

    removeTab(WS, tabA.id)

    // Tab should still exist (removeTab is a no-op for last tab)
    const state = useTabStore.getState()
    const openTabs = (state.tabsByWorkspace[WS] ?? []).filter(t => !t.closedAt)
    expect(openTabs).toHaveLength(1)
    expect(state.activeTabByWorkspace[WS]).toBe(tabA.id)
  })

  it("closed tab is soft-deleted (closedAt set), not removed from array", () => {
    const { addTab, removeTab } = useTabStore.getState()

    const tabA = addTab(WS, GROUP, "Tab A")!
    addTab(WS, GROUP, "Tab B")

    removeTab(WS, tabA.id)

    const state = useTabStore.getState()
    const allTabs = state.tabsByWorkspace[WS] ?? []
    const closedTab = allTabs.find(t => t.id === tabA.id)
    expect(closedTab).toBeDefined()
    expect(closedTab!.closedAt).toBeGreaterThan(0)
  })

  it("new active tab is never the closed tab (the core invariant)", () => {
    const { addTab, setActiveTab, removeTab } = useTabStore.getState()

    // Create 5 tabs (third param is display name, not conversation ID)
    const tabs = Array.from({ length: 5 }, (_, i) => addTab(WS, GROUP, `Tab ${i}`)!)

    // Close each tab in turn (except last) and verify active is never the closed one
    for (let i = 0; i < 4; i++) {
      setActiveTab(WS, tabs[i].id)
      removeTab(WS, tabs[i].id)

      const newActiveId = useTabStore.getState().activeTabByWorkspace[WS]
      expect(newActiveId).not.toBe(tabs[i].id)

      const switchTo = getNewActiveTabId(WS, tabs[i].id)
      expect(switchTo).toBeTruthy()
      // Tab.id IS the conversation key - verify it's not the closed tab's id
      expect(switchTo).not.toBe(tabs[i].id)
    }
  })
})
