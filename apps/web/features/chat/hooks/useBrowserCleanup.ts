"use client"

import { useEffect, useRef } from "react"

interface UseBrowserCleanupOptions {
  /** Current tab ID */
  tabId: string | null
  /** Current tab group ID */
  tabGroupId: string | null
  /** Current workspace */
  workspace: string | null
  /** Ref to the current request ID */
  currentRequestIdRef: React.MutableRefObject<string | null>
  /** Whether we're currently streaming */
  isStreaming: boolean
}

/**
 * Hook that sends cancel beacons when user closes/navigates away from the page
 *
 * Uses navigator.sendBeacon() which is the only reliable way to send requests
 * during page unload. This prevents orphaned agent processes on the server.
 *
 * Why this is needed:
 * - When user closes tab or navigates away, the SSE connection just drops
 * - Server has no way to detect this (proxy layers don't propagate abort signals)
 * - Without cleanup, agent processes run until 10-minute TTL cleanup
 * - This can cause server overload with many orphaned processes
 */
export function useBrowserCleanup({
  tabId,
  tabGroupId,
  workspace,
  currentRequestIdRef,
  isStreaming,
}: UseBrowserCleanupOptions): void {
  // Track streaming state in ref so handler sees current value
  const isStreamingRef = useRef(isStreaming)
  isStreamingRef.current = isStreaming

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Only send if we're actually streaming
      if (!isStreamingRef.current) return

      const requestId = currentRequestIdRef.current

      // Build cancel payload - prefer requestId, fallback to tabId
      // Include clientStack marker so server can identify this as a page unload cancel
      const clientStack = "PAGE_UNLOAD_BEACON: beforeunload event fired"

      let payload: Record<string, string>
      if (requestId) {
        payload = { requestId, clientStack }
      } else if (tabId && tabGroupId && workspace) {
        payload = { tabId, tabGroupId, workspace, clientStack }
      } else {
        // Can't build valid cancel request
        console.warn("[useBrowserCleanup] Cannot send cancel beacon - missing identifiers")
        return
      }

      // Use sendBeacon - it's the only reliable way to send during unload
      // The server endpoint must accept application/json
      const success = navigator.sendBeacon(
        "/api/claude/stream/cancel",
        new Blob([JSON.stringify(payload)], { type: "application/json" }),
      )

      if (success) {
        console.log("[useBrowserCleanup] Cancel beacon sent:", payload)
      } else {
        console.warn("[useBrowserCleanup] Cancel beacon failed to send")
      }
    }

    // Listen for page unload events
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [tabId, tabGroupId, workspace, currentRequestIdRef])
}
