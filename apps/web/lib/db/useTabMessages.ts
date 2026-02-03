"use client"

/**
 * Tab Messages Hook
 *
 * Merges Dexie persisted messages with in-memory streaming buffers.
 * Handles stale stream detection for page refresh scenarios.
 *
 * This is the PRIMARY hook for displaying messages in the chat UI.
 * It combines:
 * - Persisted messages from Dexie (ordered by seq)
 * - Live streaming buffers from Zustand (real-time text)
 * - Stale stream detection (marks old streaming messages as interrupted)
 */

import { useMemo } from "react"
import type { UIMessage } from "@/features/chat/lib/message-parser"
import { useDexieMessageStore } from "./dexieMessageStore"
import { toUIMessage } from "./messageAdapters"
import { useMessages } from "./useMessageDb"

// =============================================================================
// Configuration
// =============================================================================

/**
 * Time threshold (ms) after which a streaming message is considered stale.
 * If updatedAt is older than this and no live buffer exists, treat as interrupted.
 */
const STALE_STREAM_THRESHOLD_MS = 30_000 // 30 seconds

// =============================================================================
// Extended UIMessage Type
// =============================================================================

/**
 * Extended UIMessage with streaming state for UI rendering.
 */
export interface TabMessage extends UIMessage {
  /** True if this message is currently streaming (has live buffer or recent snapshot) */
  isStreaming?: boolean
  /** Message status for UI indicators */
  status?: "complete" | "streaming" | "interrupted" | "error"
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Get messages for a tab, merging persisted + streaming state.
 *
 * Features:
 * - Orders messages by seq (sequence number) for reliable ordering
 * - Merges live streaming buffers with Dexie snapshots
 * - Detects stale streams (page refresh during streaming)
 * - Returns empty array if tabId or userId is null
 *
 * @param tabId - The tab ID to get messages for
 * @param userId - The user ID (required for Dexie database access)
 * @returns Array of TabMessage objects ready for UI rendering
 */
export function useTabMessages(tabId: string | null, userId: string | null): TabMessage[] {
  const dbMessages = useMessages(tabId, userId)
  const streamingBuffers = useDexieMessageStore(s => s.streamingBuffers)

  return useMemo(() => {
    if (!dbMessages || dbMessages.length === 0) return []

    const now = Date.now()

    // CRITICAL: Ensure stable ordering by seq even during intermediate useLiveQuery states.
    // Dexie's compound index returns results in order, but useLiveQuery can trigger
    // intermediate re-renders before the query fully settles, causing visual glitches
    // where messages briefly appear out of order. Explicit sort guarantees consistency.
    const sortedMessages = [...dbMessages].sort((a, b) => a.seq - b.seq)

    return sortedMessages.map(dbMsg => {
      const baseUIMessage = toUIMessage(dbMsg)

      // If this message is streaming...
      if (dbMsg.status === "streaming") {
        // Check if we have a live buffer (same tab, same Zustand instance)
        const bufferedText = streamingBuffers[dbMsg.id]

        if (typeof bufferedText === "string") {
          // Live streaming in this tab - use buffer for real-time display
          return {
            ...baseUIMessage,
            content: bufferedText,
            isStreaming: true,
            status: "streaming" as const,
          }
        }

        // No buffer - either different tab or page was refreshed
        // Check if it's stale (old updatedAt)
        const isStale = now - dbMsg.updatedAt > STALE_STREAM_THRESHOLD_MS
        if (isStale) {
          // Treat as interrupted in UI (stream lost due to refresh/tab close)
          return {
            ...baseUIMessage,
            status: "interrupted" as const,
            isStreaming: false,
          }
        }

        // Recent streaming from another tab - show snapshot with loading indicator
        return {
          ...baseUIMessage,
          isStreaming: true,
          status: "streaming" as const,
        }
      }

      // Non-streaming messages - return with their status
      return {
        ...baseUIMessage,
        status: dbMsg.status,
        isStreaming: false,
      }
    })
  }, [dbMessages, streamingBuffers])
}

/**
 * Get the active streaming message ID for a tab (if any).
 *
 * @param tabId - The tab ID to check
 * @returns The streaming message ID, or null if no active stream
 */
export function useActiveStreamId(tabId: string | null): string | null {
  const activeStreamByTab = useDexieMessageStore(s => s.activeStreamByTab)
  return tabId ? (activeStreamByTab[tabId] ?? null) : null
}

/**
 * Check if a tab is currently streaming.
 *
 * @param tabId - The tab ID to check
 * @returns True if the tab has an active stream
 */
export function useIsTabStreaming(tabId: string | null): boolean {
  const activeStreamId = useActiveStreamId(tabId)
  return activeStreamId !== null
}

/**
 * Get the current streaming text for a tab (if streaming).
 *
 * @param tabId - The tab ID to check
 * @returns The current streaming text, or null if not streaming
 */
export function useStreamingText(tabId: string | null): string | null {
  const activeStreamId = useActiveStreamId(tabId)
  const streamingBuffers = useDexieMessageStore(s => s.streamingBuffers)

  if (!activeStreamId) return null
  return streamingBuffers[activeStreamId] ?? null
}
