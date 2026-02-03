/**
 * Custom JSX Dev Runtime for alive-tagger
 *
 * This replaces react/jsx-dev-runtime to attach source information
 * to every DOM element, enabling click-to-select functionality.
 *
 * How it works:
 * 1. Vite plugin intercepts imports of "react/jsx-dev-runtime"
 * 2. Returns this module instead
 * 3. We wrap the original jsxDEV to inject refs that store source info
 * 4. Source info is attached to DOM nodes via Symbol
 */

import type * as React from "react"
import * as ReactJSXDevRuntime from "react/jsx-dev-runtime"

// Original jsxDEV from React
const _jsxDEV = ReactJSXDevRuntime.jsxDEV

// Re-export Fragment
export const Fragment = ReactJSXDevRuntime.Fragment

// Symbol for storing source info on DOM elements
const SOURCE_KEY = Symbol.for("__aliveSource__")

// Global map for reverse lookups: sourceKey -> Set<WeakRef<Element>>
const sourceElementMap = new Map<string, Set<WeakRef<Element>>>()

// Expose for debugging and client-side access
;(window as unknown as Record<string, unknown>).aliveSourceMap = sourceElementMap

/**
 * Clean file paths for display
 * Removes Vite internal prefixes and normalizes paths
 */
function cleanFileName(fileName: string | undefined): string {
  if (!fileName) return ""

  let clean = fileName

  // Remove Vite's internal path prefixes
  if (clean.includes("?")) {
    clean = clean.split("?")[0]
  }

  // Remove leading slashes
  clean = clean.replace(/^\/+/, "")

  // Remove node_modules paths (we don't want to show library internals)
  if (clean.includes("node_modules")) {
    return ""
  }

  return clean
}

/**
 * Generate a unique key for source location
 */
function getSourceKey(fileName: string, lineNumber: number, columnNumber: number): string {
  return `${fileName}:${lineNumber}:${columnNumber}`
}

/**
 * Register an element in the source map
 */
function registerElement(node: Element, fileName: string, lineNumber: number, columnNumber: number): void {
  const key = getSourceKey(fileName, lineNumber, columnNumber)
  if (!sourceElementMap.has(key)) {
    sourceElementMap.set(key, new Set())
  }
  sourceElementMap.get(key)!.add(new WeakRef(node))
}

/**
 * Unregister an element from the source map
 */
function unregisterElement(node: Element, fileName: string, lineNumber: number, columnNumber: number): void {
  const key = getSourceKey(fileName, lineNumber, columnNumber)
  const refs = sourceElementMap.get(key)
  if (refs) {
    for (const ref of refs) {
      if (ref.deref() === node) {
        refs.delete(ref)
        break
      }
    }
    if (refs.size === 0) {
      sourceElementMap.delete(key)
    }
  }
}

/**
 * Get the display name for a React element type
 */
function getTypeName(type: unknown): string {
  if (typeof type === "string") return type
  if (typeof type === "function") {
    return (
      (type as { displayName?: string; name?: string }).displayName || (type as { name?: string }).name || "Unknown"
    )
  }
  if (typeof type === "object" && type !== null) {
    const t = type as {
      displayName?: string
      render?: { displayName?: string; name?: string }
    }
    return t.displayName || t.render?.displayName || t.render?.name || "Unknown"
  }
  return "Unknown"
}

/**
 * Source info from React's JSX transform
 */
interface JsxSource {
  fileName?: string
  lineNumber?: number
  columnNumber?: number
}

/**
 * Props with optional ref
 */
interface PropsWithRef {
  ref?: React.Ref<unknown> | ((node: unknown) => void)
  [key: string]: unknown
}

/**
 * Enhanced jsxDEV that attaches source info to DOM elements
 */
export function jsxDEV(
  type: React.ElementType,
  props: PropsWithRef | null,
  key: React.Key | undefined,
  isStatic: boolean,
  source: JsxSource | undefined,
  self: unknown,
): React.ReactElement {
  // Skip if no source info or if it's from node_modules
  const fileName = cleanFileName(source?.fileName)
  if (!fileName || !source?.lineNumber) {
    return _jsxDEV(type, props, key, isStatic, source, self)
  }

  // Only attach refs to intrinsic HTML elements (strings like "div", "span", etc.)
  // Function components and class components cannot receive refs unless they use forwardRef
  if (typeof type !== "string") {
    return _jsxDEV(type, props, key, isStatic, source, self)
  }

  const lineNumber = source.lineNumber
  const columnNumber = source.columnNumber || 0
  const displayName = getTypeName(type)

  // Create source info object
  const sourceInfo = {
    fileName,
    lineNumber,
    columnNumber,
    displayName,
  }

  // Get original ref if any
  const originalRef = props?.ref

  // Create enhanced props with our ref wrapper
  const enhancedProps: PropsWithRef = {
    ...props,
    ref: (node: unknown) => {
      if (node && node instanceof Element) {
        // Check if element already has source info
        const existing = (node as unknown as Record<symbol, typeof sourceInfo>)[SOURCE_KEY]

        if (existing) {
          // If source changed, update registration
          const existingKey = getSourceKey(existing.fileName, existing.lineNumber, existing.columnNumber)
          const newKey = getSourceKey(fileName, lineNumber, columnNumber)

          if (existingKey !== newKey) {
            unregisterElement(node, existing.fileName, existing.lineNumber, existing.columnNumber)
            ;(node as unknown as Record<symbol, typeof sourceInfo>)[SOURCE_KEY] = sourceInfo
            registerElement(node, fileName, lineNumber, columnNumber)
          }
        } else {
          // Attach source info to the DOM element
          ;(node as unknown as Record<symbol, typeof sourceInfo>)[SOURCE_KEY] = sourceInfo
          registerElement(node, fileName, lineNumber, columnNumber)
        }
      }

      // Call original ref if provided
      if (typeof originalRef === "function") {
        originalRef(node)
      } else if (originalRef && typeof originalRef === "object" && "current" in originalRef) {
        ;(originalRef as React.MutableRefObject<unknown>).current = node
      }
    },
  }

  return _jsxDEV(type, enhancedProps, key, isStatic, source, self)
}
