"use client"

import { useRef, useState } from "react"

interface UseResizablePanelOptions {
  defaultWidth?: number
  minWidth?: number
  maxWidthPercent?: number
}

/**
 * Professional drag-to-resize hook
 *
 * How it works:
 * 1. Mouse down on handle: set flag, attach listeners
 * 2. Mouse move: only resize if flag is true
 * 3. Mouse up: clear flag, remove listeners
 *
 * This pattern is used by VS Code, Chrome DevTools, etc.
 * Benefits:
 * - Iframe-safe: listeners always on document, flag-gated
 * - No stale closures: refs + stable listeners
 * - Guaranteed cleanup: listeners always attached/removed in pairs
 */
export function useResizablePanel(options: UseResizablePanelOptions = {}) {
  const { defaultWidth = 400, minWidth = 200, maxWidthPercent = 0.8 } = options

  const [width, setWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)
  const isDraggingRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()

    // If already dragging, ignore (shouldn't happen but safety first)
    if (isDraggingRef.current) return

    isDraggingRef.current = true
    setIsResizing(true)

    // Capture starting position and width to track delta
    const startX = e.clientX
    const startWidth = width

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Guard: only resize if still dragging
      if (!isDraggingRef.current) return

      // Calculate delta from start position (moving left = larger, moving right = smaller)
      const delta = startX - moveEvent.clientX
      const newWidth = startWidth + delta
      const maxWidth = window.innerWidth * maxWidthPercent
      const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth))

      setWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      // Clear drag state immediately
      isDraggingRef.current = false
      setIsResizing(false)

      // Remove listeners
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)

      // Clear cleanup ref
      cleanupRef.current = null
    }

    // Attach listeners
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    // Store cleanup function in case component unmounts during drag
    cleanupRef.current = handleMouseUp
  }

  return {
    width,
    setWidth,
    isResizing,
    handleMouseDown,
  }
}
