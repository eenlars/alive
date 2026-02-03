/**
 * tabStore unit tests
 *
 * Focus: Per-TabGroup tab limits. Each conversation can have up to
 * MAX_TABS_PER_GROUP tabs. No global workspace limit.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MAX_TABS_PER_GROUP, type Tab, useTabStore } from "../tabStore"

// Use the same logic as the store: closedAt === undefined means open
const isOpen = (tab: Tab): boolean => tab.closedAt === undefined

// Direct store access (no React hooks)
const getState = () => useTabStore.getState()
const getActions = () => {
  const s = getState()
  return {
    addTab: s.addTab,
    removeTab: s.removeTab,
    reopenTab: s.reopenTab,
    createTabGroupWithTab: s.createTabGroupWithTab,
    openTabGroupInTab: s.openTabGroupInTab,
    setActiveTab: s.setActiveTab,
    collapseTabsAndClear: s.collapseTabsAndClear,
  }
}

// Helper to count open tabs for a workspace
const countOpenTabs = (workspace: string): number => {
  const tabs = getState().tabsByWorkspace[workspace] ?? []
  return tabs.filter(isOpen).length
}

// Helper to count open tabs in a specific group
const countOpenTabsInGroup = (workspace: string, tabGroupId: string): number => {
  const tabs = getState().tabsByWorkspace[workspace] ?? []
  return tabs.filter(t => t.tabGroupId === tabGroupId && isOpen(t)).length
}

// Helper to count all tabs (open + closed) for a workspace
const countAllTabs = (workspace: string): number => {
  const tabs = getState().tabsByWorkspace[workspace] ?? []
  return tabs.length
}

// Helper to get all tabs for inspection
const getAllTabs = (workspace: string): Tab[] => {
  return getState().tabsByWorkspace[workspace] ?? []
}

describe("tabStore", () => {
  const workspace = "test-workspace"
  const tabGroupId = "test-group-1"

  beforeEach(() => {
    // Reset store state completely
    useTabStore.setState({
      tabsByWorkspace: {},
      activeTabByWorkspace: {},
      tabsExpandedByWorkspace: {},
      nextTabNumberByWorkspace: {},
    })
  })

  afterEach(() => {
    // Clean up
    useTabStore.setState({
      tabsByWorkspace: {},
      activeTabByWorkspace: {},
      tabsExpandedByWorkspace: {},
      nextTabNumberByWorkspace: {},
    })
  })

  describe("per-group tab limit enforcement", () => {
    it("should allow creating tabs up to MAX_TABS_PER_GROUP (5) in a single group", () => {
      const actions = getActions()

      for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
        const tab = actions.addTab(workspace, tabGroupId)
        expect(tab).not.toBeNull()
        expect(tab?.id).toBeDefined()
      }

      expect(countOpenTabsInGroup(workspace, tabGroupId)).toBe(MAX_TABS_PER_GROUP)
    })

    it("should return null when adding tab at per-group limit", () => {
      const actions = getActions()

      // Create 5 tabs in same group
      for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
        actions.addTab(workspace, tabGroupId)
      }

      // 6th tab in same group should fail
      const tab = actions.addTab(workspace, tabGroupId)
      expect(tab).toBeNull()
    })

    it("should allow tabs in different groups independently", () => {
      const actions = getActions()
      const group1 = "group-1"
      const group2 = "group-2"

      // Fill group1 to limit
      for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
        const tab = actions.addTab(workspace, group1)
        expect(tab).not.toBeNull()
      }
      expect(countOpenTabsInGroup(workspace, group1)).toBe(MAX_TABS_PER_GROUP)

      // group2 should still allow tabs
      const tab = actions.addTab(workspace, group2)
      expect(tab).not.toBeNull()
      expect(countOpenTabsInGroup(workspace, group2)).toBe(1)
    })

    it("should allow unlimited tab groups (no global limit)", () => {
      const actions = getActions()

      // Create 20 different tab groups, each with 1 tab
      for (let i = 0; i < 20; i++) {
        const result = actions.createTabGroupWithTab(workspace)
        expect(result).not.toBeNull()
        expect(result?.tabGroupId).toBeDefined()
        expect(result?.tabId).toBeDefined()
      }

      expect(countOpenTabs(workspace)).toBe(20)
    })

    it("should always succeed creating new tab group via createTabGroupWithTab", () => {
      const actions = getActions()

      // Fill one group to limit
      for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
        actions.addTab(workspace, tabGroupId)
      }

      // Creating new tab group should still succeed
      const result = actions.createTabGroupWithTab(workspace)
      expect(result).not.toBeNull()
    })

    it("should always succeed opening new tab group via openTabGroupInTab", () => {
      const actions = getActions()

      // Fill one group to limit
      for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
        actions.addTab(workspace, tabGroupId)
      }

      // Opening new tab group should succeed
      const newGroupId = "new-group"
      const tab = actions.openTabGroupInTab(workspace, newGroupId)
      expect(tab).not.toBeNull()
      expect(tab?.tabGroupId).toBe(newGroupId)
    })
  })

  describe("closed tabs should NOT count toward limit", () => {
    it("should not count closed tabs in per-group limit check", () => {
      const actions = getActions()

      // Create 5 tabs
      const tabs: Tab[] = []
      for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
        const tab = actions.addTab(workspace, tabGroupId)
        if (tab) tabs.push(tab)
      }
      expect(countOpenTabsInGroup(workspace, tabGroupId)).toBe(5)

      // Close 3 tabs
      for (let i = 0; i < 3; i++) {
        actions.removeTab(workspace, tabs[i].id)
      }

      // Should have 2 open tabs now
      expect(countOpenTabsInGroup(workspace, tabGroupId)).toBe(2)

      // Should be able to add 3 more
      for (let i = 0; i < 3; i++) {
        const tab = actions.addTab(workspace, tabGroupId)
        expect(tab).not.toBeNull()
      }

      expect(countOpenTabsInGroup(workspace, tabGroupId)).toBe(5)
    })

    it("should allow adding tab after closing one at per-group limit", () => {
      const actions = getActions()

      // Create 5 tabs
      const tabs: Tab[] = []
      for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
        const tab = actions.addTab(workspace, tabGroupId)
        if (tab) tabs.push(tab)
      }

      // At limit - can't add more to this group
      expect(actions.addTab(workspace, tabGroupId)).toBeNull()

      // Close one tab
      actions.removeTab(workspace, tabs[0].id)
      expect(countOpenTabsInGroup(workspace, tabGroupId)).toBe(4)

      // Now should be able to add
      const newTab = actions.addTab(workspace, tabGroupId)
      expect(newTab).not.toBeNull()
    })
  })

  describe("workspace isolation", () => {
    it("should track tab limits per workspace independently", () => {
      const actions = getActions()
      const workspace1 = "workspace-1"
      const workspace2 = "workspace-2"

      // Fill workspace1's group to limit
      for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
        actions.addTab(workspace1, tabGroupId)
      }
      expect(countOpenTabsInGroup(workspace1, tabGroupId)).toBe(5)

      // Same tabGroupId in workspace2 should still allow tabs
      const tab = actions.addTab(workspace2, tabGroupId)
      expect(tab).not.toBeNull()
      expect(countOpenTabsInGroup(workspace2, tabGroupId)).toBe(1)
    })

    it("should not affect other workspaces when closing tabs", () => {
      const actions = getActions()
      const workspace1 = "workspace-1"
      const workspace2 = "workspace-2"

      // Create tabs in both
      const tab1 = actions.addTab(workspace1, tabGroupId)
      const _tab2 = actions.addTab(workspace2, tabGroupId)

      // Close tab in workspace1
      if (tab1) actions.removeTab(workspace1, tab1.id)

      // workspace2 should be unaffected
      expect(countOpenTabs(workspace2)).toBe(1)
    })
  })

  describe("edge cases that could cause phantom tabs", () => {
    it("should properly set closedAt when removing tab", () => {
      const actions = getActions()

      // Create 2 tabs (need at least 2 to close one)
      actions.addTab(workspace, tabGroupId)
      const tab2 = actions.addTab(workspace, tabGroupId)

      if (tab2) {
        actions.removeTab(workspace, tab2.id)

        const allTabs = getAllTabs(workspace)
        const closedTab = allTabs.find(t => t.id === tab2.id)

        expect(closedTab).toBeDefined()
        expect(closedTab?.closedAt).toBeDefined()
        expect(typeof closedTab?.closedAt).toBe("number")
      }
    })

    it("should handle tabs with undefined closedAt as open", () => {
      // Simulate corrupted/migrated state where closedAt might be undefined
      useTabStore.setState({
        tabsByWorkspace: {
          [workspace]: [
            {
              id: "tab-1",
              tabGroupId,
              name: "Tab 1",
              tabNumber: 1,
              createdAt: Date.now(),
              // closedAt intentionally undefined
            },
            {
              id: "tab-2",
              tabGroupId,
              name: "Tab 2",
              tabNumber: 2,
              createdAt: Date.now(),
              closedAt: undefined, // Explicitly undefined
            },
          ],
        },
        activeTabByWorkspace: { [workspace]: "tab-1" },
        tabsExpandedByWorkspace: {},
        nextTabNumberByWorkspace: {},
      })

      // Both should count as open
      expect(countOpenTabsInGroup(workspace, tabGroupId)).toBe(2)
    })

    it("should handle tabs with closedAt=0 as closed (falsy but defined)", () => {
      // Edge case: closedAt could be 0 (epoch) which is falsy
      // The fix uses `closedAt === undefined` instead of `!closedAt`
      useTabStore.setState({
        tabsByWorkspace: {
          [workspace]: [
            {
              id: "tab-1",
              tabGroupId,
              name: "Tab 1",
              tabNumber: 1,
              createdAt: Date.now(),
              closedAt: 0, // Falsy but should still mean closed
            },
          ],
        },
        activeTabByWorkspace: {},
        tabsExpandedByWorkspace: {},
        nextTabNumberByWorkspace: {},
      })

      // closedAt=0 is a valid timestamp (epoch), so it's closed
      const openCount = countOpenTabsInGroup(workspace, tabGroupId)
      expect(openCount).toBe(0) // Correctly treated as closed
    })

    it("should not create duplicate tabs on rapid addTab calls", () => {
      const actions = getActions()

      // Rapid fire tab creation
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(actions.addTab(workspace, tabGroupId))
      }

      // All should succeed and be unique
      const tabs = getAllTabs(workspace)
      const ids = tabs.map(t => t.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(tabs.length)
      expect(tabs.length).toBe(5)
    })
  })

  describe("reopenTab behavior", () => {
    it("should clear closedAt when reopening", () => {
      const actions = getActions()

      // Create 2 tabs
      actions.addTab(workspace, tabGroupId)
      const tab2 = actions.addTab(workspace, tabGroupId)

      if (tab2) {
        // Close it
        actions.removeTab(workspace, tab2.id)
        expect(getAllTabs(workspace).find(t => t.id === tab2.id)?.closedAt).toBeDefined()

        // Reopen it
        actions.reopenTab(workspace, tab2.id)
        const reopened = getAllTabs(workspace).find(t => t.id === tab2.id)
        expect(reopened?.closedAt).toBeUndefined()
      }
    })

    it("should increase open count when reopening", () => {
      const actions = getActions()

      // Create and close a tab
      actions.addTab(workspace, tabGroupId)
      const tab2 = actions.addTab(workspace, tabGroupId)

      if (tab2) {
        actions.removeTab(workspace, tab2.id)
        expect(countOpenTabsInGroup(workspace, tabGroupId)).toBe(1)

        actions.reopenTab(workspace, tab2.id)
        expect(countOpenTabsInGroup(workspace, tabGroupId)).toBe(2)
      }
    })
  })

  describe("collapseTabsAndClear", () => {
    it("should remove all tabs from workspace", () => {
      const actions = getActions()

      // Create several tabs
      for (let i = 0; i < 5; i++) {
        actions.addTab(workspace, tabGroupId)
      }
      expect(countAllTabs(workspace)).toBe(5)

      // Clear
      actions.collapseTabsAndClear(workspace)

      expect(countAllTabs(workspace)).toBe(0)
      expect(countOpenTabs(workspace)).toBe(0)
    })
  })

  describe("per-group limits prevent old accumulation bug", () => {
    it("scenario: multiple tabGroups with tabs - each group limited independently", () => {
      const actions = getActions()

      const group1 = "group-1"
      const group2 = "group-2"
      const group3 = "group-3"

      // Fill each group to limit
      for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
        actions.addTab(workspace, group1)
        actions.addTab(workspace, group2)
        actions.addTab(workspace, group3)
      }

      // Total: 15 open tabs across 3 groups (5 each)
      expect(countOpenTabs(workspace)).toBe(15)
      expect(countOpenTabsInGroup(workspace, group1)).toBe(5)
      expect(countOpenTabsInGroup(workspace, group2)).toBe(5)
      expect(countOpenTabsInGroup(workspace, group3)).toBe(5)

      // Can't add more to any full group
      expect(actions.addTab(workspace, group1)).toBeNull()
      expect(actions.addTab(workspace, group2)).toBeNull()
      expect(actions.addTab(workspace, group3)).toBeNull()

      // But CAN create a new group
      const newGroup = actions.createTabGroupWithTab(workspace)
      expect(newGroup).not.toBeNull()
      expect(countOpenTabs(workspace)).toBe(16)
    })

    it("scenario: old phantom tabs don't block new group creation", () => {
      // Simulate state where many old tabs exist from different groups
      useTabStore.setState({
        tabsByWorkspace: {
          [workspace]: [
            // 50 "phantom" tabs spread across 10 old groups (5 each)
            ...Array.from({ length: 50 }, (_, i) => ({
              id: `phantom-${i}`,
              tabGroupId: `old-group-${Math.floor(i / 5)}`,
              name: `Tab ${(i % 5) + 1}`,
              tabNumber: (i % 5) + 1,
              createdAt: Date.now() - 1000000,
              // NO closedAt - they're "open"
            })),
          ],
        },
        activeTabByWorkspace: { [workspace]: "phantom-0" },
        tabsExpandedByWorkspace: {},
        nextTabNumberByWorkspace: {},
      })

      expect(countOpenTabs(workspace)).toBe(50)

      // With per-group limits, user can ALWAYS create a new group
      const actions = getActions()
      const result = actions.createTabGroupWithTab(workspace)
      expect(result).not.toBeNull()
      expect(countOpenTabs(workspace)).toBe(51)
    })
  })

  describe("diagnostic helpers", () => {
    it("can inspect full tab state for debugging", () => {
      const actions = getActions()

      // Create some tabs
      actions.addTab(workspace, tabGroupId)
      const tab2 = actions.addTab(workspace, tabGroupId)
      if (tab2) actions.removeTab(workspace, tab2.id)

      // Full inspection
      const state = getState()
      const tabs = state.tabsByWorkspace[workspace] || []

      const diagnosis = {
        totalTabs: tabs.length,
        openTabs: tabs.filter(isOpen).length,
        closedTabs: tabs.filter(t => !isOpen(t)).length,
        tabGroups: [...new Set(tabs.map(t => t.tabGroupId))],
        tabDetails: tabs.map(t => ({
          id: t.id.slice(0, 8),
          group: t.tabGroupId.slice(0, 8),
          open: isOpen(t),
          age: Date.now() - t.createdAt,
        })),
      }

      expect(diagnosis.totalTabs).toBe(2)
      expect(diagnosis.openTabs).toBe(1)
      expect(diagnosis.closedTabs).toBe(1)
    })
  })

  /**
   * REGRESSION TESTS
   *
   * These tests would have FAILED with the old global MAX_TABS=10 limit.
   * They verify the fix: per-group limits instead of global workspace limits.
   */
  describe("REGRESSION: global limit bug fix", () => {
    const OLD_GLOBAL_LIMIT = 10 // The old buggy limit

    it("user with 10+ tabs across conversations can still create new conversation", () => {
      // THE BUG: User had 10 open tabs spread across old conversations.
      // When they tried to start a new conversation, it failed with "tabs full".
      // THE FIX: Per-group limit means old conversations don't block new ones.

      const actions = getActions()

      // Simulate user's history: 3 old conversations with tabs
      const oldConversations = ["conv-monday", "conv-tuesday", "conv-wednesday"]
      for (const conv of oldConversations) {
        // Each conversation has 4 tabs (total: 12 tabs)
        for (let i = 0; i < 4; i++) {
          actions.addTab(workspace, conv)
        }
      }

      // Verify we have more than the old global limit
      expect(countOpenTabs(workspace)).toBe(12)
      expect(countOpenTabs(workspace)).toBeGreaterThan(OLD_GLOBAL_LIMIT)

      // THE FIX: User can ALWAYS start a new conversation
      const newConv = actions.createTabGroupWithTab(workspace)
      expect(newConv).not.toBeNull()
      expect(newConv.tabGroupId).toBeDefined()
      expect(newConv.tabId).toBeDefined()

      // And add tabs to the new conversation (up to per-group limit)
      for (let i = 1; i < MAX_TABS_PER_GROUP; i++) {
        const tab = actions.addTab(workspace, newConv.tabGroupId)
        expect(tab).not.toBeNull()
      }
    })

    it("user viewing conversation A can add tab even if B,C,D are full", () => {
      // THE BUG: If conversations B, C, D had 10 tabs total, user couldn't
      // add a tab to conversation A even though A only had 1 tab.

      const actions = getActions()

      // Create conversation A with 1 tab
      const convA = "conversation-A"
      actions.addTab(workspace, convA)
      expect(countOpenTabsInGroup(workspace, convA)).toBe(1)

      // Create conversations B, C, D each with 5 tabs (15 total in B/C/D)
      for (const conv of ["conversation-B", "conversation-C", "conversation-D"]) {
        for (let i = 0; i < MAX_TABS_PER_GROUP; i++) {
          actions.addTab(workspace, conv)
        }
      }

      // Total is way over old limit
      expect(countOpenTabs(workspace)).toBe(16)
      expect(countOpenTabs(workspace)).toBeGreaterThan(OLD_GLOBAL_LIMIT)

      // THE FIX: Can still add tabs to conversation A (it only has 1)
      const newTabInA = actions.addTab(workspace, convA)
      expect(newTabInA).not.toBeNull()
      expect(countOpenTabsInGroup(workspace, convA)).toBe(2)
    })

    it("opening sidebar conversation works even with many existing tabs", () => {
      // THE BUG: User clicks conversation in sidebar, but openTabGroupInTab
      // failed because global limit was reached from other conversations.

      const actions = getActions()

      // Fill workspace with 20 tabs across 4 groups
      for (let g = 0; g < 4; g++) {
        for (let t = 0; t < MAX_TABS_PER_GROUP; t++) {
          actions.addTab(workspace, `existing-group-${g}`)
        }
      }
      expect(countOpenTabs(workspace)).toBe(20)

      // User clicks on a conversation in the sidebar
      const sidebarConvId = "clicked-from-sidebar"
      const tab = actions.openTabGroupInTab(workspace, sidebarConvId)

      // THE FIX: Always succeeds for new groups
      expect(tab).not.toBeNull()
      expect(tab.tabGroupId).toBe(sidebarConvId)
    })

    it("power user with 100 conversations is not blocked", () => {
      // Extreme case: power user with lots of history

      const actions = getActions()

      // Create 100 conversations, each with 1 tab
      for (let i = 0; i < 100; i++) {
        actions.createTabGroupWithTab(workspace)
      }
      expect(countOpenTabs(workspace)).toBe(100)

      // Can still create more
      const conv101 = actions.createTabGroupWithTab(workspace)
      expect(conv101).not.toBeNull()

      // Can add tabs to the new conversation
      for (let i = 1; i < MAX_TABS_PER_GROUP; i++) {
        expect(actions.addTab(workspace, conv101.tabGroupId)).not.toBeNull()
      }

      // Only blocked at per-group limit
      expect(actions.addTab(workspace, conv101.tabGroupId)).toBeNull()
    })
  })
})
