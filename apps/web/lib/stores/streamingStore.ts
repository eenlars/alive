"use client"

import { create } from "zustand"

/**
 * Per-tab abort controllers (stored outside Zustand because AbortController isn't serializable)
 * This enables independent stream cancellation when tabs are enabled.
 */
const abortControllerMap = new Map<string, AbortController>()

/** Get the abort controller for a tab */
export function getAbortController(tabId: string): AbortController | undefined {
  return abortControllerMap.get(tabId)
}

/** Set the abort controller for a tab */
export function setAbortController(tabId: string, controller: AbortController | null): void {
  if (controller) {
    abortControllerMap.set(tabId, controller)
  } else {
    abortControllerMap.delete(tabId)
  }
}

/** Clear the abort controller for a tab */
export function clearAbortController(tabId: string): void {
  abortControllerMap.delete(tabId)
}

/**
 * Streaming State Store - Manages per-conversation streaming state
 *
 * **IMPORTANT**: This store is IN-MEMORY ONLY (not persisted).
 * - Streaming state only matters during active streams
 * - Tool mappings, errors, and health metrics are ephemeral
 * - On page refresh, messages are restored from Dexie (IndexedDB); streaming state resets (correct behavior)
 *
 * Solves brittleness issues:
 * 1. Per-conversation toolUseMap (not global) - no collisions across conversations
 * 2. Parse error tracking with recovery thresholds - per-conversation error state
 * 3. Session ID validation - validate session IDs per conversation
 * 4. Stream health metrics - track message count, timing
 * 5. Proper cleanup on conversation end
 *
 * Pattern follows Zustand Guide §14.1-14.3:
 * - State + Actions separation (actions in stable object)
 * - Atomic selectors (single-value hooks)
 * - Scoped per conversation (no global state leaks)
 */

export interface StreamingError {
  type: "parse_error" | "reader_error" | "timeout_error" | "invalid_event_structure" | "critical_error"
  timestamp: number
  message: string
  linePreview?: string
}

/** Pending tool execution state */
export interface PendingTool {
  toolUseId: string
  toolName: string
  toolInput: unknown
  startedAt: number
  elapsedSeconds: number // Updated by tool_progress events
}

export interface TabStreamState {
  // Tool use tracking (per-tab, not global)
  toolUseMap: Map<string, string>
  // Tool input tracking - stores the input for each tool_use_id
  toolInputMap: Map<string, unknown>
  // Pending tools - tools that have started but not completed
  pendingTools: Map<string, PendingTool>

  // Error recovery
  consecutiveParseErrors: number
  recentErrors: StreamingError[]
  maxRecentErrors: number

  // Session validation
  lastValidSessionId: string | null
  sessionValidatedAt: number | null

  // Stream health
  isStreamActive: boolean
  lastMessageReceivedAt: number | null
  messagesReceivedInStream: number
}

export interface StreamingStoreState {
  // Map of tabId -> StreamingState
  tabs: Record<string, TabStreamState>

  // Actions
  actions: {
    // Initialize or get tab state
    getTabState: (tabId: string) => TabStreamState

    // Tool use tracking
    recordToolUse: (tabId: string, toolUseId: string, toolName: string, toolInput?: unknown) => void
    getToolName: (tabId: string, toolUseId: string) => string | undefined
    getToolInput: (tabId: string, toolUseId: string) => unknown | undefined
    clearToolUseMap: (tabId: string) => void

    // Pending tool tracking (tools in progress)
    markToolPending: (tabId: string, toolUseId: string, toolName: string, toolInput: unknown) => void
    updateToolProgress: (tabId: string, toolUseId: string, elapsedSeconds: number) => void
    markToolComplete: (tabId: string, toolUseId: string) => void
    getPendingTools: (tabId: string) => PendingTool[]

    // Error tracking
    recordError: (tabId: string, error: Omit<StreamingError, "timestamp">) => void
    resetConsecutiveErrors: (tabId: string) => void
    incrementConsecutiveErrors: (tabId: string) => void
    getConsecutiveErrors: (tabId: string) => number

    // Session tracking
    recordSessionId: (tabId: string, sessionId: string) => void
    getLastSessionId: (tabId: string) => string | null

    // Stream health
    startStream: (tabId: string) => void
    recordMessageReceived: (tabId: string) => void
    endStream: (tabId: string) => void
    getStreamHealth: (tabId: string) => {
      isActive: boolean
      messageCount: number
      timeSinceLastMessage: number | null
    }

    // Cleanup
    clearTab: (tabId: string) => void
    clearAllTabs: () => void
  }
}

const defaultTabState: TabStreamState = {
  toolUseMap: new Map(),
  toolInputMap: new Map(),
  pendingTools: new Map(),
  consecutiveParseErrors: 0,
  recentErrors: [],
  maxRecentErrors: 10,
  lastValidSessionId: null,
  sessionValidatedAt: null,
  isStreamActive: false,
  lastMessageReceivedAt: null,
  messagesReceivedInStream: 0,
}

export const useStreamingStore = create<StreamingStoreState>((set, get) => {
  // Helper: Update a tab's state without boilerplate
  const updateTab = (tabId: string, updates: Partial<TabStreamState>): void => {
    set(s => ({
      tabs: {
        ...s.tabs,
        [tabId]: {
          ...(s.tabs[tabId] || defaultTabState),
          ...updates,
        },
      },
    }))
  }

  return {
    tabs: {},

    actions: {
      getTabState: (tabId: string): TabStreamState => {
        const state = get()
        const existing = state.tabs[tabId]
        if (!existing) {
          updateTab(tabId, defaultTabState)
          return { ...defaultTabState }
        }
        return existing
      },

      recordToolUse: (tabId: string, toolUseId: string, toolName: string, toolInput?: unknown): void => {
        const state = get()
        const tabState = state.tabs[tabId] || { ...defaultTabState }
        const newToolUseMap = new Map(tabState.toolUseMap)
        newToolUseMap.set(toolUseId, toolName)
        const newToolInputMap = new Map(tabState.toolInputMap)
        if (toolInput !== undefined) {
          newToolInputMap.set(toolUseId, toolInput)
        }
        updateTab(tabId, { toolUseMap: newToolUseMap, toolInputMap: newToolInputMap })
      },

      getToolName: (tabId: string, toolUseId: string): string | undefined => {
        const state = get()
        return state.tabs[tabId]?.toolUseMap.get(toolUseId)
      },

      getToolInput: (tabId: string, toolUseId: string): unknown | undefined => {
        const state = get()
        return state.tabs[tabId]?.toolInputMap.get(toolUseId)
      },

      clearToolUseMap: (tabId: string): void => {
        updateTab(tabId, { toolUseMap: new Map(), toolInputMap: new Map() })
      },

      markToolPending: (tabId: string, toolUseId: string, toolName: string, toolInput: unknown): void => {
        const state = get()
        const tabState = state.tabs[tabId] || { ...defaultTabState }
        const newPendingTools = new Map(tabState.pendingTools)
        newPendingTools.set(toolUseId, {
          toolUseId,
          toolName,
          toolInput,
          startedAt: Date.now(),
          elapsedSeconds: 0,
        })
        updateTab(tabId, { pendingTools: newPendingTools })
      },

      updateToolProgress: (tabId: string, toolUseId: string, elapsedSeconds: number): void => {
        const state = get()
        const tabState = state.tabs[tabId]
        if (!tabState) return
        const existing = tabState.pendingTools.get(toolUseId)
        if (!existing) return
        const newPendingTools = new Map(tabState.pendingTools)
        newPendingTools.set(toolUseId, { ...existing, elapsedSeconds })
        updateTab(tabId, { pendingTools: newPendingTools })
      },

      markToolComplete: (tabId: string, toolUseId: string): void => {
        const state = get()
        const tabState = state.tabs[tabId]
        if (!tabState) return
        const newPendingTools = new Map(tabState.pendingTools)
        newPendingTools.delete(toolUseId)
        updateTab(tabId, { pendingTools: newPendingTools })
      },

      getPendingTools: (tabId: string): PendingTool[] => {
        const state = get()
        const tabState = state.tabs[tabId]
        if (!tabState) return []
        return Array.from(tabState.pendingTools.values())
      },

      recordError: (tabId: string, error: Omit<StreamingError, "timestamp">): void => {
        const state = get()
        const tabState = state.tabs[tabId] || { ...defaultTabState }
        const newError: StreamingError = {
          ...error,
          timestamp: Date.now(),
        }
        const recentErrors = [newError, ...tabState.recentErrors].slice(0, tabState.maxRecentErrors)
        updateTab(tabId, { recentErrors })
      },

      resetConsecutiveErrors: (tabId: string): void => {
        updateTab(tabId, { consecutiveParseErrors: 0 })
      },

      incrementConsecutiveErrors: (tabId: string): void => {
        const state = get()
        const tabState = state.tabs[tabId] || { ...defaultTabState }
        updateTab(tabId, {
          consecutiveParseErrors: tabState.consecutiveParseErrors + 1,
        })
      },

      getConsecutiveErrors: (tabId: string): number => {
        const state = get()
        return state.tabs[tabId]?.consecutiveParseErrors || 0
      },

      recordSessionId: (tabId: string, sessionId: string): void => {
        updateTab(tabId, {
          lastValidSessionId: sessionId,
          sessionValidatedAt: Date.now(),
        })
      },

      getLastSessionId: (tabId: string): string | null => {
        const state = get()
        return state.tabs[tabId]?.lastValidSessionId || null
      },

      startStream: (tabId: string): void => {
        updateTab(tabId, {
          isStreamActive: true,
          messagesReceivedInStream: 0,
        })
      },

      recordMessageReceived: (tabId: string): void => {
        const state = get()
        const tabState = state.tabs[tabId] || { ...defaultTabState }
        updateTab(tabId, {
          lastMessageReceivedAt: Date.now(),
          messagesReceivedInStream: tabState.messagesReceivedInStream + 1,
        })
      },

      endStream: (tabId: string): void => {
        // Clear pending tools when stream ends (handles cancel, error, completion)
        updateTab(tabId, { isStreamActive: false, pendingTools: new Map() })
      },

      getStreamHealth: (
        tabId: string,
      ): { isActive: boolean; messageCount: number; timeSinceLastMessage: number | null } => {
        const state = get()
        const tabState = state.tabs[tabId]
        if (!tabState) {
          return { isActive: false, messageCount: 0, timeSinceLastMessage: null }
        }
        return {
          isActive: tabState.isStreamActive,
          messageCount: tabState.messagesReceivedInStream,
          timeSinceLastMessage: tabState.lastMessageReceivedAt ? Date.now() - tabState.lastMessageReceivedAt : null,
        }
      },

      clearTab: (tabId: string): void => {
        set(s => {
          const { [tabId]: _, ...rest } = s.tabs
          return { tabs: rest }
        })
      },

      clearAllTabs: (): void => {
        set({ tabs: {} })
      },
    },
  }
})

// Atomic selectors (Guide §14.1)
export const useStreamingActions = () => useStreamingStore(state => state.actions)

export const useTabToolMap = (tabId: string) => useStreamingStore(state => state.tabs[tabId]?.toolUseMap || new Map())

export const useTabErrors = (tabId: string) => ({
  consecutive: useStreamingStore(state => state.tabs[tabId]?.consecutiveParseErrors || 0),
  recent: useStreamingStore(state => state.tabs[tabId]?.recentErrors || []),
})

export const useStreamHealth = (tabId: string) => {
  const actions = useStreamingActions()
  return actions.getStreamHealth(tabId)
}

/** Returns true if the specified tab has an active stream (busy) */
export const useIsStreamActive = (tabId: string | null) =>
  useStreamingStore(state => (tabId ? (state.tabs[tabId]?.isStreamActive ?? false) : false))

/** Returns pending tools for a tab */
export const usePendingTools = (tabId: string | null) =>
  useStreamingStore(state => {
    if (!tabId) return []
    const tabState = state.tabs[tabId]
    if (!tabState) return []
    return Array.from(tabState.pendingTools.values())
  })
