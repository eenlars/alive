"use client"

import { useCallback, useEffect, useRef } from "react"
import toast from "react-hot-toast"
import { useDexieMessageActions } from "@/lib/db/dexieMessageStore"
import { clearAbortController, getAbortController, useStreamingActions } from "@/lib/stores/streamingStore"
import {
  useActiveTab,
  useClosedTabs,
  useTabActions,
  useTabDataStore,
  useTabs,
  useTabsExpanded,
  useTabViewStore,
} from "@/lib/stores/tabStore"

interface UseTabsOptions {
  workspace: string | null
  tabGroupId: string | null
  /** Active tab's ID (also the Claude conversation key) */
  activeTabId: string | null
  onSwitchTab: (tabId: string) => void
  onInitializeTab: (tabId: string, tabGroupId: string, workspace: string) => void
  /** Current input message - used to save draft on tab switch */
  currentInput?: string
  /** Callback to restore input when switching tabs */
  onInputRestore?: (input: string) => void
}

/**
 * Hook for managing tabs within a tab group
 *
 * Each tab has a unique ID that is also the Claude conversation key.
 * Switching tabs switches conversations.
 * Closed tabs are removed from the bar but tab groups stay in sidebar history.
 */
export function useTabsManagement({
  workspace,
  tabGroupId,
  activeTabId,
  onSwitchTab,
  onInitializeTab,
  currentInput,
  onInputRestore,
}: UseTabsOptions) {
  const tabs = useTabs(workspace, tabGroupId)
  const closedTabs = useClosedTabs(workspace, tabGroupId)
  const activeTab = useActiveTab(workspace)
  const activeTabInGroup = tabs.find(t => t.id === activeTab?.id) ?? tabs[0] ?? null
  const tabsExpanded = useTabsExpanded(workspace)
  const {
    addTab,
    removeTab,
    reopenTab,
    setActiveTab,
    renameTab,
    toggleTabsExpanded,
    collapseTabsAndClear,
    openTabGroupInTab,
    setTabInputDraft,
  } = useTabActions()
  const { reopenTab: dexieReopenTab, loadTabMessages } = useDexieMessageActions()
  const streamingActions = useStreamingActions()
  const notifyTabLimit = useCallback(() => {
    toast.error("Tab limit reached. Close a tab to open a new one.", { id: "tab-limit" })
  }, [])

  // Workspace-scoped action wrapper
  const withWorkspace = useCallback(
    <T extends unknown[], R>(fn: (ws: string, ...args: T) => R) =>
      (...args: T): R | undefined =>
        workspace ? fn(workspace, ...args) : undefined,
    [workspace],
  )

  const handleAddTab = useCallback(() => {
    if (!workspace || !tabGroupId) return

    // Save current input to active tab before creating new tab
    if (activeTabInGroup && currentInput !== undefined) {
      setTabInputDraft(workspace, activeTabInGroup.id, currentInput)
    }

    // Tab.id IS the conversation key - no separate sessionId
    const tab = addTab(workspace, tabGroupId)
    if (!tab) {
      notifyTabLimit()
      return
    }
    if (tab) {
      onInitializeTab(tab.id, tabGroupId, workspace)
      onSwitchTab(tab.id)
      // Clear input for new tab
      if (onInputRestore) {
        onInputRestore("")
      }
    }
  }, [
    workspace,
    tabGroupId,
    activeTabInGroup,
    currentInput,
    addTab,
    onInitializeTab,
    onSwitchTab,
    setTabInputDraft,
    onInputRestore,
  ])

  const handleTabSelect = useCallback(
    (tabId: string) => {
      const tab = tabs.find(t => t.id === tabId)
      if (tab && workspace) {
        // Save current input to the previous tab before switching
        if (activeTabInGroup && currentInput !== undefined) {
          setTabInputDraft(workspace, activeTabInGroup.id, currentInput)
        }

        setActiveTab(workspace, tabId)
        onSwitchTab(tab.id)

        // Restore input from the new tab's draft
        if (onInputRestore) {
          onInputRestore(tab.inputDraft ?? "")
        }
      }
    },
    [tabs, workspace, activeTabInGroup, currentInput, setActiveTab, onSwitchTab, setTabInputDraft, onInputRestore],
  )

  const handleTabClose = useCallback(
    (tabId: string) => {
      // Find the tab being closed - tab.id IS the conversation key
      const closingTab = tabs.find(t => t.id === tabId)
      if (closingTab) {
        // Abort the HTTP request if there's an active stream
        const abortController = getAbortController(closingTab.id)
        if (abortController) {
          console.log(`[TabClose] Aborting stream for tab ${tabId}`)
          abortController.abort()
          clearAbortController(closingTab.id)
        }
        // End any active stream for this tab to prevent orphaned busy state
        streamingActions.endStream(closingTab.id)
      }
      if (!workspace) return
      removeTab(workspace, tabId)

      // Proactively switch to the new active tab to prevent effect cascades.
      const newActiveId = useTabViewStore.getState().activeTabByWorkspace[workspace]
      if (newActiveId && newActiveId !== tabId) {
        const allTabs = useTabDataStore.getState().tabsByWorkspace[workspace] ?? []
        const newActiveTab = allTabs.find((t: { id: string }) => t.id === newActiveId)
        if (newActiveTab) {
          onSwitchTab(newActiveTab.id)
          if (onInputRestore) {
            onInputRestore(newActiveTab.inputDraft ?? "")
          }
        }
      }
    },
    [tabs, workspace, streamingActions, removeTab, onSwitchTab, onInputRestore],
  )

  const handleTabRename = useCallback(
    (tabId: string, name: string) => withWorkspace(renameTab)(tabId, name),
    [withWorkspace, renameTab],
  )

  const handleToggleTabs = useCallback(() => withWorkspace(toggleTabsExpanded)(), [withWorkspace, toggleTabsExpanded])

  const handleCollapseTabsAndClear = useCallback(
    () => withWorkspace(collapseTabsAndClear)(),
    [withWorkspace, collapseTabsAndClear],
  )

  const handleTabReopen = useCallback(
    (tabId: string) => {
      if (!workspace) return
      reopenTab(workspace, tabId)
      void dexieReopenTab(tabId)

      // Ensure tabs are expanded so the reopened tab is visible
      if (!tabsExpanded) {
        toggleTabsExpanded(workspace)
      }

      // Find the tab and switch to it - tab.id IS the conversation key
      const tab = closedTabs.find(t => t.id === tabId)
      if (tab) {
        onSwitchTab(tab.id)
        onInitializeTab(tab.id, tab.tabGroupId, workspace)
        // loadTabMessages expects the tab ID (which is the conversation key)
        void loadTabMessages(tab.id)
        if (onInputRestore) {
          onInputRestore(tab.inputDraft ?? "")
        }
      }
    },
    [
      workspace,
      closedTabs,
      tabsExpanded,
      reopenTab,
      dexieReopenTab,
      loadTabMessages,
      toggleTabsExpanded,
      onSwitchTab,
      onInitializeTab,
      onInputRestore,
    ],
  )

  const handleOpenTabGroupInTab = useCallback(
    (targetTabGroupId: string, name?: string) => {
      if (!workspace) return

      // Save current input to active tab before opening tab group in new/existing tab
      if (activeTabInGroup && currentInput !== undefined) {
        setTabInputDraft(workspace, activeTabInGroup.id, currentInput)
      }

      const tab = openTabGroupInTab(workspace, targetTabGroupId, name)
      if (!tab) {
        notifyTabLimit()
        return
      }
      if (tab) {
        onInitializeTab(tab.id, tab.tabGroupId, workspace)
        onSwitchTab(tab.id)
        // Restore input from the tab's draft (empty for new tabs)
        if (onInputRestore) {
          onInputRestore(tab.inputDraft ?? "")
        }
      }
    },
    [
      workspace,
      activeTabInGroup,
      currentInput,
      openTabGroupInTab,
      onSwitchTab,
      onInitializeTab,
      setTabInputDraft,
      onInputRestore,
    ],
  )

  // Sync when active tab changes (e.g., after tab close)
  const prevActiveTabRef = useRef<typeof activeTab>(null)
  useEffect(() => {
    const prevActiveTab = prevActiveTabRef.current
    prevActiveTabRef.current = activeTabInGroup

    // Only sync if the activeTab itself changed
    if (activeTabInGroup && prevActiveTab?.id !== activeTabInGroup.id && activeTabInGroup.id !== activeTabId) {
      onSwitchTab(activeTabInGroup.id)
      // Restore input from the new active tab
      if (onInputRestore) {
        onInputRestore(activeTabInGroup.inputDraft ?? "")
      }
    }
  }, [activeTabInGroup, activeTabId, onSwitchTab, onInputRestore])

  // Auto-create first tab when tabs expanded but empty
  useEffect(() => {
    if (workspace && tabsExpanded && tabs.length === 0 && tabGroupId && activeTabId) {
      const newTab = addTab(workspace, tabGroupId) // Name auto-generated as "Tab N"
      if (newTab) {
        onInitializeTab(newTab.id, tabGroupId, workspace)
      }
    }
  }, [workspace, tabsExpanded, tabs.length, tabGroupId, activeTabId, addTab, onInitializeTab])

  // Ensure store active tab belongs to current tabgroup
  useEffect(() => {
    if (!workspace || !tabGroupId || tabs.length === 0) return
    if (!activeTabInGroup) {
      setActiveTab(workspace, tabs[0].id)
    }
  }, [workspace, tabGroupId, tabs, activeTabInGroup, setActiveTab])

  return {
    tabs,
    closedTabs,
    activeTab: activeTabInGroup,
    tabsExpanded,
    handleAddTab,
    handleTabSelect,
    handleTabClose,
    handleTabRename,
    handleTabReopen,
    handleToggleTabs,
    handleCollapseTabsAndClear,
    handleOpenTabGroupInTab,
  }
}
