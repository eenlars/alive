/**
 * Runtime type guards for Claude stream events
 * CRITICAL: Validates SSE responses to prevent runtime crashes from malformed data
 */

import type { StreamEvent } from "./message-parser"
import { BridgeStreamType } from "./streaming/ndjson"

/**
 * Type guard to validate StreamEvent structure at runtime
 *
 * @param data - Unknown data from JSON.parse
 * @returns true if data is a valid StreamEvent
 *
 * @example
 * const data = JSON.parse(line)
 * if (!isValidStreamEvent(data)) {
 *   console.error("Invalid stream event:", data)
 *   return null
 * }
 * // data is now typed as StreamEvent
 */
export function isValidStreamEvent(data: unknown): data is StreamEvent {
  if (typeof data !== "object" || data === null) {
    return false
  }

  const event = data as Record<string, unknown>

  // Required fields
  if (typeof event.type !== "string") return false
  if (typeof event.requestId !== "string") return false
  if (typeof event.timestamp !== "string") return false

  // Validate type is a known BridgeStreamType
  const validTypes = Object.values(BridgeStreamType) as string[]
  if (!validTypes.includes(event.type)) return false

  // data field must exist and be an object (not null, not primitive)
  if (!("data" in event)) return false
  if (typeof event.data !== "object" || event.data === null) return false

  return true
}

/**
 * Type guard for basic structure validation (requestId, timestamp, type)
 * More lenient than isValidStreamEvent - use for partial validation
 */
export function hasStreamEventStructure(data: unknown): data is {
  requestId: string
  timestamp: string
  type: string
} {
  if (typeof data !== "object" || data === null) return false

  const event = data as Record<string, unknown>

  return typeof event.requestId === "string" && typeof event.timestamp === "string" && typeof event.type === "string"
}

/**
 * Safely parse StreamEvent from unknown data
 *
 * @param data - Unknown data (typically from JSON.parse)
 * @returns StreamEvent if valid, null if invalid
 *
 * @example
 * const event = safeParseStreamEvent(JSON.parse(line))
 * if (!event) {
 *   console.error("Failed to parse stream event")
 *   return
 * }
 */
export function safeParseStreamEvent(data: unknown): StreamEvent | null {
  return isValidStreamEvent(data) ? data : null
}
