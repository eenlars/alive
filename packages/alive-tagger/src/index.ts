/**
 * @webalive/alive-tagger
 *
 * Element selection and source tagging for Alive sandbox.
 *
 * This package provides:
 * 1. A Vite plugin that attaches source info to all React elements
 * 2. A client script for Cmd+Click element selection
 *
 * @example Vite config
 * ```typescript
 * import { aliveTagger } from "@webalive/alive-tagger"
 *
 * export default defineConfig({
 *   plugins: [
 *     react(),
 *     aliveTagger()  // Add after react plugin
 *   ]
 * })
 * ```
 */

// Export the Vite plugin
export { aliveTagger, default } from "./plugin"

// Export types
export {
  type AliveTaggerOptions,
  ELEMENT_SELECTED_MESSAGE_TYPE,
  type ElementSelectedContext,
  type ElementSelectedMessage,
  SOURCE_KEY,
  type SourceInfo,
} from "./types"

// Utility functions for working with source info

import { SOURCE_KEY, type SourceInfo } from "./types"

/**
 * Get source info from a DOM element
 */
export function getElementSource(element: Element | null): SourceInfo | undefined {
  if (!element) return undefined
  return (element as unknown as Record<symbol, SourceInfo>)[SOURCE_KEY]
}

/**
 * Check if an element has source info attached
 */
export function hasSourceInfo(element: Element | null): boolean {
  return getElementSource(element) !== undefined
}

/**
 * Format source info as a location string
 */
export function formatSourceLocation(source: SourceInfo): string {
  return `${source.fileName}:${source.lineNumber}:${source.columnNumber}`
}

/**
 * Type guard for element selected messages
 */
export function isElementSelectedMessage(data: unknown): data is import("./types").ElementSelectedMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as { type: unknown }).type === "alive-element-selected" &&
    "context" in data
  )
}
