"use client"

/**
 * Tab Store Facade - Unified interface for split tab stores
 *
 * This facade provides backwards-compatible access to the split tab stores:
 * - tabDataStore (localStorage): Shared tab history across browser tabs
 * - tabViewStore (sessionStorage): Per-browser-tab UI state (active tab, expanded)
 *
 * WHY SPLIT?
 * Previously, activeTabByWorkspace was stored in localStorage, causing all browser
 * tabs viewing the same workspace to share the same active tab ID. This caused
 * 409 CONVERSATION_BUSY errors when trying to use parallel browser tabs.
 *
 * Now, tab DATA (history) is shared, but tab VIEW (selection) is per-browser-tab.
 *
 * MIGRATION:
 * Old data from "claude-tab-storage" is automatically migrated to "claude-tab-data".
 * The view store starts fresh per browser tab (intentional - no stale selections).
 */

import { isClosed, isOpen, type Tab } from "@/lib/tabs/tabModel"
import type { TabGroupId, TabId } from "@/lib/types/ids"
import { migrateFromLegacyTabStore, useTabDataStore } from "./tabDataStore"
import { useTabViewStore } from "./tabViewStore"

// Re-export types and constants for backwards compatibility
export type { Tab } from "@/lib/tabs/tabModel"
export { MAX_TABS_PER_GROUP } from "@/lib/tabs/tabModel"

// Re-export stores for direct access
export { useTabDataStore } from "./tabDataStore"
export { useTabViewStore } from "./tabViewStore"

// ============================================================================
// Migration - Run once at module load
// ============================================================================

if (typeof window !== "undefined") {
  // Migrate old localStorage data to new data store
  migrateFromLegacyTabStore()
}

// ============================================================================
// Combined Actions Interface (backwards compatible)
// ============================================================================

export interface TabStoreActions {
  /** Add a tab to a group. Returns null if group is at MAX_TABS_PER_GROUP limit. */
  addTab: (workspace: string, tabGroupId: TabGroupId, name?: string) => Tab | null
  /** Soft-delete a tab (sets closedAt). Won't close the last tab in a group. */
  removeTab: (workspace: string, tabId: TabId) => void
  /** Reopen a closed tab */
  reopenTab: (workspace: string, tabId: TabId) => void
  /** Remove all tabs in a group (hard delete) */
  removeTabGroup: (workspace: string, tabGroupId: TabGroupId) => void
  /** Set the active tab for a workspace */
  setActiveTab: (workspace: string, tabId: TabId) => void
  /** Rename a tab */
  renameTab: (workspace: string, tabId: TabId, name: string) => void
  /** Toggle tabs expanded state */
  toggleTabsExpanded: (workspace: string) => void
  /** Collapse tabs and clear all tabs for workspace */
  collapseTabsAndClear: (workspace: string) => void
  /** Open a tab group - returns existing open tab or creates new one. Always succeeds. */
  openTabGroupInTab: (workspace: string, tabGroupId: TabGroupId, name?: string) => Tab
  /** Save input draft for a tab */
  setTabInputDraft: (workspace: string, tabId: TabId, draft: string) => void
  /** Create a new tab group with its first tab. Always succeeds. */
  createTabGroupWithTab: (workspace: string) => { tabGroupId: TabGroupId; tabId: TabId }
  /** Remove old closed tabs to free up storage. Returns count of removed tabs. */
  cleanupOldTabs: (workspace: string) => number
}

// ============================================================================
// Hook: useTabActions (combines both stores)
// ============================================================================

/**
 * Create stable action functions that don't change on re-render.
 * These call directly into the stores at invocation time.
 */
function createTabActions(): TabStoreActions {
  return {
    addTab: (workspace: string, tabGroupId: TabGroupId, name?: string): Tab | null => {
      const tab = useTabDataStore.getState().addTab(workspace, tabGroupId, name)
      if (tab) {
        useTabViewStore.getState().setActiveTab(workspace, tab.id)
      }
      return tab
    },

    removeTab: (workspace: string, tabId: TabId): void => {
      const currentActiveId = useTabViewStore.getState().getActiveTabId(workspace)
      const nextActiveId = useTabDataStore.getState().removeTab(workspace, tabId, currentActiveId)
      if (nextActiveId !== currentActiveId && nextActiveId) {
        useTabViewStore.getState().setActiveTab(workspace, nextActiveId)
      }
    },

    reopenTab: (workspace: string, tabId: TabId): void => {
      useTabDataStore.getState().reopenTab(workspace, tabId)
      useTabViewStore.getState().setActiveTab(workspace, tabId)
    },

    removeTabGroup: (workspace: string, tabGroupId: TabGroupId): void => {
      const viewState = useTabViewStore.getState()
      const dataState = useTabDataStore.getState()
      const currentActiveId = viewState.getActiveTabId(workspace)
      const currentTab = currentActiveId ? dataState.getTab(workspace, currentActiveId) : undefined

      const nextActiveId = dataState.removeTabGroup(workspace, tabGroupId)

      // Only update active if the removed group contained the active tab
      if (currentTab?.tabGroupId === tabGroupId) {
        if (nextActiveId) {
          viewState.setActiveTab(workspace, nextActiveId)
        } else {
          viewState.clearActiveTab(workspace)
        }
      }
    },

    setActiveTab: (workspace: string, tabId: TabId): void => {
      useTabViewStore.getState().setActiveTab(workspace, tabId)
    },

    renameTab: (workspace: string, tabId: TabId, name: string): void => {
      useTabDataStore.getState().renameTab(workspace, tabId, name)
    },

    toggleTabsExpanded: (workspace: string): void => {
      useTabViewStore.getState().toggleTabsExpanded(workspace)
    },

    collapseTabsAndClear: (workspace: string): void => {
      useTabDataStore.getState().clearWorkspace(workspace)
      useTabViewStore.getState().collapseAndClear(workspace)
    },

    openTabGroupInTab: (workspace: string, tabGroupId: TabGroupId, name?: string): Tab => {
      const tab = useTabDataStore.getState().openTabGroupInTab(workspace, tabGroupId, name)
      useTabViewStore.getState().setActiveTab(workspace, tab.id)
      return tab
    },

    setTabInputDraft: (workspace: string, tabId: TabId, draft: string): void => {
      useTabDataStore.getState().setTabInputDraft(workspace, tabId, draft)
    },

    createTabGroupWithTab: (workspace: string): { tabGroupId: TabGroupId; tabId: TabId } => {
      const result = useTabDataStore.getState().createTabGroupWithTab(workspace)
      useTabViewStore.getState().setActiveTab(workspace, result.tabId)
      return result
    },

    cleanupOldTabs: (workspace: string): number => {
      const currentActiveId = useTabViewStore.getState().getActiveTabId(workspace)
      return useTabDataStore.getState().cleanupOldTabs(workspace, currentActiveId)
    },
  }
}

// Singleton actions object (stable reference)
let _tabActions: TabStoreActions | null = null

export const useTabActions = (): TabStoreActions => {
  if (!_tabActions) {
    _tabActions = createTabActions()
  }
  return _tabActions
}

// ============================================================================
// Selectors (React hooks) - Backwards compatible
// ============================================================================

/** Get open tabs in a specific group */
export const useTabs = (workspace: string | null, tabGroupId?: string | null): Tab[] =>
  useTabDataStore(s => {
    if (!workspace || !tabGroupId) return []
    const tabs = s.tabsByWorkspace[workspace] ?? []
    return tabs.filter(t => t.tabGroupId === tabGroupId && isOpen(t))
  })

/** Get closed tabs in a specific group, most recently closed first */
export const useClosedTabs = (workspace: string | null, tabGroupId: string | null): Tab[] =>
  useTabDataStore(s => {
    if (!workspace || !tabGroupId) return []
    const tabs = s.tabsByWorkspace[workspace] ?? []
    return tabs
      .filter(t => t.tabGroupId === tabGroupId && isClosed(t))
      .sort((a, b) => (b.closedAt as number) - (a.closedAt as number))
  })

/**
 * Get the active tab for a workspace.
 * Combines data from tabDataStore (tab details) and tabViewStore (active selection).
 * Returns null if no active tab or workspace is null.
 */
export const useActiveTab = (workspace: string | null): Tab | null => {
  const activeId = useTabViewStore(s => (workspace ? s.activeTabByWorkspace[workspace] : undefined))
  const tabs = useTabDataStore(s => (workspace ? (s.tabsByWorkspace[workspace] ?? []) : []))

  if (!workspace || !activeId) return null
  const activeTab = tabs.find(t => t.id === activeId)
  if (!activeTab || isClosed(activeTab)) return null
  return activeTab
}

/** Check if tabs are expanded for a workspace */
export const useTabsExpanded = (workspace: string | null): boolean =>
  useTabViewStore(s => (workspace ? (s.tabsExpandedByWorkspace[workspace] ?? false) : false))

/** Get all open tabs for a workspace */
export const useWorkspaceTabs = (workspace: string | null): Tab[] =>
  useTabDataStore(s => (workspace ? (s.tabsByWorkspace[workspace] ?? []).filter(isOpen) : []))

/** Get all open tabs for a specific tab group across all workspaces */
export const useTabsForTabGroup = (tabGroupId: string | null): Tab[] =>
  useTabDataStore(s => {
    if (!tabGroupId) return []
    const allTabs: Tab[] = []
    for (const tabs of Object.values(s.tabsByWorkspace)) {
      allTabs.push(...tabs.filter(t => t.tabGroupId === tabGroupId && isOpen(t)))
    }
    return allTabs
  })

// ============================================================================
// Legacy Compatibility Layer
// ============================================================================

/**
 * Combined state + actions type for backwards compatibility with tests and hooks.
 */
interface LegacyTabStoreState extends TabStoreActions {
  tabsByWorkspace: Record<string, Tab[]>
  activeTabByWorkspace: Record<string, TabId | undefined>
  tabsExpandedByWorkspace: Record<string, boolean>
  /** @deprecated Kept for migration compatibility only */
  nextTabNumberByWorkspace: Record<string, number>
}

/**
 * Unified store reference for backwards compatibility.
 * Provides getState/setState for tests and hooks that used the old unified store.
 *
 * NOTE: setState only affects data stores.
 * activeTabByWorkspace is now in tabViewStore (sessionStorage) and should be
 * set via useTabActions().setActiveTab() instead.
 */
export const useTabStore = {
  // Expose persist API for store-registrations.ts compatibility
  persist: {
    rehydrate: async (): Promise<void> => {
      // Both stores handle their own rehydration
      await useTabDataStore.persist?.rehydrate?.()
      await useTabViewStore.persist?.rehydrate?.()
    },
    hasHydrated: (): boolean => {
      // Defensive: in test environment, persist may not be initialized
      const dataHydrated = useTabDataStore.persist?.hasHydrated?.() ?? false
      const viewHydrated = useTabViewStore.persist?.hasHydrated?.() ?? false
      return dataHydrated && viewHydrated
    },
  },

  /**
   * Get combined state + actions from both stores.
   * Used by tests and hooks for backwards compatibility.
   */
  getState: (): LegacyTabStoreState => {
    const dataState = useTabDataStore.getState()
    const viewState = useTabViewStore.getState()
    const actions = useTabActions()

    return {
      // State
      tabsByWorkspace: dataState.tabsByWorkspace,
      activeTabByWorkspace: viewState.activeTabByWorkspace,
      tabsExpandedByWorkspace: viewState.tabsExpandedByWorkspace,
      nextTabNumberByWorkspace: {}, // Deprecated, always empty
      // Actions
      ...actions,
    }
  },

  /**
   * Set state for backwards compatibility.
   * Routes to appropriate store based on which fields are being set.
   */
  setState: (
    partial: Partial<LegacyTabStoreState> | ((state: LegacyTabStoreState) => Partial<LegacyTabStoreState>),
  ): void => {
    const currentState = useTabStore.getState()
    const newState = typeof partial === "function" ? partial(currentState) : partial

    // Route to data store
    if (newState.tabsByWorkspace !== undefined) {
      useTabDataStore.setState({ tabsByWorkspace: newState.tabsByWorkspace })
    }

    // Route to view store
    if (newState.activeTabByWorkspace !== undefined) {
      useTabViewStore.setState({ activeTabByWorkspace: newState.activeTabByWorkspace })
    }
    if (newState.tabsExpandedByWorkspace !== undefined) {
      useTabViewStore.setState({ tabsExpandedByWorkspace: newState.tabsExpandedByWorkspace })
    }

    // Ignore nextTabNumberByWorkspace - deprecated
  },
}
