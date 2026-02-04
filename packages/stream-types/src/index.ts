/**
 * @webalive/stream-types
 *
 * Shared types for Alive streaming protocol.
 *
 * This package defines the contract between:
 * - Browser client (consumer)
 * - Next.js app (token minter, fallback proxy)
 * - Broker service (stream manager)
 *
 * Usage:
 * ```typescript
 * import {
 *   StreamEvent,
 *   isStreamEvent,
 *   StreamTokenPayload,
 *   STREAM_PROTOCOL_VERSION
 * } from "@webalive/stream-types"
 * ```
 */

export * from "./events"
export * from "./tokens"

// Re-export protocol version at top level for easy access
export { STREAM_PROTOCOL_VERSION } from "./events"
