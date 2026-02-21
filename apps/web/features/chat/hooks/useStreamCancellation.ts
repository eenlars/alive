"use client"

import { useCallback, useRef, useState } from "react"
import type { UIMessage } from "@/features/chat/lib/message-parser"
import { trackStreamStopped } from "@/lib/analytics/events"
import { postty } from "@/lib/api/api-client"
import { validateRequest } from "@/lib/api/schemas"
import { clearAbortController, getAbortController, useStreamingActions } from "@/lib/stores/streamingStore"

interface UseStreamCancellationOptions {
  /** Current tab ID (session key for Claude SDK) */
  tabId: string
  /** Current tab group ID */
  tabGroupId: string | null
  /** Current workspace */
  workspace: string | null
  /** Current worktree */
  worktree?: string | null
  /** Whether worktrees are enabled for this workspace */
  worktreesEnabled: boolean
  /**
   * Callback to add message to chat.
   * IMPORTANT: targetTabId is REQUIRED for tab isolation.
   * Without it, interrupt messages could be added to the wrong tab.
   */
  addMessage: (message: UIMessage, targetTabId: string) => void
  /** Callback to show completion dots */
  setShowCompletionDots: (show: boolean) => void
  /** Ref to the abort controller for the current request */
  abortControllerRef: React.MutableRefObject<AbortController | null>
  /** Ref to the current request ID */
  currentRequestIdRef: React.MutableRefObject<string | null>
  /** Ref to track per-tab submission state */
  isSubmittingByTabRef: React.MutableRefObject<Map<string, boolean>>
  /** Optional callback for dev terminal events */
  onDevEvent?: (event: { type: string; data: unknown }) => void
}

interface UseStreamCancellationReturn {
  /** Call to stop the current stream */
  stopStreaming: () => void
  /** Whether currently in the process of stopping */
  isStopping: boolean
}

/**
 * Hook for managing stream cancellation with type-safe API calls
 *
 * Features:
 * - Double-click protection via isStopping guard
 * - Fire-and-forget cancel request (non-blocking UI)
 * - Type-safe API calls with Zod validation
 * - Clean abort handling
 *
 * @example
 * ```tsx
 * const { stopStreaming } = useStreamCancellation({
 *   tabId,
 *   workspace,
 *   addMessage,
 *   setShowCompletionDots,
 *   abortControllerRef,
 *   currentRequestIdRef,
 *   isSubmittingByTabRef,
 * })
 *
 * <button onClick={stopStreaming}>Stop</button>
 * ```
 */
export function useStreamCancellation({
  tabId,
  tabGroupId,
  workspace,
  worktree,
  worktreesEnabled,
  addMessage,
  setShowCompletionDots,
  abortControllerRef,
  currentRequestIdRef,
  isSubmittingByTabRef,
  onDevEvent,
}: UseStreamCancellationOptions): UseStreamCancellationReturn {
  // Ref for immediate guard (prevents double-click during same sync tick)
  const isStoppingRef = useRef(false)
  // State for external visibility (triggers re-renders for consumers)
  const [isStopping, setIsStopping] = useState(false)
  const streamingActions = useStreamingActions()
  const requestWorktree = worktreesEnabled ? worktree || undefined : undefined

  const stopStreaming = useCallback(() => {
    // Guard against double-clicks (ref for immediate check)
    if (isStoppingRef.current) return
    isStoppingRef.current = true
    setIsStopping(true)
    trackStreamStopped({ workspace })

    // Log to dev terminal if callback provided
    onDevEvent?.({
      type: "client.interrupt",
      data: {
        message: "Response interrupted by user",
        source: "client_cancel",
        tabId,
        timestamp: new Date().toISOString(),
      },
    })

    // Capture requestId BEFORE nulling it
    const requestIdToCancel = currentRequestIdRef.current

    // Helper to reset all states after cancellation completes
    // No delay needed - cancel endpoint now waits for lock release before responding
    // Note: busy state is derived from streamingStore.isStreamActive, no need to set it
    const finishCancellation = () => {
      if (tabId) isSubmittingByTabRef.current.set(tabId, false)
      isStoppingRef.current = false
      setIsStopping(false)
      setShowCompletionDots(false)
    }

    // Capture stack trace for debugging (helps identify where cancel originated)
    const clientStack = new Error().stack?.split("\n").slice(1, 6).join("\n") // First 5 frames

    // Send cancel request and wait for confirmation
    // Backend now waits for cleanup to complete before responding, so response = safe to send new message
    const sendCancelRequest = async () => {
      try {
        if (requestIdToCancel) {
          // Primary path: Cancel by requestId
          const validatedRequest = validateRequest("claude/stream/cancel", {
            requestId: requestIdToCancel,
            clientStack, // Send stack for server-side debugging
          })
          await postty("claude/stream/cancel", validatedRequest)
        } else if (tabId.length > 0 && tabGroupId && workspace) {
          // Fallback path: Cancel by tabId (super-early Stop)
          const validatedRequest = validateRequest("claude/stream/cancel", {
            tabGroupId,
            tabId,
            workspace,
            ...(requestWorktree ? { worktree: requestWorktree } : {}),
            clientStack, // Send stack for server-side debugging
          })
          await postty("claude/stream/cancel", validatedRequest)
        } else {
          console.warn("[useStreamCancellation] No requestId or tabId available - relying on abort() only")
        }
      } catch (error) {
        console.error("[useStreamCancellation] Cancel request failed:", error)
        // Continue anyway - the abort() should have worked
      }

      // Backend confirmed (or failed) - finish cancellation
      finishCancellation()
    }

    // Immediately abort the client-side stream
    // Use per-tab abort controller for tabs support
    const perTabController = tabId ? getAbortController(tabId) : null
    if (perTabController) {
      perTabController.abort()
      clearAbortController(tabId)
    }
    // Also clear the ref for backward compatibility
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    currentRequestIdRef.current = null

    // End stream tracking
    if (tabId) {
      streamingActions.endStream(tabId)
    }

    // Add completion message to mark thinking group as complete
    // CRITICAL: Pass tabId for tab isolation - without it,
    // this message could be added to the wrong tab if user switched tabs
    const interruptMessage: UIMessage = {
      id: crypto.randomUUID(),
      type: "complete",
      content: {},
      timestamp: new Date(),
    }
    addMessage(interruptMessage, tabId)

    // Show completion dots while waiting for backend confirmation
    setShowCompletionDots(true)

    // Send cancel request (async, but we don't await in the callback)
    // Use timeout as fallback in case request hangs
    const timeoutId = setTimeout(() => {
      console.warn("[useStreamCancellation] Cancel request timed out after 5s, forcing finish")
      finishCancellation()
    }, 5000)

    sendCancelRequest().finally(() => {
      clearTimeout(timeoutId)
    })
  }, [
    tabId,
    tabGroupId,
    workspace,
    requestWorktree,
    addMessage,
    setShowCompletionDots,
    abortControllerRef,
    currentRequestIdRef,
    isSubmittingByTabRef,
    streamingActions,
    onDevEvent,
  ])

  return {
    stopStreaming,
    isStopping,
  }
}
