"use client"
import { SUPERADMIN } from "@webalive/shared"
import { AnimatePresence, motion } from "framer-motion"
import { PanelLeft } from "lucide-react"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import toast, { Toaster } from "react-hot-toast"
import { FeedbackModal } from "@/components/modals/FeedbackModal"
import { InviteModal } from "@/components/modals/InviteModal"
import { SessionExpiredModal } from "@/components/modals/SessionExpiredModal"
import { SettingsOverlay } from "@/components/settings/SettingsOverlay"
import { SuperTemplatesModal } from "@/components/modals/SuperTemplatesModal"
import { ChatDropOverlay } from "@/features/chat/components/ChatDropOverlay"
import { ChatInput } from "@/features/chat/components/ChatInput"
import type { ChatInputHandle } from "@/features/chat/components/ChatInput/types"
import { ConversationSidebar } from "@/features/chat/components/ConversationSidebar"
import { DevTerminal } from "@/features/chat/components/DevTerminal"
import { PendingToolsIndicator } from "@/features/chat/components/PendingToolsIndicator"
import { Sandbox } from "@/features/chat/components/Sandbox"
import { SandboxMobile } from "@/features/chat/components/SandboxMobile"
import { SubdomainInitializer } from "@/features/chat/components/SubdomainInitializer"
// useTabSession removed - now using useActiveSession via useTabIsolatedMessages
import { useBrowserCleanup } from "@/features/chat/hooks/useBrowserCleanup"
import { useImageUpload } from "@/features/chat/hooks/useImageUpload"
import { useStreamCancellation } from "@/features/chat/hooks/useStreamCancellation"
import { useStreamReconnect } from "@/features/chat/hooks/useStreamReconnect"
import { ClientRequest, DevTerminalProvider, useDevTerminal } from "@/features/chat/lib/dev-terminal-context"
import { renderMessage, shouldRenderMessage } from "@/features/chat/lib/message-renderer"
import { MessageWrapper } from "@/features/chat/components/message-renderers/MessageWrapper"
import { RetryProvider, useRetry } from "@/features/chat/lib/retry-context"
import { PanelProvider, usePanelContext } from "@/features/chat/lib/sandbox-context"
import { useAuth } from "@/features/deployment/hooks/useAuth"
import { useWorkspace } from "@/features/workspace/hooks/useWorkspace"
import { useRedeemReferral } from "@/hooks/useRedeemReferral"
import {
  useDexieCurrentConversationId,
  useDexieCurrentTabId,
  useDexieMessageActions,
  useDexieSession,
} from "@/lib/db/dexieMessageStore"
import { useOrganizations } from "@/lib/hooks/useOrganizations"
import { validateOAuthToastParams } from "@/lib/integrations/toast-validation"
import { useIsSessionExpired } from "@/lib/stores/authStore"
import { useSidebarActions, useSidebarOpen } from "@/lib/stores/conversationSidebarStore"
import { useAppHydrated } from "@/lib/stores/HydrationBoundary"
import { isDevelopment, useDebugActions, useDebugVisible, useSandbox, useSSETerminal } from "@/lib/stores/debug-store"
import { useApiKey, useModel } from "@/lib/stores/llmStore"
import { useLastSeenStreamSeq, useStreamingActions } from "@/lib/stores/streamingStore"
import { useTabActions } from "@/lib/stores/tabStore"
import { useSelectedOrgId } from "@/lib/stores/workspaceStore"
import { useQueryState } from "nuqs"
import { validateWorktreeSlug } from "@/features/workspace/lib/worktree-utils"
import { QUERY_KEYS } from "@/lib/url/queryState"
// Local components
import {
  AgentManagerIndicator,
  ChatEmptyState,
  ChatHeader,
  OfflineBanner,
  TabBar,
  WorkspaceInfoBar,
} from "./components"
import {
  useChatDragDrop,
  useChatMessaging,
  useChatScroll,
  useModals,
  useOnlineStatus,
  useStatusText,
  useTabIsolatedMessages,
  useTabsManagement,
} from "./hooks"

// Build version for deployment verification
const BUILD_VERSION = "2025-11-12-direct-execution"

function ChatPageContent() {
  const [msg, setMsg] = useState("")
  const storeTabId = useDexieCurrentTabId()
  const storeTabGroupId = useDexieCurrentConversationId()
  const {
    ensureTabGroupWithTab,
    addMessage,
    switchTab: switchDexieTab,
    archiveConversation,
    unarchiveConversation,
    renameConversation,
    setSession: setDexieSession,
  } = useDexieMessageActions()
  const dexieSession = useDexieSession()
  const { createTabGroupWithTab, removeTabGroup, setActiveTab } = useTabActions()

  // Ensures Dexie has a tabgroup+tab for the session key (tabId)
  const initializeTab = useCallback(
    (tabId: string, tabGroupId: string, targetWorkspace: string) => {
      if (!dexieSession) return
      void ensureTabGroupWithTab(targetWorkspace, tabGroupId, tabId)
    },
    [dexieSession, ensureTabGroupWithTab],
  )
  const { toggleSidebar } = useSidebarActions()
  const isSidebarOpen = useSidebarOpen()
  const isHydrated = useAppHydrated()
  const [subdomainInitialized, setSubdomainInitialized] = useState(false)
  const [_showCompletionDots, setShowCompletionDots] = useState(false)
  const modals = useModals()

  // Smart scroll using Intersection Observer
  const { containerRef, anchorRef, isScrolledAway, scrollToBottom, forceScrollToBottom } = useChatScroll({
    threshold: 100,
    debounceMs: 150,
  })

  const { user } = useAuth()
  const selectedOrgId = useSelectedOrgId()
  const _isAdmin = user?.isAdmin ?? false

  // Tabs are on by default for all users
  const showTabs = true
  const chatInputRef = useRef<ChatInputHandle | null>(null)
  const photoButtonRef = useRef<HTMLButtonElement>(null)
  const { setSSETerminal, setSSETerminalMinimized, setSandbox, setSandboxMinimized } = useDebugActions()
  const showSSETerminal = useSSETerminal()
  const showSandboxRaw = useSandbox()
  const isDebugMode = useDebugVisible()
  const { addEvent: addDevEvent } = useDevTerminal()
  const { workspace, worktree, workspaceKey, isTerminal, mounted, setWorkspace, setWorktree } = useWorkspace({
    allowEmpty: true,
  })
  const tabWorkspace = workspaceKey

  // Tab-isolated messages, busy state, and session actions from single source of truth
  const {
    messages,
    busy,
    tabId: sessionTabId,
    tabGroupId: sessionTabGroupId,
    isReady: sessionReady,
    activeTab,
    workspaceTabs,
    actions: sessionActions,
  } = useTabIsolatedMessages({ workspace: tabWorkspace })

  // Handle ?wk= URL parameter to pre-select workspace (e.g., from widget "Edit me" button)
  const [wkParam] = useQueryState(QUERY_KEYS.workspace)
  const [wtParam, setWtParam] = useQueryState(QUERY_KEYS.worktree)
  useEffect(() => {
    if (mounted && wkParam && wkParam !== workspace) {
      console.log("[ChatPage] Setting workspace from URL param:", wkParam)
      setWorkspace(wkParam)
    }
  }, [mounted, wkParam, workspace, setWorkspace])

  // Handle ?wt= URL parameter for worktree selection
  // Normalize URL param to prevent casing inconsistencies (e.g., "Feature" vs "feature")
  useEffect(() => {
    if (!mounted) return

    // Normalize and validate the URL param
    let normalizedParam: string | null = null
    if (wtParam && wtParam.length > 0) {
      const validation = validateWorktreeSlug(wtParam)
      if (validation.valid) {
        normalizedParam = validation.slug
      } else {
        // Invalid worktree in URL - clear the param
        console.warn(`[ChatPage] Invalid worktree in URL rejected: "${wtParam}" - ${validation.reason}`)
        void setWtParam(null, { shallow: true })
        return
      }
    }

    // Compare normalized values to prevent loops
    if (normalizedParam !== worktree) {
      setWorktree(normalizedParam)
    }
  }, [mounted, wtParam, worktree, setWorktree, setWtParam])

  // Sync worktree state back to URL
  useEffect(() => {
    if (!mounted) return
    const desired = worktree && worktree.length > 0 ? worktree : null
    if (wtParam !== desired) {
      void setWtParam(desired, { shallow: true })
    }
  }, [mounted, worktree, wtParam, setWtParam])

  // Sync tab ID to URL for shareable links and browser history
  const [tabParam, setTabParam] = useQueryState(QUERY_KEYS.chatTab)
  const { setActiveTab: setStoreActiveTab } = useTabActions()
  const initialTabRestored = useRef(false)
  const previousWorkspaceKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!mounted) return
    if (previousWorkspaceKeyRef.current && previousWorkspaceKeyRef.current !== tabWorkspace) {
      initialTabRestored.current = false
      if (tabParam) {
        void setTabParam(null, { shallow: true })
      }
    }
    previousWorkspaceKeyRef.current = tabWorkspace ?? null
  }, [mounted, tabWorkspace, tabParam, setTabParam])

  // On mount: if URL has a tab param, restore it (ONCE only)
  useEffect(() => {
    if (!mounted || !tabWorkspace || !dexieSession || initialTabRestored.current) return
    if (!tabParam) {
      // No tab param in URL - mark as restored so we don't try again
      initialTabRestored.current = true
      return
    }

    // Check if the tab exists and switch to it
    const allTabs = workspaceTabs
    const targetTab = allTabs.find(t => t.id === tabParam && !t.closedAt)
    if (targetTab && sessionTabId !== tabParam) {
      console.log("[ChatPage] Restoring tab from URL param:", tabParam)
      setStoreActiveTab(tabWorkspace, tabParam)
    }
    // Mark as restored whether we found the tab or not
    initialTabRestored.current = true
  }, [mounted, tabWorkspace, dexieSession, tabParam, workspaceTabs, sessionTabId, setStoreActiveTab])

  // When active tab changes, update URL (shallow, no navigation)
  useEffect(() => {
    if (!mounted || !sessionTabId || !initialTabRestored.current) return

    // Only update if different to avoid loops
    if (tabParam !== sessionTabId) {
      void setTabParam(sessionTabId, { shallow: true })
    }
  }, [mounted, sessionTabId, tabParam, setTabParam])

  // Superadmin workspace (claude-bridge) shows terminal & code views only
  const isSuperadminWorkspace = workspace === SUPERADMIN.WORKSPACE_NAME
  const showSandbox = showSandboxRaw // Show for all workspaces

  const _userApiKey = useApiKey()
  const _userModel = useModel()
  const streamingActions = useStreamingActions()
  const lastSeenStreamSeq = useLastSeenStreamSeq(sessionTabId)
  const { registerElementSelectHandler } = usePanelContext()

  // Custom hooks
  const statusText = useStatusText(busy, messages)
  const { isDragging, handleChatDragEnter, handleChatDragLeave, handleChatDragOver, handleChatDrop } = useChatDragDrop({
    chatInputRef,
  })

  // Register element selection handler to insert selected element into chat input
  useEffect(() => {
    registerElementSelectHandler(element => {
      const shortPath = element.fileName.replace(/^.*\/src\//, "src/")
      const reference = `@${element.displayName} in ${shortPath}:${element.lineNumber}`
      setMsg(prev => (prev.trim() ? `${prev} ${reference}` : reference))
      setTimeout(() => chatInputRef.current?.focus(), 0)
    })
  }, [registerElementSelectHandler])

  // Redeem referral code if stored (from invite link flow)
  useRedeemReferral()

  // Update page title with workspace name
  useEffect(() => {
    if (workspace) {
      const projectName = workspace.split(".")[0]
      const capitalized = projectName.charAt(0).toUpperCase() + projectName.slice(1)
      document.title = `${capitalized} - Alive`
    } else {
      document.title = "Alive"
    }
  }, [workspace])

  // Fetch organizations and auto-select if none selected
  const { organizations, loading: organizationsLoading } = useOrganizations()

  // Sync Dexie session once we have a user + org (required before storing messages)
  useEffect(() => {
    if (!user?.id) return

    const orgId = selectedOrgId || organizations[0]?.org_id
    if (!orgId) return

    if (dexieSession?.userId === user.id && dexieSession?.orgId === orgId) return

    setDexieSession({ userId: user.id, orgId })
  }, [user?.id, selectedOrgId, organizations, dexieSession, setDexieSession])

  // Fetch conversations from server when workspace changes
  const { syncFromServer } = useDexieMessageActions()
  useEffect(() => {
    if (!mounted || !tabWorkspace || !dexieSession) return

    // Fetch server conversations in background (non-blocking)
    void syncFromServer(tabWorkspace)
  }, [mounted, tabWorkspace, dexieSession, syncFromServer])

  // Check for session expiry
  const isSessionExpired = useIsSessionExpired()

  // Track online/offline status for user feedback
  const isOnline = useOnlineStatus()

  // Session values from useTabIsolatedMessages (single source of truth)
  // sessionTabId is the primary session key for Claude SDK (resume parameter)
  const tabId = sessionTabId
  const tabGroupId = sessionTabGroupId
  const { startNewTabGroup, switchTab } = sessionActions
  // isChatReady derives from tabStore (sessionReady) only - Dexie is for persistence, not readiness
  const isChatReady = !!dexieSession && sessionReady

  // Chat messaging hook - handles sendMessage, streaming, agent supervisor
  const {
    sendMessage,
    isEvaluatingProgress,
    agentManagerAbortRef,
    agentManagerTimeoutRef,
    abortControllerRef,
    currentRequestIdRef,
    isSubmittingByTabRef,
  } = useChatMessaging({
    workspace,
    worktree,
    tabId,
    tabGroupId,
    isTerminal,
    busy,
    msg,
    setMsg,
    addMessage,
    chatInputRef,
    forceScrollToBottom,
    setShowCompletionDots,
  })

  // Stream cancellation hook - must be after useChatMessaging to get the refs
  // Uses sessionTabId from useTabIsolatedMessages (single source of truth)
  const { stopStreaming, isStopping } = useStreamCancellation({
    tabId: sessionTabId ?? "",
    tabGroupId: sessionTabGroupId,
    workspace,
    worktree,
    addMessage,
    setShowCompletionDots,
    abortControllerRef,
    currentRequestIdRef,
    isSubmittingByTabRef,
    onDevEvent: isDevelopment()
      ? event => {
          addDevEvent({
            eventName: ClientRequest.INTERRUPT,
            event: {
              type: ClientRequest.INTERRUPT,
              requestId: currentRequestIdRef.current ?? "unknown",
              timestamp: new Date().toISOString(),
              data: event.data,
            },
            rawSSE: JSON.stringify(event),
          })
        }
      : undefined,
  })

  // Stream reconnection - recovers buffered messages when tab becomes visible
  // Uses sessionTabId from useTabIsolatedMessages (single source of truth)
  useStreamReconnect({
    tabId: sessionTabId,
    tabGroupId: sessionTabGroupId,
    workspace,
    worktree,
    isStreaming: busy,
    addMessage,
    mounted,
  })

  // Browser cleanup - sends cancel beacon when user closes tab/navigates away
  // Prevents orphaned agent processes on the server
  useBrowserCleanup({
    tabId: sessionTabId,
    tabGroupId: sessionTabGroupId,
    workspace,
    worktree,
    lastSeenStreamSeq,
    currentRequestIdRef,
    isStreaming: busy,
  })

  // Register retry handler for error recovery
  const { registerRetryHandler } = useRetry()
  useEffect(() => {
    registerRetryHandler(() => {
      // Find the last user message to retry
      const lastUserMessage = [...messages].reverse().find(m => m.type === "user")
      if (lastUserMessage && typeof lastUserMessage.content === "string") {
        // Re-send the message
        sendMessage(lastUserMessage.content)
      }
    })
  }, [messages, sendMessage, registerRetryHandler])

  // Tab management - combined switch handler for both conversation hooks
  const handleSwitchConversationForTabs = useCallback(
    (id: string) => {
      switchTab(id)
      switchDexieTab(id)
    },
    [switchTab, switchDexieTab],
  )

  const {
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
    handleOpenTabGroupInTab,
  } = useTabsManagement({
    workspace: tabWorkspace,
    tabGroupId,
    activeTabId: tabId,
    onSwitchTab: handleSwitchConversationForTabs,
    onInitializeTab: initializeTab,
    currentInput: msg,
    onInputRestore: setMsg,
  })

  // Ensure the session tab is mapped to Dexie (for message persistence)
  // activeTab is now the single source of truth from useActiveSession
  useEffect(() => {
    if (!mounted || !tabWorkspace || !dexieSession || !activeTab) return

    // Sync Dexie store if it doesn't match the active tab
    // Tab.id IS the conversation key
    if (storeTabId === activeTab.id && storeTabGroupId === activeTab.tabGroupId) return
    void ensureTabGroupWithTab(tabWorkspace, activeTab.tabGroupId, activeTab.id)
  }, [
    mounted,
    tabWorkspace,
    dexieSession,
    activeTab?.id,
    activeTab?.tabGroupId,
    ensureTabGroupWithTab,
    storeTabId,
    storeTabGroupId,
  ])

  // Image upload handler
  const handleAttachmentUpload = useImageUpload({ workspace: workspace ?? undefined, worktree, isTerminal })

  // Show SSE terminal minimized on staging
  useEffect(() => {
    console.log(`%c[Chat] BUILD VERSION: ${BUILD_VERSION}`, "color: #00ff00; font-weight: bold; font-size: 14px")
    if (isDevelopment()) {
      setSSETerminal(true)
      setSSETerminalMinimized(true)
    }
    // Only auto-open sandbox on large screens (desktops), not tablets
    if (window.innerWidth >= 1280) {
      setSandbox(true)
      setSandboxMinimized(false)
    }
  }, [setSSETerminal, setSSETerminalMinimized, setSandbox, setSandboxMinimized])

  // Calculate total domain count from organizations
  const totalDomainCount = organizations.reduce((sum, org) => sum + (org.workspace_count || 0), 0)

  // Auto-scroll to bottom when new messages arrive (unless user scrolled away)
  // Uses Intersection Observer under the hood - more reliable than scroll position math
  useEffect(() => {
    if (!isScrolledAway && messages.length > 0) {
      scrollToBottom("auto")
    }
  }, [messages, isScrolledAway, scrollToBottom])

  // Handle OAuth callback success/error params
  const urlSearchParams = typeof window !== "undefined" ? window.location.search : ""
  useEffect(() => {
    const params = new URLSearchParams(urlSearchParams)
    const validated = validateOAuthToastParams(params)

    if (validated) {
      if (validated.status === "success" && validated.successMessage) {
        toast.success(validated.successMessage)
      } else if (validated.status === "error" && validated.errorMessage) {
        toast.error(validated.errorMessage)
      }
      const cleanUrl = window.location.pathname + window.location.hash
      window.history.replaceState({}, "", cleanUrl)
    }
  }, [urlSearchParams])

  const handleSubdomainInitialize = (initialMessage: string, initialWorkspace: string) => {
    setMsg(initialMessage)
    if (initialWorkspace) {
      setWorkspace(initialWorkspace)
    }
  }

  const handleSubdomainInitialized = () => {
    setSubdomainInitialized(true)
  }

  const handleNewTabGroup = useCallback(async () => {
    if (!tabWorkspace) return

    const previousTabId = tabId
    // startNewTabGroup creates a new tabGroup + first tab in tabStore
    const newTabId = startNewTabGroup()
    if (!newTabId) {
      toast.error("Tab limit reached. Close a tab to open a new one.", { id: "tab-limit" })
      return
    }

    if (previousTabId) {
      streamingActions.clearTab(previousTabId)
    }
    setMsg("")
    setTimeout(() => chatInputRef.current?.focus(), 0)
  }, [tabId, streamingActions, startNewTabGroup, tabWorkspace])

  const handleInsertTemplate = useCallback((prompt: string) => {
    setMsg(prompt)
  }, [])

  const handleTabGroupSelect = useCallback(
    (selectedTabGroupId: string) => {
      if (!selectedTabGroupId) return
      handleOpenTabGroupInTab(selectedTabGroupId)
    },
    [handleOpenTabGroupInTab],
  )

  const handleArchiveTabGroup = useCallback(
    async (tabGroupIdToArchive: string) => {
      if (!tabGroupIdToArchive) return

      const nextTab =
        tabGroupIdToArchive === tabGroupId
          ? (workspaceTabs.find(tab => tab.tabGroupId !== tabGroupIdToArchive) ?? null)
          : null

      await archiveConversation(tabGroupIdToArchive)
      if (tabWorkspace) {
        removeTabGroup(tabWorkspace, tabGroupIdToArchive)
      }

      if (tabGroupIdToArchive === tabGroupId && tabWorkspace) {
        if (nextTab) {
          setActiveTab(tabWorkspace, nextTab.id)
          switchTab(nextTab.id)
          await ensureTabGroupWithTab(tabWorkspace, nextTab.tabGroupId, nextTab.id)
        } else {
          // Create a new tab group when archiving the current one
          const created = createTabGroupWithTab(tabWorkspace)
          if (created) {
            await ensureTabGroupWithTab(tabWorkspace, created.tabGroupId, created.tabId)
          }
        }
        setMsg("")
      }
    },
    [
      archiveConversation,
      tabGroupId,
      workspaceTabs,
      tabWorkspace,
      removeTabGroup,
      setActiveTab,
      switchTab,
      ensureTabGroupWithTab,
      createTabGroupWithTab,
    ],
  )

  const handleRenameTabGroup = useCallback(
    async (tabGroupIdToRename: string, title: string) => {
      if (!tabGroupIdToRename || !title.trim()) return
      await renameConversation(tabGroupIdToRename, title)
    },
    [renameConversation],
  )

  const handleUnarchiveTabGroup = useCallback(
    async (tabGroupIdToUnarchive: string) => {
      if (!tabGroupIdToUnarchive) return
      await unarchiveConversation(tabGroupIdToUnarchive)
    },
    [unarchiveConversation],
  )

  return (
    <div
      className="h-[100dvh] flex flex-row overflow-hidden dark:bg-[#1a1a1a] dark:text-white"
      data-testid={mounted && workspace ? "workspace-ready" : "workspace-loading"}
      data-chat-ready={isChatReady}
    >
      <ConversationSidebar
        workspace={tabWorkspace}
        activeTabGroupId={sessionTabGroupId}
        onTabGroupSelect={handleTabGroupSelect}
        onArchiveTabGroup={handleArchiveTabGroup}
        onUnarchiveTabGroup={handleUnarchiveTabGroup}
        onRenameTabGroup={handleRenameTabGroup}
        onNewConversation={handleNewTabGroup}
        onOpenSettings={modals.openSettings}
        onOpenInvite={modals.openInvite}
      />

      {!isSidebarOpen && (
        <button
          type="button"
          onClick={toggleSidebar}
          suppressHydrationWarning={true}
          className="fixed top-[6px] left-3 z-40 inline-flex items-center justify-center size-10 rounded-xl text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:bg-black/[0.12] dark:active:bg-white/[0.12] active:scale-95 transition-all duration-150 ease-out"
          aria-label="Open tab groups"
        >
          <PanelLeft size={18} strokeWidth={1.75} />
        </button>
      )}

      <div
        className="flex-1 flex flex-col overflow-hidden relative min-w-0"
        role="application"
        aria-label="Chat area"
        onDragEnter={handleChatDragEnter}
        onDragLeave={handleChatDragLeave}
        onDragOver={handleChatDragOver}
        onDrop={handleChatDrop}
      >
        <OfflineBanner isOnline={isOnline} />
        <ChatDropOverlay isDragging={isDragging} />
        <Suspense fallback={null}>
          <SubdomainInitializer
            onInitialize={handleSubdomainInitialize}
            onInitialized={handleSubdomainInitialized}
            isInitialized={subdomainInitialized}
            isMounted={mounted}
          />
        </Suspense>
        <div className="flex-1 min-h-0 flex flex-col">
          <ChatHeader
            isSuperadminWorkspace={isSuperadminWorkspace}
            onFeedbackClick={modals.openFeedback}
            onTemplatesClick={modals.openTemplates}
            onSettingsClick={modals.openSettings}
            showPhotoMenu={modals.photoMenu}
            onPhotoMenuToggle={modals.togglePhotoMenu}
            onPhotoMenuClose={modals.closePhotoMenu}
            photoButtonRef={photoButtonRef}
            chatInputRef={chatInputRef}
          />

          <WorkspaceInfoBar
            workspace={workspace}
            worktree={worktree}
            mounted={mounted}
            isTerminal={isTerminal}
            isSuperadminWorkspace={isSuperadminWorkspace}
            onSelectSite={() => modals.openSettings("websites")}
            onNewTabGroup={handleNewTabGroup}
            onMobilePreview={modals.openMobilePreview}
            onSelectWorktree={setWorktree}
            onToggleTabs={handleToggleTabs}
            showTabsToggle={showTabs && !!workspace}
            tabsExpanded={tabsExpanded}
          />

          {/* Tabs - shown when there are tabs, or when there are closed tabs to reopen */}
          {showTabs && (tabs.length > 0 || closedTabs.length > 0) && (
            <TabBar
              tabs={tabs}
              closedTabs={closedTabs}
              activeTabId={activeTabInGroup?.id ?? null}
              onTabSelect={handleTabSelect}
              onTabClose={handleTabClose}
              onTabRename={handleTabRename}
              onTabReopen={handleTabReopen}
              onAddTab={handleAddTab}
            />
          )}

          {/* Messages */}
          <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2">
            <div className="p-4 mx-auto w-full md:max-w-[calc(42rem+2rem)] min-w-0">
              {messages.length === 0 && !busy && (
                <ChatEmptyState
                  workspace={workspace}
                  totalDomainCount={totalDomainCount}
                  isLoading={organizationsLoading}
                  onTemplatesClick={modals.openTemplates}
                />
              )}

              {messages
                .filter(message => {
                  // Hide "compacting" indicator once compaction completes (compact_boundary exists)
                  if (message.type === "compacting" && messages.some(m => m.type === "compact_boundary")) {
                    return false
                  }
                  return shouldRenderMessage(message, isDebugMode)
                })
                .map((message, index, filteredMessages) => {
                  const content = renderMessage(message, { onSubmitAnswer: sendMessage })
                  // Skip rendering wrapper if component returns null
                  if (!content) return null

                  // Determine if this message can be deleted:
                  // - Must have a previous assistant message with UUID to resume from
                  // - Only user messages and assistant messages with visible content can be deleted
                  const canDelete =
                    sessionTabId != null &&
                    index > 0 &&
                    (message.type === "user" || message.type === "sdk_message") &&
                    // Check if there's any previous assistant message with a UUID
                    filteredMessages
                      .slice(0, index)
                      .some(m => {
                        if (m.type !== "sdk_message") return false
                        const sdkContent = m.content as { type?: string; uuid?: string }
                        return sdkContent?.type === "assistant" && !!sdkContent?.uuid
                      })

                  return (
                    <MessageWrapper
                      key={message.id}
                      messageId={message.id}
                      tabId={sessionTabId ?? ""}
                      canDelete={canDelete}
                    >
                      {content}
                    </MessageWrapper>
                  )
                })}

              {/* Show pending tools (currently executing) - replaces generic "thinking" when tools are running */}
              {/* Suppress "thinking" during context compaction (compacting without compact_boundary) */}
              <PendingToolsIndicator
                tabId={sessionTabId}
                suppressThinking={
                  messages.some(m => m.type === "compacting") && !messages.some(m => m.type === "compact_boundary")
                }
              />

              <AgentManagerIndicator
                isEvaluating={isEvaluatingProgress}
                message={msg}
                workspace={workspace}
                agentManagerAbortRef={agentManagerAbortRef}
                agentManagerTimeoutRef={agentManagerTimeoutRef}
                onCancel={() => {
                  if (msg.startsWith("agentmanager>")) setMsg("")
                  // isEvaluatingProgress is managed by useChatMessaging hook
                }}
              />

              {/* Scroll anchor - Intersection Observer watches this to detect if user is at bottom */}
              <div ref={anchorRef} className="h-px" />
            </div>
          </div>

          {/* Input */}
          <div className="relative mx-auto w-full md:max-w-2xl">
            {/* Jump to bottom button - positioned above input, transparent background */}
            {isHydrated && (
              <AnimatePresence>
                {isScrolledAway && messages.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 right-0 bottom-full mb-2 z-10 flex justify-center pointer-events-none"
                  >
                    <button
                      type="button"
                      onClick={() => forceScrollToBottom()}
                      className="pointer-events-auto px-3 py-1.5 rounded-full bg-black/80 dark:bg-white/90 text-white dark:text-black text-sm font-medium shadow-lg hover:bg-black dark:hover:bg-white transition-colors active:scale-95"
                    >
                      ↓ New messages
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            <ChatInput
              ref={chatInputRef}
              message={msg}
              setMessage={setMsg}
              busy={busy}
              isReady={isChatReady && !!workspace}
              isStopping={isStopping}
              onSubmit={sendMessage}
              onStop={stopStreaming}
              onOpenTemplates={modals.openTemplates}
              config={{
                enableAttachments: true,
                enableCamera: true,
                maxAttachments: 5,
                maxFileSize: 20 * 1024 * 1024,
                workspace: workspace ?? undefined,
                worktree,
                placeholder:
                  !workspace && mounted && !organizationsLoading
                    ? "Select a site to start chatting..."
                    : "Tell me what to change...",
                onAttachmentUpload: handleAttachmentUpload,
              }}
            />
          </div>
        </div>
      </div>

      {/* Side panel sandbox - desktop only */}
      {isHydrated && (
        <AnimatePresence>
          {showSandbox && (
            <motion.div
              key="desktop-sandbox"
              initial={{ width: 0 }}
              animate={{ width: "auto" }}
              exit={{ width: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="hidden md:flex h-full overflow-hidden"
            >
              <Sandbox />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Mobile preview overlay - not shown for claude-bridge workspace */}
      {isHydrated && (
        <AnimatePresence>
          {modals.mobilePreview && !isSuperadminWorkspace && (
            <SandboxMobile
              onClose={modals.closeMobilePreview}
              busy={busy}
              statusText={statusText}
              onStop={stopStreaming}
            >
              <ChatInput
                ref={chatInputRef}
                message={msg}
                setMessage={setMsg}
                busy={busy}
                isReady={isChatReady && !!workspace}
                isStopping={isStopping}
                onSubmit={sendMessage}
                onStop={stopStreaming}
                hideToolbar
                config={{
                  enableAttachments: true,
                  enableCamera: false,
                  maxAttachments: 5,
                  maxFileSize: 20 * 1024 * 1024,
                  workspace: workspace ?? undefined,
                  worktree,
                  placeholder: "Tell me what to change...",
                  onAttachmentUpload: handleAttachmentUpload,
                }}
              />
            </SandboxMobile>
          )}
        </AnimatePresence>
      )}

      {showSSETerminal && <DevTerminal />}
      {modals.feedback && (
        <FeedbackModal
          onClose={modals.closeFeedback}
          workspace={workspace ?? undefined}
          conversationId={tabId ?? undefined}
        />
      )}
      {modals.settings && (
        <SettingsOverlay
          onClose={modals.closeSettings}
          initialTab={modals.settings === "websites" ? "websites" : undefined}
        />
      )}
      {modals.templates && (
        <SuperTemplatesModal onClose={modals.closeTemplates} onInsertTemplate={handleInsertTemplate} />
      )}
      {modals.invite && <InviteModal onClose={modals.closeInvite} />}
      {isSessionExpired && <SessionExpiredModal />}
    </div>
  )
}

function ChatPageWrapper() {
  return (
    <RetryProvider>
      <DevTerminalProvider>
        <PanelProvider>
          <ChatPageContent />
        </PanelProvider>
      </DevTerminalProvider>
    </RetryProvider>
  )
}

export default function ChatPage() {
  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 5000,
          error: {
            className:
              "!bg-red-50 !text-red-900 !border !border-red-200 dark:!bg-red-950/90 dark:!text-red-100 dark:!border-red-800/50",
            iconTheme: { primary: "#dc2626", secondary: "#fff" },
          },
        }}
      />
      <Suspense fallback={null}>
        <ChatPageWrapper />
      </Suspense>
    </>
  )
}
