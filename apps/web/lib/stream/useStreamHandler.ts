"use client"

/**
 * Stream Handler Hook
 *
 * Wires NDJSON stream events to the Dexie message store actions.
 * Handles the complete streaming lifecycle:
 * - Stream start → create skeleton message
 * - Message chunks → append to buffer
 * - Stream complete → finalize message
 * - Stream interrupt → mark as interrupted
 * - Stream error → mark as error
 *
 * Uses typed BridgeEvent from shared types module for type safety.
 */

import { useCallback, useRef } from "react"
import type { UIMessage } from "@/features/chat/lib/message-parser"
import { useDexieMessageStore } from "@/lib/db/dexieMessageStore"
import {
  type BridgeEvent,
  type BridgeMessageEvent,
  isBridgeCompleteEvent,
  isBridgeErrorEvent,
  isBridgeEvent,
  isBridgeInterruptEvent,
  isBridgeMessageEvent,
  isBridgeStartEvent,
} from "./streamTypes"

// =============================================================================
// Types
// =============================================================================

export interface UseStreamHandlerOptions {
  /** Tab ID for the streaming messages */
  tabId: string
  /** Callback when a user message is received (for echo/confirmation) */
  onUserMessage?: (message: UIMessage) => Promise<void>
  /** Callback when a non-assistant message is received (tool_use, tool_result, etc.) */
  onOtherMessage?: (message: UIMessage) => Promise<void>
}

export interface UseStreamHandlerReturn {
  /** Handle an incoming NDJSON event from the stream */
  handleStreamEvent: (event: unknown) => Promise<void>
  /** Cancel the current stream (user hit stop) */
  cancelStream: () => Promise<void>
  /** Whether there's an active stream */
  isStreaming: boolean
  /** Current stream message ID (if streaming) */
  currentStreamId: string | null
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook to handle streaming events and wire them to the Dexie message store.
 *
 * Usage:
 * ```typescript
 * const { handleStreamEvent, cancelStream, isStreaming } = useStreamHandler({
 *   tabId: currentTabId,
 *   onUserMessage: async (msg) => { /* handle user message echo * / },
 * })
 *
 * // In your stream reading loop:
 * for await (const event of streamReader) {
 *   await handleStreamEvent(event)
 * }
 * ```
 */
export function useStreamHandler({
  tabId,
  onUserMessage,
  onOtherMessage,
}: UseStreamHandlerOptions): UseStreamHandlerReturn {
  const currentStreamIdRef = useRef<string | null>(null)

  // Get store actions
  const startAssistantStream = useDexieMessageStore(s => s.startAssistantStream)
  const appendToAssistantStream = useDexieMessageStore(s => s.appendToAssistantStream)
  const finalizeAssistantStream = useDexieMessageStore(s => s.finalizeAssistantStream)
  const stopAssistantStream = useDexieMessageStore(s => s.stopAssistantStream)
  const failAssistantStream = useDexieMessageStore(s => s.failAssistantStream)
  const addMessage = useDexieMessageStore(s => s.addMessage)

  /**
   * Handle incoming NDJSON event from stream.
   * Uses typed BridgeEvent from shared types module.
   */
  const handleStreamEvent = useCallback(
    async (event: unknown) => {
      // Type guard to ensure valid event
      if (!isBridgeEvent(event)) {
        console.warn("[stream] Invalid event received:", event)
        return
      }

      const e: BridgeEvent = event

      // Handle each event type
      if (isBridgeStartEvent(e)) {
        // Stream starting - create assistant message skeleton
        currentStreamIdRef.current = await startAssistantStream(tabId)
        return
      }

      if (isBridgeMessageEvent(e)) {
        await handleMessageEvent(e)
        return
      }

      if (isBridgeCompleteEvent(e)) {
        // Stream finished successfully
        if (currentStreamIdRef.current) {
          await finalizeAssistantStream(currentStreamIdRef.current)
          currentStreamIdRef.current = null
        }
        return
      }

      if (isBridgeInterruptEvent(e)) {
        // User cancelled (or system interrupted)
        if (currentStreamIdRef.current) {
          await stopAssistantStream(currentStreamIdRef.current)
          currentStreamIdRef.current = null
        }
        return
      }

      if (isBridgeErrorEvent(e)) {
        // Stream failed
        if (currentStreamIdRef.current) {
          await failAssistantStream(currentStreamIdRef.current, e.code)
          currentStreamIdRef.current = null
        }
        return
      }
    },
    [tabId, startAssistantStream, finalizeAssistantStream, stopAssistantStream, failAssistantStream],
  )

  /**
   * Handle a message event specifically.
   */
  const handleMessageEvent = useCallback(
    async (msg: BridgeMessageEvent) => {
      if (msg.messageType === "assistant" && currentStreamIdRef.current) {
        // Assistant chunk - append to stream
        const text = extractAssistantText(msg.content)

        if (msg.complete) {
          // Final message content - finalize instead of append
          appendToAssistantStream(currentStreamIdRef.current, text)
          await finalizeAssistantStream(currentStreamIdRef.current)
          currentStreamIdRef.current = null
        } else {
          appendToAssistantStream(currentStreamIdRef.current, text)
        }
        return
      }

      if (msg.messageType === "user") {
        // User message echo - use callback if provided
        if (onUserMessage) {
          const uiMessage = parseUserMessage(msg)
          if (uiMessage) {
            await onUserMessage(uiMessage)
          }
        }
        return
      }

      // Tool use, tool result, thinking, system - use callback or add directly
      const uiMessage = parseOtherMessage(msg)
      if (uiMessage) {
        if (onOtherMessage) {
          await onOtherMessage(uiMessage)
        } else {
          await addMessage(uiMessage, tabId)
        }
      }
    },
    [appendToAssistantStream, finalizeAssistantStream, addMessage, tabId, onUserMessage, onOtherMessage],
  )

  /**
   * Cancel current stream (user hit stop).
   * Safe to call even if no stream is active (idempotent).
   */
  const cancelStream = useCallback(async () => {
    if (currentStreamIdRef.current) {
      await stopAssistantStream(currentStreamIdRef.current)
      currentStreamIdRef.current = null
    }
  }, [stopAssistantStream])

  return {
    handleStreamEvent,
    cancelStream,
    isStreaming: currentStreamIdRef.current !== null,
    currentStreamId: currentStreamIdRef.current,
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract text from assistant message content.
 */
function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content

  // Claude SDK format: { message: { content: [{ text: "..." }] } }
  if (typeof content === "object" && content !== null) {
    const c = content as { message?: { content?: Array<{ text?: string }> } }
    const textBlock = c.message?.content?.find(block => "text" in block)
    return textBlock?.text ?? ""
  }

  return ""
}

/**
 * Parse user message from BridgeMessageEvent.
 */
function parseUserMessage(msg: BridgeMessageEvent): UIMessage | null {
  if (msg.messageType !== "user") return null

  // Extract text from content
  let text = ""
  if (typeof msg.content === "string") {
    text = msg.content
  } else if (typeof msg.content === "object" && msg.content !== null) {
    const c = msg.content as { text?: string }
    text = c.text ?? JSON.stringify(msg.content)
  }

  return {
    id: crypto.randomUUID(),
    type: "user",
    content: text,
    timestamp: new Date(),
  }
}

/**
 * Parse non-assistant, non-user message from BridgeMessageEvent.
 */
function parseOtherMessage(msg: BridgeMessageEvent): UIMessage | null {
  if (msg.messageType === "user" || msg.messageType === "assistant") return null

  // Create SDK message wrapper
  return {
    id: crypto.randomUUID(),
    type: "sdk_message",
    content: {
      type: msg.messageType,
      ...((msg.content as object) ?? {}),
    },
    timestamp: new Date(),
  }
}

// =============================================================================
// Exports
// =============================================================================

export type { BridgeEvent, BridgeMessageEvent } from "./streamTypes"
