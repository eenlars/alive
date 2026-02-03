/**
 * Tab Model - Pure functions and types for tab management
 *
 * This module contains all tab-related logic that doesn't depend on Zustand.
 * Used by both tabDataStore (localStorage) and tabViewStore (sessionStorage).
 *
 * Benefits:
 * - Single source of truth for tab invariants
 * - Easy unit testing (no store mocking needed)
 * - Reusable across data and view stores
 */

import type { TabGroupId, TabId } from "@/lib/types/ids"

// ============================================================================
// Constants
// ============================================================================

/** Maximum tabs allowed per conversation (TabGroup). No global limit. */
export const MAX_TABS_PER_GROUP = 5

/** How long to keep closed tabs before cleanup (7 days) */
export const CLOSED_TAB_TTL_MS = 7 * 24 * 60 * 60 * 1000

// ============================================================================
// Types
// ============================================================================

export interface Tab {
  /** Unique tab identifier - ALSO the Claude conversation key */
  id: TabId
  /** Grouping id shown in left panel (sidebar item) */
  tabGroupId: TabGroupId
  name: string
  /** Sequential number within group, never reused */
  tabNumber: number
  createdAt: number
  /** Persisted draft message for this tab */
  inputDraft?: string
  /** Timestamp when tab was soft-deleted. Undefined = open tab. */
  closedAt?: number
}

// ============================================================================
// ID Generators
// ============================================================================

export const genTabId = (): TabId => crypto.randomUUID()
export const genTabGroupId = (): TabGroupId => crypto.randomUUID()

// ============================================================================
// Tab State Predicates
// ============================================================================

/** Check if a tab is open (not soft-deleted) */
export const isOpen = (tab: Tab): boolean => tab.closedAt === undefined

/** Check if a tab is closed (soft-deleted) */
export const isClosed = (tab: Tab): boolean => tab.closedAt !== undefined

// ============================================================================
// Tab Queries
// ============================================================================

/** Filter tabs by group and open status */
export const getOpenTabsInGroup = (tabs: Tab[], tabGroupId: TabGroupId): Tab[] =>
  tabs.filter(t => t.tabGroupId === tabGroupId && isOpen(t))

/** Get all open tabs from a list */
export const getOpenTabs = (tabs: Tab[]): Tab[] => tabs.filter(isOpen)

/** Get all closed tabs from a list, sorted by most recently closed first */
export const getClosedTabs = (tabs: Tab[]): Tab[] =>
  tabs.filter(isClosed).sort((a, b) => (b.closedAt as number) - (a.closedAt as number))

/** Get next tab number for a group (counts all tabs including closed) */
export const getNextTabNumber = (tabs: Tab[], tabGroupId: TabGroupId): number => {
  const groupTabs = tabs.filter(t => t.tabGroupId === tabGroupId)
  if (groupTabs.length === 0) return 1
  return Math.max(...groupTabs.map(t => t.tabNumber)) + 1
}

/**
 * Find the ID of the first open tab.
 * Returns undefined when no open tabs exist (valid state: empty workspace).
 */
export const findFirstOpenTabId = (tabs: Tab[]): TabId | undefined => {
  for (const tab of tabs) {
    if (isOpen(tab)) return tab.id
  }
  return undefined
}

/** Find a tab by ID */
export const findTabById = (tabs: Tab[], tabId: TabId): Tab | undefined => tabs.find(t => t.id === tabId)

// ============================================================================
// Tab Factories
// ============================================================================

/** Create a new tab object */
export const createTab = (tabs: Tab[], tabGroupId: TabGroupId, name?: string): Tab => {
  const num = getNextTabNumber(tabs, tabGroupId)
  return {
    id: genTabId(),
    tabGroupId,
    name: name ?? `Tab ${num}`,
    tabNumber: num,
    createdAt: Date.now(),
  }
}

/** Create a new tab group with its first tab */
export const createTabGroup = (tabs: Tab[], name?: string): { tabGroupId: TabGroupId; tab: Tab } => {
  const tabGroupId = genTabGroupId()
  const tab = createTab(tabs, tabGroupId, name)
  return { tabGroupId, tab }
}

// ============================================================================
// Tab Mutations (pure - return new arrays/objects)
// ============================================================================

/** Soft-delete a tab by setting closedAt timestamp */
export const closeTab = (tabs: Tab[], tabId: TabId): Tab[] =>
  tabs.map(t => (t.id === tabId ? { ...t, closedAt: Date.now() } : t))

/** Reopen a closed tab by removing closedAt */
export const reopenTab = (tabs: Tab[], tabId: TabId): Tab[] =>
  tabs.map(t => {
    if (t.id !== tabId) return t
    const { closedAt: _, ...rest } = t
    return rest
  })

/** Rename a tab */
export const renameTab = (tabs: Tab[], tabId: TabId, name: string): Tab[] => {
  const trimmed = name.trim()
  const newName = trimmed.length > 0 ? trimmed : "Untitled"
  return tabs.map(t => (t.id === tabId ? { ...t, name: newName } : t))
}

/** Update a tab's input draft */
export const setTabDraft = (tabs: Tab[], tabId: TabId, draft: string): Tab[] =>
  tabs.map(t => (t.id === tabId ? { ...t, inputDraft: draft } : t))

/** Remove all tabs in a group (hard delete) */
export const removeTabGroup = (tabs: Tab[], tabGroupId: TabGroupId): Tab[] =>
  tabs.filter(t => t.tabGroupId !== tabGroupId)

// ============================================================================
// Tab Selection Logic
// ============================================================================

/**
 * Find the next active tab after closing one.
 * Returns the tab at the same index, or the last tab if closing the last one.
 */
export const findNextActiveTab = (openTabs: Tab[], closingIndex: number): Tab | undefined => {
  const remaining = openTabs.filter((_, i) => i !== closingIndex)
  if (remaining.length === 0) return undefined
  const nextIndex = Math.min(closingIndex, remaining.length - 1)
  return remaining[nextIndex]
}

/**
 * Determine which tab should be active after closing a tab.
 * Returns the new active tab ID, or undefined if no tabs remain.
 */
export const getActiveTabAfterClose = (
  tabs: Tab[],
  closingTabId: TabId,
  currentActiveId: TabId | undefined,
): TabId | undefined => {
  const closingTab = findTabById(tabs, closingTabId)
  if (!closingTab || isClosed(closingTab)) return currentActiveId

  const groupOpenTabs = getOpenTabsInGroup(tabs, closingTab.tabGroupId)
  const closingIndex = groupOpenTabs.findIndex(t => t.id === closingTabId)
  const nextTab = findNextActiveTab(groupOpenTabs, closingIndex)

  // Only change active if we're closing the active tab
  if (currentActiveId === closingTabId) {
    return nextTab?.id
  }
  return currentActiveId
}

// ============================================================================
// Cleanup Logic
// ============================================================================

/**
 * Filter tabs to remove stale closed tabs.
 * Keeps: open tabs, recently closed, closed tabs in active groups, and the active tab.
 */
export const filterStaleTabs = (tabs: Tab[], activeId: TabId | undefined, now: number): Tab[] => {
  const activeGroupIds = new Set(tabs.filter(isOpen).map(t => t.tabGroupId))

  return tabs.filter(t => {
    // Never remove the active tab
    if (t.id === activeId) return true
    // Keep all open tabs
    if (isOpen(t)) return true
    // Keep recently closed tabs
    if (t.closedAt !== undefined && now - t.closedAt < CLOSED_TAB_TTL_MS) return true
    // Keep closed tabs if their group still has open tabs (for "reopen" feature)
    if (activeGroupIds.has(t.tabGroupId)) return true
    return false
  })
}
