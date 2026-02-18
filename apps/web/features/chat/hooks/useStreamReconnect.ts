/**
 * useStreamReconnect - Reconnects to buffered stream messages when tab becomes visible
 *
 * Problem: When user switches tabs during an active stream, the browser may throttle
 * or close the SSE connection. The server continues processing and buffers messages.
 * When the user returns, they see a stale/incomplete response.
 *
 * Solution: Detect when tab becomes visible and check for buffered messages via
 * the /api/claude/stream/reconnect endpoint. Replay missed messages into the UI.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useStreamingActions } from "@/lib/stores/streamingStore"
import { parseStreamEvent, type UIMessage } from "../lib/message-parser"
import { isValidStreamEvent } from "../lib/stream-guards"

interface UseStreamReconnectOptions {
  /** Current tab ID (session key for Claude SDK) */
  tabId: string | null
  /** Current tab group ID */
  tabGroupId: string | null
  /** Current workspace */
  workspace: string | null
  /** Current worktree */
  worktree?: string | null
  /** Whether a stream is currently active */
  isStreaming: boolean
  /**
   * Callback to add messages to the UI.
   * IMPORTANT: targetTabId is REQUIRED for tab isolation.
   * Without it, messages could be added to the wrong tab when user switches tabs.
   */
  addMessage: (message: UIMessage, targetTabId: string) => void
  /** Whether component is mounted */
  mounted: boolean
}

interface ReconnectResponse {
  ok: boolean
  hasStream: boolean
  state?: "streaming" | "complete" | "error"
  messages?: string[]
  error?: string
  requestId?: string
}

export function useStreamReconnect({
  tabId,
  tabGroupId,
  workspace,
  worktree,
  isStreaming,
  addMessage,
  mounted,
}: UseStreamReconnectOptions) {
  const streamingActions = useStreamingActions()
  const [isReconnecting, setIsReconnecting] = useState(false)
  const reconnectingRef = useRef(false) // For async checks without causing re-renders
  const lastVisibilityCheck = useRef<number>(0)
  // Track if we were streaming before tab switch
  const wasStreamingBeforeHidden = useRef(false)

  const checkForBufferedMessages = useCallback(async () => {
    if (!tabId || !tabGroupId || !workspace || reconnectingRef.current) {
      return
    }

    // Debounce: don't check more than once every 2 seconds
    // This prevents rapid re-renders when quickly switching tabs
    const now = Date.now()
    if (now - lastVisibilityCheck.current < 2000) {
      return
    }
    lastVisibilityCheck.current = now

    reconnectingRef.current = true
    setIsReconnecting(true)

    try {
      const lastSeenSeq = tabId ? streamingActions.getLastSeenStreamSeq(tabId) : null
      const response = await fetch("/api/claude/stream/reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tabGroupId,
          tabId,
          workspace,
          worktree: worktree || undefined,
          acknowledge: false, // Don't delete buffer yet, in case we need to retry
          lastSeenSeq: typeof lastSeenSeq === "number" ? lastSeenSeq : undefined,
        }),
      })

      if (!response.ok) {
        console.warn("[StreamReconnect] Reconnect endpoint returned error:", response.status)
        return
      }

      const data: ReconnectResponse = await response.json()

      if (!data.ok || !data.hasStream) {
        // No buffered messages - stream either completed while visible or never existed
        return
      }

      // Process buffered messages
      // CRITICAL: Pass tabId to addMessage for tab isolation
      if (data.messages && data.messages.length > 0) {
        for (const line of data.messages) {
          try {
            const parsed: unknown = JSON.parse(line)
            if (isValidStreamEvent(parsed)) {
              const message = parseStreamEvent(parsed, tabId, streamingActions)
              if (message) {
                addMessage(message, tabId)
              }
            }
          } catch (e) {
            console.warn("[StreamReconnect] Failed to parse buffered message:", e)
          }
        }
      }

      // Handle stream state
      if (data.state === "complete" || data.state === "error") {
        // Mark stream as ended in the store (this updates busy state)
        streamingActions.endStream(tabId)
        // Acknowledge receipt so buffer gets cleaned up
        await fetch("/api/claude/stream/reconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tabGroupId,
            tabId,
            workspace,
            worktree: worktree || undefined,
            acknowledge: true,
          }),
        })
      } else if (data.state === "streaming") {
        // Stream is still active - mark it and set up polling
        streamingActions.startStream(tabId)
        pollForRemainingMessages(tabId, workspace)
      }
    } catch (error) {
      console.error("[StreamReconnect] Error checking for buffered messages:", error)
    } finally {
      reconnectingRef.current = false
      setIsReconnecting(false)
    }
  }, [tabId, tabGroupId, workspace, worktree, addMessage, streamingActions])

  // Poll for remaining messages when stream is still active
  const pollForRemainingMessages = useCallback(
    async (pollTabId: string, ws: string) => {
      const pollInterval = 1000 // 1 second
      const maxPolls = 300 // 5 minutes max

      for (let i = 0; i < maxPolls; i++) {
        // Stop polling if tab becomes hidden again
        if (document.hidden) {
          return
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval))

        try {
          const lastSeenSeq = streamingActions.getLastSeenStreamSeq(pollTabId)
          const response = await fetch("/api/claude/stream/reconnect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              tabGroupId,
              tabId: pollTabId,
              workspace: ws,
              worktree: worktree || undefined,
              acknowledge: false,
              lastSeenSeq: typeof lastSeenSeq === "number" ? lastSeenSeq : undefined,
            }),
          })

          if (!response.ok) continue

          const data: ReconnectResponse = await response.json()

          if (!data.ok || !data.hasStream) {
            // Stream ended or was cleaned up
            streamingActions.endStream(pollTabId)
            return
          }

          // Process any new messages
          // CRITICAL: Pass pollTabId to addMessage for tab isolation
          if (data.messages && data.messages.length > 0) {
            for (const line of data.messages) {
              try {
                const parsed: unknown = JSON.parse(line)
                if (isValidStreamEvent(parsed)) {
                  const message = parseStreamEvent(parsed, pollTabId, streamingActions)
                  if (message) {
                    addMessage(message, pollTabId)
                  }
                }
              } catch {
                // Skip invalid messages
              }
            }
          }

          // Check if stream completed
          if (data.state === "complete" || data.state === "error") {
            streamingActions.endStream(pollTabId)
            // Acknowledge receipt
            await fetch("/api/claude/stream/reconnect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                tabGroupId,
                tabId: pollTabId,
                workspace: ws,
                worktree: worktree || undefined,
                acknowledge: true,
              }),
            })
            return
          }
        } catch {
          // Continue polling on error
        }
      }

      // Max polls reached
      console.warn("[StreamReconnect] Max polls reached, stopping")
      streamingActions.endStream(pollTabId)
    },
    [tabGroupId, addMessage, streamingActions, worktree],
  )

  // Check for active stream on mount (handles page refresh during active stream)
  useEffect(() => {
    if (!mounted || !tabId || !workspace) return

    // Small delay to let the page settle
    const timeoutId = setTimeout(() => {
      checkForBufferedMessages()
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [mounted, tabId, workspace, checkForBufferedMessages])

  // Listen for visibility changes
  useEffect(() => {
    if (!mounted) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is being hidden - remember if we were streaming
        wasStreamingBeforeHidden.current = isStreaming
      } else {
        // Tab became visible - check for buffered messages if we were streaming
        // Also check unconditionally since we might have refreshed the page
        checkForBufferedMessages()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [mounted, isStreaming, checkForBufferedMessages])

  return {
    checkForBufferedMessages,
    isReconnecting,
  }
}
