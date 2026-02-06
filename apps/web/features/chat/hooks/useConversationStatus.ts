import { useCallback } from "react"
import { useStreamingStore } from "@/lib/stores/streamingStore"

/**
 * Derives streaming status for a conversation from the streaming store.
 *
 * Returns object containing:
 * - isStreaming: true if any tab in conversation has active stream
 * - hasPendingTools: true if any tab has pending tools
 */
export function useConversationStatus(conversationId: string) {
  return useStreamingStore(
    useCallback(
      state => {
        let isStreaming = false
        let hasPendingTools = false

        for (const [tabId, tabState] of Object.entries(state.tabs)) {
          if (!tabId.includes(conversationId)) continue
          if (!tabState.isStreamActive) continue

          isStreaming = true

          // If any tab has pending tools, mark as having pending tools
          if (tabState.pendingTools.size > 0) {
            hasPendingTools = true
            break
          }
        }

        return { isStreaming, hasPendingTools }
      },
      [conversationId],
    ),
  )
}
