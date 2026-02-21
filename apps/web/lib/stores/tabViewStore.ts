"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type { TabId } from "@/lib/types/ids"
import { TAB_VIEW_STORAGE_KEY } from "./storage-keys"

// ============================================================================
// Store Version (increment when changing persisted shape)
// ============================================================================

const VIEW_STORE_VERSION = 1

// ============================================================================
// Browser Tab ID
// ============================================================================

/**
 * Unique identifier for this browser tab instance.
 * Generated once per browser tab (persists in sessionStorage).
 * Useful for debugging and future cross-tab coordination.
 */
let _browserTabId: string | null = null

export function getBrowserTabId(): string {
  if (typeof window === "undefined") return "server"

  if (!_browserTabId) {
    const stored = sessionStorage.getItem("claude-browser-tab-id")
    if (stored) {
      _browserTabId = stored
    } else {
      _browserTabId = crypto.randomUUID()
      sessionStorage.setItem("claude-browser-tab-id", _browserTabId)
    }
  }
  return _browserTabId
}

// ============================================================================
// Types
// ============================================================================

interface TabViewStoreState {
  /**
   * Active tab selection per workspace - ISOLATED per browser tab via sessionStorage.
   * This is the key fix for parallel tab isolation.
   */
  activeTabByWorkspace: Record<string, TabId | undefined>

  /**
   * Sidebar expansion state per workspace - ISOLATED per browser tab.
   * UI preference, doesn't need to be shared.
   */
  tabsExpandedByWorkspace: Record<string, boolean>
}

interface TabViewStoreActions {
  /** Get the active tab ID for a workspace */
  getActiveTabId: (workspace: string) => TabId | undefined

  /** Set the active tab for a workspace */
  setActiveTab: (workspace: string, tabId: TabId) => void

  /** Clear the active tab for a workspace (e.g., when all tabs are closed) */
  clearActiveTab: (workspace: string) => void

  /** Check if tabs are expanded for a workspace */
  isTabsExpanded: (workspace: string) => boolean

  /** Toggle tabs expanded state */
  toggleTabsExpanded: (workspace: string) => void

  /** Set tabs expanded state explicitly */
  setTabsExpanded: (workspace: string, expanded: boolean) => void

  /** Collapse tabs and clear active tab (used when closing all tabs) */
  collapseAndClear: (workspace: string) => void
}

type TabViewStore = TabViewStoreState & TabViewStoreActions

// ============================================================================
// Empty State
// ============================================================================

const emptyState = (): TabViewStoreState => ({
  activeTabByWorkspace: {},
  tabsExpandedByWorkspace: {},
})

// ============================================================================
// Safe sessionStorage (falls back to in-memory on server/restricted contexts)
// ============================================================================

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => {
      store.clear()
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

const memoryStorage = createMemoryStorage()

function getSafeSessionStorage(): Storage {
  try {
    if (typeof sessionStorage === "undefined") return memoryStorage
    if (typeof sessionStorage.setItem !== "function") return memoryStorage
    return sessionStorage
  } catch {
    return memoryStorage
  }
}

// ============================================================================
// Store (sessionStorage = per browser tab)
// ============================================================================

export const useTabViewStore = create<TabViewStore>()(
  persist(
    (set, get) => ({
      ...emptyState(),

      getActiveTabId: (workspace: string): TabId | undefined => {
        return get().activeTabByWorkspace[workspace]
      },

      setActiveTab: (workspace: string, tabId: TabId): void => {
        set(s => ({
          activeTabByWorkspace: { ...s.activeTabByWorkspace, [workspace]: tabId },
        }))
      },

      clearActiveTab: (workspace: string): void => {
        set(s => ({
          activeTabByWorkspace: { ...s.activeTabByWorkspace, [workspace]: undefined },
        }))
      },

      isTabsExpanded: (workspace: string): boolean => {
        return get().tabsExpandedByWorkspace[workspace] ?? false
      },

      toggleTabsExpanded: (workspace: string): void => {
        set(s => ({
          tabsExpandedByWorkspace: {
            ...s.tabsExpandedByWorkspace,
            [workspace]: !s.tabsExpandedByWorkspace[workspace],
          },
        }))
      },

      setTabsExpanded: (workspace: string, expanded: boolean): void => {
        set(s => ({
          tabsExpandedByWorkspace: { ...s.tabsExpandedByWorkspace, [workspace]: expanded },
        }))
      },

      collapseAndClear: (workspace: string): void => {
        set(s => ({
          activeTabByWorkspace: { ...s.activeTabByWorkspace, [workspace]: undefined },
          tabsExpandedByWorkspace: { ...s.tabsExpandedByWorkspace, [workspace]: false },
        }))
      },
    }),
    {
      name: TAB_VIEW_STORAGE_KEY,
      version: VIEW_STORE_VERSION,
      skipHydration: true, // HydrationManager handles coordinated hydration
      // Use sessionStorage for browser-tab isolation (not localStorage!)
      storage: createJSONStorage(() => getSafeSessionStorage()),
      partialize: s => ({
        activeTabByWorkspace: s.activeTabByWorkspace,
        tabsExpandedByWorkspace: s.tabsExpandedByWorkspace,
      }),
      migrate: (persisted, _version) => {
        // Fresh start for each browser tab - don't migrate from old data
        // This is intentional: each browser tab should start with no active selection
        if (!persisted || typeof persisted !== "object") {
          return emptyState()
        }

        // Validate structure
        const state = persisted as Record<string, unknown>
        return {
          activeTabByWorkspace:
            state.activeTabByWorkspace && typeof state.activeTabByWorkspace === "object"
              ? (state.activeTabByWorkspace as Record<string, TabId | undefined>)
              : {},
          tabsExpandedByWorkspace:
            state.tabsExpandedByWorkspace && typeof state.tabsExpandedByWorkspace === "object"
              ? (state.tabsExpandedByWorkspace as Record<string, boolean>)
              : {},
        }
      },
    },
  ),
)
