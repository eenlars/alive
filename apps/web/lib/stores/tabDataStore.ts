"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  closeTab,
  createTab,
  createTabGroup,
  filterStaleTabs,
  findFirstOpenTabId,
  findNextActiveTab,
  findTabById,
  getOpenTabsInGroup,
  isClosed,
  isOpen,
  MAX_TABS_PER_GROUP,
  removeTabGroup as removeTabGroupPure,
  renameTab as renameTabPure,
  reopenTab as reopenTabPure,
  setTabDraft,
  type Tab,
} from "@/lib/tabs/tabModel"
import type { TabGroupId, TabId } from "@/lib/types/ids"
import { TAB_DATA_STORAGE_KEY, TAB_LEGACY_STORAGE_KEY, TAB_MIGRATION_FLAG_KEY } from "./storage-keys"

// Re-export Tab type for convenience
export type { Tab } from "@/lib/tabs/tabModel"

// ============================================================================
// Store Version (increment when changing persisted shape)
// ============================================================================

const DATA_STORE_VERSION = 1

// ============================================================================
// Types
// ============================================================================

interface TabDataStoreState {
  /** All tabs organized by workspace - SHARED across browser tabs via localStorage */
  tabsByWorkspace: Record<string, Tab[]>
}

interface TabDataStoreActions {
  // === Read operations ===
  /** Get all tabs for a workspace */
  getTabs: (workspace: string) => Tab[]
  /** Get all open tabs for a workspace */
  getOpenTabs: (workspace: string) => Tab[]
  /** Get open tabs in a specific group */
  getOpenTabsInGroup: (workspace: string, tabGroupId: TabGroupId) => Tab[]
  /** Get a specific tab by ID */
  getTab: (workspace: string, tabId: TabId) => Tab | undefined

  // === Write operations ===
  /** Add a tab to a group. Returns null if group is at MAX_TABS_PER_GROUP limit. */
  addTab: (workspace: string, tabGroupId: TabGroupId, name?: string) => Tab | null
  /** Soft-delete a tab (sets closedAt). Won't close the last tab in a group. Returns next active tab ID. */
  removeTab: (workspace: string, tabId: TabId, currentActiveId?: TabId) => TabId | undefined
  /** Reopen a closed tab */
  reopenTab: (workspace: string, tabId: TabId) => void
  /** Remove all tabs in a group (hard delete). Returns first open tab ID if any remain. */
  removeTabGroup: (workspace: string, tabGroupId: TabGroupId) => TabId | undefined
  /** Rename a tab */
  renameTab: (workspace: string, tabId: TabId, name: string) => void
  /** Save input draft for a tab */
  setTabInputDraft: (workspace: string, tabId: TabId, draft: string) => void
  /** Create a new tab group with its first tab. Always succeeds. */
  createTabGroupWithTab: (workspace: string) => { tabGroupId: TabGroupId; tabId: TabId }
  /** Open a tab group - returns existing open tab or creates new one. Always succeeds. */
  openTabGroupInTab: (workspace: string, tabGroupId: TabGroupId, name?: string) => Tab
  /** Remove old closed tabs to free up storage. Returns count of removed tabs. */
  cleanupOldTabs: (workspace: string, currentActiveId?: TabId) => number
  /** Clear all tabs for a workspace */
  clearWorkspace: (workspace: string) => void
}

type TabDataStore = TabDataStoreState & TabDataStoreActions

// ============================================================================
// Empty State
// ============================================================================

const emptyState = (): TabDataStoreState => ({
  tabsByWorkspace: {},
})

// ============================================================================
// Store
// ============================================================================

export const useTabDataStore = create<TabDataStore>()(
  persist(
    (set, get) => {
      // Internal helper to update tabs for a workspace
      const setTabs = (workspace: string, tabs: Tab[]): void => {
        set(s => ({
          tabsByWorkspace: { ...s.tabsByWorkspace, [workspace]: tabs },
        }))
      }

      return {
        ...emptyState(),

        // === Read operations ===
        getTabs: (workspace: string): Tab[] => {
          return get().tabsByWorkspace[workspace] ?? []
        },

        getOpenTabs: (workspace: string): Tab[] => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          return tabs.filter(isOpen)
        },

        getOpenTabsInGroup: (workspace: string, tabGroupId: TabGroupId): Tab[] => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          return getOpenTabsInGroup(tabs, tabGroupId)
        },

        getTab: (workspace: string, tabId: TabId): Tab | undefined => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          return findTabById(tabs, tabId)
        },

        // === Write operations ===
        addTab: (workspace, tabGroupId, name): Tab | null => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          if (getOpenTabsInGroup(tabs, tabGroupId).length >= MAX_TABS_PER_GROUP) {
            return null
          }
          const tab = createTab(tabs, tabGroupId, name)
          setTabs(workspace, [...tabs, tab])
          return tab
        },

        removeTab: (workspace, tabId, currentActiveId): TabId | undefined => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          const closingTab = findTabById(tabs, tabId)
          if (!closingTab || isClosed(closingTab)) return currentActiveId

          const groupOpenTabs = getOpenTabsInGroup(tabs, closingTab.tabGroupId)
          if (groupOpenTabs.length <= 1) return currentActiveId // Don't close the last tab in a group

          const newTabs = closeTab(tabs, tabId)
          setTabs(workspace, newTabs)

          // Calculate next active tab if we're closing the active one
          if (currentActiveId === tabId) {
            const closingIndex = groupOpenTabs.findIndex(t => t.id === tabId)
            const nextTab = findNextActiveTab(groupOpenTabs, closingIndex)
            return nextTab?.id
          }
          return currentActiveId
        },

        reopenTab: (workspace, tabId): void => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          const tab = findTabById(tabs, tabId)
          if (!tab || isOpen(tab)) return

          setTabs(workspace, reopenTabPure(tabs, tabId))
        },

        removeTabGroup: (workspace, tabGroupId): TabId | undefined => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          const remainingTabs = removeTabGroupPure(tabs, tabGroupId)
          setTabs(workspace, remainingTabs)
          return findFirstOpenTabId(remainingTabs)
        },

        renameTab: (workspace, tabId, name): void => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          setTabs(workspace, renameTabPure(tabs, tabId, name))
        },

        setTabInputDraft: (workspace, tabId, draft): void => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          setTabs(workspace, setTabDraft(tabs, tabId, draft))
        },

        createTabGroupWithTab: (workspace): { tabGroupId: TabGroupId; tabId: TabId } => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          const { tabGroupId, tab } = createTabGroup(tabs)
          setTabs(workspace, [...tabs, tab])
          return { tabGroupId, tabId: tab.id }
        },

        openTabGroupInTab: (workspace, tabGroupId, name): Tab => {
          const tabs = get().tabsByWorkspace[workspace] ?? []

          // Return existing open tab if one exists
          const existing = tabs.find(t => t.tabGroupId === tabGroupId && isOpen(t))
          if (existing) {
            return existing
          }

          // Create new tab (no global limit, always succeeds for new groups)
          const tab = createTab(tabs, tabGroupId, name)
          setTabs(workspace, [...tabs, tab])
          return tab
        },

        cleanupOldTabs: (workspace, currentActiveId): number => {
          const tabs = get().tabsByWorkspace[workspace] ?? []
          const cleaned = filterStaleTabs(tabs, currentActiveId, Date.now())
          const removed = tabs.length - cleaned.length
          if (removed > 0) {
            setTabs(workspace, cleaned)
          }
          return removed
        },

        clearWorkspace: (workspace): void => {
          setTabs(workspace, [])
        },
      }
    },
    {
      name: TAB_DATA_STORAGE_KEY,
      version: DATA_STORE_VERSION,
      skipHydration: true, // HydrationManager handles coordinated hydration
      partialize: s => ({
        tabsByWorkspace: s.tabsByWorkspace,
      }),
      migrate: (persisted, _version) => {
        // Handle completely missing or invalid data
        if (!persisted || typeof persisted !== "object") {
          return emptyState()
        }

        const state = persisted as Record<string, unknown>
        if (!state.tabsByWorkspace || typeof state.tabsByWorkspace !== "object") {
          return emptyState()
        }

        // Clean up stale tabs on hydration
        const now = Date.now()
        const tabsByWorkspace = state.tabsByWorkspace as Record<string, Tab[]>
        const cleanedTabsByWorkspace: Record<string, Tab[]> = {}

        for (const [workspace, tabs] of Object.entries(tabsByWorkspace)) {
          // No active tab known at hydration time - pass undefined
          cleanedTabsByWorkspace[workspace] = filterStaleTabs(tabs, undefined, now)
        }

        return { tabsByWorkspace: cleanedTabsByWorkspace }
      },
    },
  ),
)

// ============================================================================
// Migration Helper - Import from old tabStore
// ============================================================================

/**
 * Migrate data from the old unified tabStore to the new split stores.
 * Call this once during app initialization if old data exists.
 */
export function migrateFromLegacyTabStore(): boolean {
  // Skip if already migrated
  if (typeof window === "undefined") return false
  if (localStorage.getItem(TAB_MIGRATION_FLAG_KEY)) return false

  const oldData = localStorage.getItem(TAB_LEGACY_STORAGE_KEY)
  if (!oldData) {
    // No old data, mark as done
    localStorage.setItem(TAB_MIGRATION_FLAG_KEY, "true")
    return false
  }

  try {
    const parsed = JSON.parse(oldData)
    const state = parsed?.state

    if (state?.tabsByWorkspace && typeof state.tabsByWorkspace === "object") {
      // Import tabsByWorkspace into new data store
      const newData = {
        state: { tabsByWorkspace: state.tabsByWorkspace },
        version: DATA_STORE_VERSION,
      }
      localStorage.setItem(TAB_DATA_STORAGE_KEY, JSON.stringify(newData))
    }

    // Mark migration as done (don't delete old store yet for safety)
    localStorage.setItem(TAB_MIGRATION_FLAG_KEY, "true")
    return true
  } catch (e) {
    console.error("[TabDataStore] Migration failed:", e)
    localStorage.setItem(TAB_MIGRATION_FLAG_KEY, "true") // Don't retry on error
    return false
  }
}
