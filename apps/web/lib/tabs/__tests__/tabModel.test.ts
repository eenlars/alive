/**
 * tabModel Unit Tests
 *
 * Tests pure functions extracted from tabStore.
 * These are the building blocks for tab management, used by both
 * tabDataStore and tabViewStore.
 */

import { describe, expect, it } from "vitest"
import {
  CLOSED_TAB_TTL_MS,
  closeTab,
  createTab,
  createTabGroup,
  filterStaleTabs,
  findFirstOpenTabId,
  findNextActiveTab,
  findTabById,
  getActiveTabAfterClose,
  getClosedTabs,
  getNextTabNumber,
  getOpenTabs,
  getOpenTabsInGroup,
  isClosed,
  isOpen,
  MAX_TABS_PER_GROUP,
  removeTabGroup,
  renameTab,
  reopenTab,
  setTabDraft,
  type Tab,
} from "../tabModel"

// ============================================================================
// Test Helpers
// ============================================================================

function createTestTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: `tab-${Math.random().toString(36).slice(2, 9)}`,
    tabGroupId: "group-1",
    name: "Test Tab",
    tabNumber: 1,
    createdAt: Date.now(),
    ...overrides,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("tabModel constants", () => {
  it("MAX_TABS_PER_GROUP is 5", () => {
    expect(MAX_TABS_PER_GROUP).toBe(5)
  })

  it("CLOSED_TAB_TTL_MS is 7 days", () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    expect(CLOSED_TAB_TTL_MS).toBe(sevenDays)
  })
})

describe("isOpen / isClosed predicates", () => {
  it("isOpen returns true when closedAt is undefined", () => {
    const tab = createTestTab({ closedAt: undefined })
    expect(isOpen(tab)).toBe(true)
    expect(isClosed(tab)).toBe(false)
  })

  it("isClosed returns true when closedAt is defined", () => {
    const tab = createTestTab({ closedAt: Date.now() })
    expect(isClosed(tab)).toBe(true)
    expect(isOpen(tab)).toBe(false)
  })

  it("closedAt=0 (epoch) is treated as closed", () => {
    // Edge case: 0 is falsy but is a valid timestamp
    const tab = createTestTab({ closedAt: 0 })
    expect(isClosed(tab)).toBe(true)
    expect(isOpen(tab)).toBe(false)
  })
})

describe("getOpenTabsInGroup", () => {
  it("returns only open tabs in the specified group", () => {
    const tabs: Tab[] = [
      createTestTab({ id: "t1", tabGroupId: "group-a" }),
      createTestTab({ id: "t2", tabGroupId: "group-a", closedAt: Date.now() }),
      createTestTab({ id: "t3", tabGroupId: "group-b" }),
      createTestTab({ id: "t4", tabGroupId: "group-a" }),
    ]

    const result = getOpenTabsInGroup(tabs, "group-a")
    expect(result).toHaveLength(2)
    expect(result.map(t => t.id)).toContain("t1")
    expect(result.map(t => t.id)).toContain("t4")
    expect(result.map(t => t.id)).not.toContain("t2") // closed
    expect(result.map(t => t.id)).not.toContain("t3") // different group
  })

  it("returns empty array for nonexistent group", () => {
    const tabs: Tab[] = [createTestTab({ tabGroupId: "group-a" })]
    expect(getOpenTabsInGroup(tabs, "nonexistent")).toEqual([])
  })
})

describe("getOpenTabs / getClosedTabs", () => {
  it("getOpenTabs filters out closed tabs", () => {
    const tabs: Tab[] = [
      createTestTab({ id: "open1" }),
      createTestTab({ id: "closed1", closedAt: Date.now() }),
      createTestTab({ id: "open2" }),
    ]

    const open = getOpenTabs(tabs)
    expect(open).toHaveLength(2)
    expect(open.map(t => t.id)).toEqual(["open1", "open2"])
  })

  it("getClosedTabs returns only closed tabs, sorted by most recent first", () => {
    const now = Date.now()
    const tabs: Tab[] = [
      createTestTab({ id: "open" }),
      createTestTab({ id: "closed-old", closedAt: now - 1000 }),
      createTestTab({ id: "closed-new", closedAt: now }),
    ]

    const closed = getClosedTabs(tabs)
    expect(closed).toHaveLength(2)
    expect(closed[0].id).toBe("closed-new") // most recent first
    expect(closed[1].id).toBe("closed-old")
  })
})

describe("getNextTabNumber", () => {
  it("returns 1 for empty group", () => {
    expect(getNextTabNumber([], "any-group")).toBe(1)
  })

  it("returns max + 1 for existing tabs", () => {
    const tabs: Tab[] = [
      createTestTab({ tabGroupId: "group-a", tabNumber: 1 }),
      createTestTab({ tabGroupId: "group-a", tabNumber: 3 }),
      createTestTab({ tabGroupId: "group-a", tabNumber: 2 }),
    ]

    expect(getNextTabNumber(tabs, "group-a")).toBe(4)
  })

  it("includes closed tabs in numbering (prevents reuse)", () => {
    const tabs: Tab[] = [
      createTestTab({ tabGroupId: "group-a", tabNumber: 1 }),
      createTestTab({ tabGroupId: "group-a", tabNumber: 5, closedAt: Date.now() }),
    ]

    expect(getNextTabNumber(tabs, "group-a")).toBe(6)
  })

  it("ignores tabs from other groups", () => {
    const tabs: Tab[] = [
      createTestTab({ tabGroupId: "group-a", tabNumber: 10 }),
      createTestTab({ tabGroupId: "group-b", tabNumber: 1 }),
    ]

    expect(getNextTabNumber(tabs, "group-b")).toBe(2)
  })
})

describe("findFirstOpenTabId", () => {
  it("returns undefined for empty array", () => {
    expect(findFirstOpenTabId([])).toBeUndefined()
  })

  it("returns undefined if all tabs are closed", () => {
    const tabs: Tab[] = [
      createTestTab({ id: "t1", closedAt: Date.now() }),
      createTestTab({ id: "t2", closedAt: Date.now() }),
    ]
    expect(findFirstOpenTabId(tabs)).toBeUndefined()
  })

  it("returns first open tab id", () => {
    const tabs: Tab[] = [
      createTestTab({ id: "closed", closedAt: Date.now() }),
      createTestTab({ id: "open1" }),
      createTestTab({ id: "open2" }),
    ]
    expect(findFirstOpenTabId(tabs)).toBe("open1")
  })
})

describe("findTabById", () => {
  it("returns undefined if not found", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" })]
    expect(findTabById(tabs, "nonexistent")).toBeUndefined()
  })

  it("returns the tab if found", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" }), createTestTab({ id: "t2", name: "Target" })]
    const found = findTabById(tabs, "t2")
    expect(found?.name).toBe("Target")
  })
})

describe("createTab", () => {
  it("creates a new tab with generated id", () => {
    const tabs: Tab[] = []
    const tab = createTab(tabs, "group-1", "My Tab")

    expect(tab.id).toBeDefined()
    expect(tab.id.length).toBeGreaterThan(0)
    expect(tab.tabGroupId).toBe("group-1")
    expect(tab.name).toBe("My Tab")
    expect(tab.tabNumber).toBe(1)
    expect(tab.createdAt).toBeLessThanOrEqual(Date.now())
    expect(tab.closedAt).toBeUndefined()
  })

  it("uses default name if not provided", () => {
    const tabs: Tab[] = [createTestTab({ tabGroupId: "group-1", tabNumber: 1 })]
    const tab = createTab(tabs, "group-1")

    expect(tab.name).toBe("Tab 2") // next number
    expect(tab.tabNumber).toBe(2)
  })

  it("generates unique ids", () => {
    const tabs: Tab[] = []
    const ids = new Set<string>()

    for (let i = 0; i < 100; i++) {
      const tab = createTab(tabs, "group-1")
      expect(ids.has(tab.id)).toBe(false)
      ids.add(tab.id)
    }
  })
})

describe("createTabGroup", () => {
  it("creates a new group with first tab", () => {
    const tabs: Tab[] = []
    const { tabGroupId, tab } = createTabGroup(tabs)

    expect(tabGroupId).toBeDefined()
    expect(tab.tabGroupId).toBe(tabGroupId)
    expect(tab.tabNumber).toBe(1)
  })

  it("generates unique group ids", () => {
    const tabs: Tab[] = []
    const ids = new Set<string>()

    for (let i = 0; i < 100; i++) {
      const { tabGroupId } = createTabGroup(tabs)
      expect(ids.has(tabGroupId)).toBe(false)
      ids.add(tabGroupId)
    }
  })
})

describe("closeTab", () => {
  it("sets closedAt on the specified tab", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" }), createTestTab({ id: "t2" })]

    const result = closeTab(tabs, "t1")

    expect(result[0].closedAt).toBeDefined()
    expect(result[1].closedAt).toBeUndefined()
  })

  it("returns new array (immutable)", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" })]
    const result = closeTab(tabs, "t1")

    expect(result).not.toBe(tabs)
    expect(tabs[0].closedAt).toBeUndefined() // original unchanged
  })
})

describe("reopenTab", () => {
  it("removes closedAt from the specified tab", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1", closedAt: Date.now() })]

    const result = reopenTab(tabs, "t1")

    expect(result[0].closedAt).toBeUndefined()
  })

  it("returns new array (immutable)", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1", closedAt: 12345 })]
    const result = reopenTab(tabs, "t1")

    expect(result).not.toBe(tabs)
    expect(tabs[0].closedAt).toBe(12345) // original unchanged
  })
})

describe("renameTab", () => {
  it("updates the tab name", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1", name: "Old Name" })]
    const result = renameTab(tabs, "t1", "New Name")

    expect(result[0].name).toBe("New Name")
  })

  it("trims whitespace", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" })]
    const result = renameTab(tabs, "t1", "  Trimmed  ")

    expect(result[0].name).toBe("Trimmed")
  })

  it("uses Untitled for empty/whitespace name", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" })]

    expect(renameTab(tabs, "t1", "")[0].name).toBe("Untitled")
    expect(renameTab(tabs, "t1", "   ")[0].name).toBe("Untitled")
  })
})

describe("setTabDraft", () => {
  it("updates the tab inputDraft", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" })]
    const result = setTabDraft(tabs, "t1", "My draft message")

    expect(result[0].inputDraft).toBe("My draft message")
  })
})

describe("removeTabGroup", () => {
  it("removes all tabs in the group", () => {
    const tabs: Tab[] = [
      createTestTab({ id: "t1", tabGroupId: "group-a" }),
      createTestTab({ id: "t2", tabGroupId: "group-a" }),
      createTestTab({ id: "t3", tabGroupId: "group-b" }),
    ]

    const result = removeTabGroup(tabs, "group-a")

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("t3")
  })
})

describe("findNextActiveTab", () => {
  it("returns tab at same index if available", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" }), createTestTab({ id: "t2" }), createTestTab({ id: "t3" })]

    // Closing t2 (index 1), next should be t3 (now at index 1)
    const next = findNextActiveTab(tabs, 1)
    expect(next?.id).toBe("t3")
  })

  it("returns last tab if closing last in list", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" }), createTestTab({ id: "t2" })]

    // Closing t2 (index 1), next should be t1 (last remaining)
    const next = findNextActiveTab(tabs, 1)
    expect(next?.id).toBe("t1")
  })

  it("returns undefined if no tabs remain", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1" })]
    const next = findNextActiveTab(tabs, 0)
    expect(next).toBeUndefined()
  })
})

describe("getActiveTabAfterClose", () => {
  const group = "group-1"

  it("returns new active if closing the active tab", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1", tabGroupId: group }), createTestTab({ id: "t2", tabGroupId: group })]

    const newActive = getActiveTabAfterClose(tabs, "t1", "t1")
    expect(newActive).toBe("t2")
  })

  it("returns current active if closing non-active tab", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1", tabGroupId: group }), createTestTab({ id: "t2", tabGroupId: group })]

    const newActive = getActiveTabAfterClose(tabs, "t2", "t1")
    expect(newActive).toBe("t1") // unchanged
  })

  it("returns undefined if closing only tab", () => {
    const tabs: Tab[] = [createTestTab({ id: "t1", tabGroupId: group })]

    const newActive = getActiveTabAfterClose(tabs, "t1", "t1")
    expect(newActive).toBeUndefined()
  })
})

describe("filterStaleTabs", () => {
  const group = "group-1"

  it("keeps all open tabs", () => {
    const tabs: Tab[] = [createTestTab({ id: "open1" }), createTestTab({ id: "open2" })]

    const result = filterStaleTabs(tabs, undefined, Date.now())
    expect(result).toHaveLength(2)
  })

  it("keeps recently closed tabs", () => {
    const now = Date.now()
    const tabs: Tab[] = [
      createTestTab({ id: "recent", closedAt: now - 1000 }), // 1 second ago
    ]

    const result = filterStaleTabs(tabs, undefined, now)
    expect(result).toHaveLength(1)
  })

  it("removes old closed tabs", () => {
    const now = Date.now()
    const tabs: Tab[] = [createTestTab({ id: "old", closedAt: now - CLOSED_TAB_TTL_MS - 1 })]

    const result = filterStaleTabs(tabs, undefined, now)
    expect(result).toHaveLength(0)
  })

  it("keeps closed tabs if group still has open tabs", () => {
    const now = Date.now()
    const tabs: Tab[] = [
      createTestTab({ id: "open", tabGroupId: group }),
      createTestTab({ id: "old-closed", tabGroupId: group, closedAt: now - CLOSED_TAB_TTL_MS - 1 }),
    ]

    const result = filterStaleTabs(tabs, undefined, now)
    expect(result).toHaveLength(2) // keeps old-closed because group is active
  })

  it("never removes the active tab", () => {
    const now = Date.now()
    const tabs: Tab[] = [createTestTab({ id: "active", closedAt: now - CLOSED_TAB_TTL_MS - 1 })]

    const result = filterStaleTabs(tabs, "active", now)
    expect(result).toHaveLength(1)
  })
})
