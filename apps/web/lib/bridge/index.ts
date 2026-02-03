/**
 * Bridge Module
 *
 * Handles streaming communication between client and server.
 * Provides typed events and React hooks for stream handling.
 */

// Stream event types
export {
  type BridgeBaseEvent,
  type BridgeCompleteEvent,
  type BridgeErrorEvent,
  type BridgeEvent,
  type BridgeInterruptEvent,
  type BridgeMessageContent,
  type BridgeMessageEvent,
  type BridgeStartEvent,
  type BridgeStreamType,
  isBridgeCompleteEvent,
  isBridgeErrorEvent,
  isBridgeEvent,
  isBridgeInterruptEvent,
  isBridgeMessageEvent,
  isBridgeStartEvent,
} from "./streamTypes"

// Stream handler hook
export {
  type UseStreamHandlerOptions,
  type UseStreamHandlerReturn,
  useStreamHandler,
} from "./useStreamHandler"
