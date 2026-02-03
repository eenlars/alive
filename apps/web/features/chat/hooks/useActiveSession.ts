"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useAppHydrated } from "@/lib/stores/HydrationBoundary"
import { useIsStreamActive } from "@/lib/stores/streamingStore"
import { type Tab, useActiveTab, useTabActions, useWorkspaceTabs } from "@/lib/stores/tabStore"
import type { TabGroupId, TabId } from "@/lib/types/ids"

/**
 * ActiveSession - Single source of truth for the current chat session
 *
 * PROBLEM THIS SOLVES:
 * Previously, multiple stores tracked "active tab" independently, causing
 * race conditions when switching tabs, workspaces, or during async operations.
 *
 * SOLUTION:
 * This hook provides a single, typed interface to the active session.
 * All streaming, cancellation, and reconnection operations MUST use
 * values from this hook, not from individual stores.
 *
 * The source of truth is tabStore.activeTab because:
 * 1. Tab.id IS the Claude conversation key (no separate sessionId)
 * 2. All UI rendering uses activeTab for display
 * 3. It's synchronous (no async hydration issues)
 *
 * USAGE:
 * ```tsx
 * const session = useActiveSession(workspace)
 *
 * // For streaming operations
 * streamingActions.startStream(session.tabId)  // Tab.id = conversation key
 *
 * // For checking busy state
 * const busy = session.isStreaming
 *
 * // Guard before operations
 * if (!session.isReady) return  // Tab not yet available
 *
 * // For creating new tab groups
 * const newTabId = session.actions.startNewTabGroup()
 *
 * // For switching tabs
 * session.actions.switchTab(otherTabId)
 * ```
 */

export interface SessionActions {
  /**
   * Add a new tab to the current tabGroup.
   * Returns the new tab's ID (which is also the conversation key) or empty string if failed.
   */
  addTabToGroup: () => TabId | ""

  /**
   * Create a new tabGroup with its first tab.
   * Use this for "New Tab Group" - creates a fresh tab group.
   * Returns the new tab's ID (which is also the conversation key) or empty string if failed.
   */
  startNewTabGroup: () => TabId | ""

  /**
   * Switch to an existing tab by its ID.
   */
  switchTab: (tabId: TabId) => void
}

export interface ActiveSession {
  /**
   * The tab ID - ALSO the Claude conversation key.
   * Use this for: startStream, endStream, cancel, reconnect, Dexie keys.
   * null if no active tab exists.
   */
  tabId: TabId | null

  /**
   * The tab group ID for grouping related tabs in the sidebar.
   * null if no active tab exists.
   */
  tabGroupId: TabGroupId | null

  /**
   * Whether the session is ready for operations.
   * true when workspace has an active tab with valid tabId.
   * Guard all streaming operations with this.
   */
  isReady: boolean

  /**
   * Whether there's an active stream for this session.
   * Derived from streamingStore using the correct tabId.
   * Use this instead of useIsStreamActive() directly.
   */
  isStreaming: boolean

  /**
   * The active tab object from tabStore.
   * Use for UI rendering (name, tabNumber, etc.)
   * null if no active tab exists.
   */
  activeTab: Tab | null

  /**
   * All open tabs for this workspace.
   * Use for tab management UI.
   */
  workspaceTabs: Tab[]

  /**
   * Actions for session management.
   * Use these instead of calling store actions directly.
   */
  actions: SessionActions
}

/**
 * Hook to get the active session for a workspace.
 *
 * @param workspace - The workspace domain (e.g., "example.com")
 * @returns ActiveSession with all values derived from tabStore (single source of truth)
 */
export function useActiveSession(workspace: string | null): ActiveSession {
  const activeTab = useActiveTab(workspace)
  const workspaceTabs = useWorkspaceTabs(workspace)
  const { addTab, setActiveTab, createTabGroupWithTab } = useTabActions()
  const hasHydrated = useAppHydrated()
  const initializedWorkspaceRef = useRef<string | null>(null)

  // Initialize first tab when workspace changes and no active tab exists
  useEffect(() => {
    if (!workspace || !hasHydrated) return

    // If there's already an active tab for this workspace, consider it initialized.
    if (activeTab) {
      initializedWorkspaceRef.current = workspace
      return
    }

    const openTabs = workspaceTabs.filter(t => !t.closedAt)
    if (openTabs.length > 0) {
      // Pick the most recently created tab (newest first)
      const sortedByNewest = [...openTabs].sort((a, b) => b.createdAt - a.createdAt)
      setActiveTab(workspace, sortedByNewest[0].id)
      initializedWorkspaceRef.current = workspace
      return
    }

    // Only create a new tab group once per workspace when no open tabs exist
    if (initializedWorkspaceRef.current !== workspace) {
      initializedWorkspaceRef.current = workspace
      createTabGroupWithTab(workspace)
    }
  }, [workspace, hasHydrated, activeTab, workspaceTabs, setActiveTab, createTabGroupWithTab])

  // Tab.id IS the conversation key - no separate sessionId
  const tabId = activeTab?.id ?? null
  const tabGroupId = activeTab?.tabGroupId ?? null

  // Streaming state scoped to the active tab
  const isStreaming = useIsStreamActive(tabId)

  // Session is ready when we have a valid tab
  const isReady = tabId !== null && tabGroupId !== null

  // Action: Add a new tab to the current tabGroup
  const addTabToGroup = useCallback((): TabId | "" => {
    if (!workspace || !tabGroupId) {
      return ""
    }
    const newTab = addTab(workspace, tabGroupId)
    return newTab?.id ?? ""
  }, [workspace, tabGroupId, addTab])

  // Action: Create a new tabGroup with its first tab
  const startNewTabGroup = useCallback((): TabId | "" => {
    if (!workspace) {
      return ""
    }
    const result = createTabGroupWithTab(workspace)
    return result?.tabId ?? ""
  }, [workspace, createTabGroupWithTab])

  // Action: Switch to an existing tab by its ID
  const switchTab = useCallback(
    (targetTabId: TabId) => {
      if (!workspace) return
      setActiveTab(workspace, targetTabId)
    },
    [workspace, setActiveTab],
  )

  const actions = useMemo(
    () => ({ addTabToGroup, startNewTabGroup, switchTab }),
    [addTabToGroup, startNewTabGroup, switchTab],
  )

  return useMemo(
    () => ({
      tabId,
      tabGroupId,
      isReady,
      isStreaming,
      activeTab,
      workspaceTabs,
      actions,
    }),
    [tabId, tabGroupId, isReady, isStreaming, activeTab, workspaceTabs, actions],
  )
}

/**
 * Type guard to assert session is ready.
 * Use in callbacks where you need non-null values.
 *
 * @example
 * ```tsx
 * const session = useActiveSession(workspace)
 *
 * const handleSend = () => {
 *   if (!assertSessionReady(session)) return
 *   // session.tabId is now string (not null)
 *   streamingActions.startStream(session.tabId)
 * }
 * ```
 */
export function assertSessionReady(
  session: ActiveSession,
): session is ActiveSession & { tabId: TabId; tabGroupId: TabGroupId; isReady: true } {
  return session.isReady && session.tabId !== null && session.tabGroupId !== null
}
