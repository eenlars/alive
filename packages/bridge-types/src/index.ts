/**
 * @webalive/bridge-types
 *
 * Shared types for Claude Bridge streaming protocol.
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
 *   BRIDGE_PROTOCOL_VERSION
 * } from "@webalive/bridge-types"
 * ```
 */

export * from "./events"
export * from "./tokens"

// Re-export protocol version at top level for easy access
export { BRIDGE_PROTOCOL_VERSION } from "./events"
