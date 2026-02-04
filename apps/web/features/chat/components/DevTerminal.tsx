"use client"
import { useRef, useState } from "react"
import { useResizablePanel } from "@/lib/hooks/useResizablePanel"
import { useDebugActions, useSSETerminalMinimized } from "@/lib/stores/debug-store"
import { truncateDeep } from "@/lib/utils"
import { useDevTerminal } from "../lib/dev-terminal-context"
import { BridgeStreamType } from "../lib/streaming/ndjson"

export function DevTerminal() {
  const { events, clearEvents } = useDevTerminal()
  const isMinimized = useSSETerminalMinimized()
  const { setSSETerminalMinimized } = useDebugActions()
  const { width, isResizing, handleMouseDown } = useResizablePanel({ defaultWidth: 768 })
  const [collapsedMessages, setCollapsedMessages] = useState<Set<number>>(new Set())
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Toggle message collapse
  const toggleMessageCollapse = (index: number) => {
    setCollapsedMessages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  // Copy message to clipboard
  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  // Copy all messages as array
  const [copiedAll, setCopiedAll] = useState(false)
  const copyAllMessages = async () => {
    try {
      const allMessages = events
        .filter(devEvent => devEvent.eventName !== BridgeStreamType.PING)
        .map(devEvent => {
          try {
            // Try to return the parsed event object
            return devEvent.event
          } catch {
            // If parsing fails, return the raw SSE as a string
            return devEvent.rawSSE
          }
        })

      // Truncate all string values to 200 chars max to prevent clipboard overflow
      const truncatedMessages = truncateDeep(allMessages, 200)

      await navigator.clipboard.writeText(JSON.stringify(truncatedMessages, null, 2))
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    } catch (err) {
      console.error("Failed to copy all messages:", err)
    }
  }

  // Get color class for event name
  const getEventColor = (eventName: string): string => {
    // Handle specific event types
    if (eventName === "outgoing_request") return "text-orange-400 font-semibold"
    if (eventName === "client_error") return "text-red-400 font-semibold"
    if (eventName === "stream_error") return "text-red-400 font-semibold"
    if (eventName === "stream_interrupt") return "text-yellow-400 font-semibold"
    if (eventName === "stream_complete") return "text-green-400 font-semibold"
    if (eventName.startsWith("stream_")) return "text-cyan-400 font-semibold"
    if (eventName === "done") return "text-yellow-500 font-semibold"

    // Default for unknown types: treat as error
    return "text-red-400 font-semibold"
  }

  return (
    <div
      className={`relative bg-black text-green-400 font-mono text-xs hidden md:flex flex-col border-l border-green-700/30 ${
        isMinimized ? "w-12" : "h-full"
      } ${isResizing ? "select-none" : ""}`}
      style={!isMinimized ? { width: `${width}px` } : undefined}
    >
      {/* Resize handle */}
      {!isMinimized && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize terminal"
          aria-valuenow={width}
          tabIndex={0}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-green-500/50 transition-colors z-10"
          onMouseDown={handleMouseDown}
          style={{ userSelect: "none" }}
        />
      )}
      {/* Overlay to block content from capturing mouse during resize */}
      {isResizing && (
        <div
          className="absolute inset-0 z-50"
          style={{
            cursor: "col-resize",
            pointerEvents: "all",
          }}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-green-700/30 bg-black/90">
        {isMinimized ? (
          <button
            type="button"
            onClick={() => setSSETerminalMinimized(false)}
            className="text-green-500 font-semibold hover:text-green-400 transition-colors w-full text-center"
          >
            +
          </button>
        ) : (
          <>
            <span className="text-green-500 font-semibold">SSE Events (Dev)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyAllMessages}
                className="text-green-600 hover:text-green-400 transition-colors text-xs px-2 py-1 border border-green-700/30 rounded"
                title="Copy all messages as JSON array"
              >
                {copiedAll ? "✓ copied all" : "copy all"}
              </button>
              <button
                type="button"
                onClick={clearEvents}
                className="text-green-600 hover:text-green-400 transition-colors text-xs px-2 py-1 border border-green-700/30 rounded"
              >
                clear
              </button>
              <button
                type="button"
                onClick={() => setSSETerminalMinimized(true)}
                className="text-green-600 hover:text-green-400 transition-colors text-xs px-2 py-1 border border-green-700/30 rounded"
              >
                −
              </button>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {!isMinimized && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {events.length === 0 ? (
            <div className="text-green-700">No events yet...</div>
          ) : (
            events
              .filter(devEvent => devEvent.eventName !== BridgeStreamType.PING)
              .map((devEvent, index) => {
                // Try to beautify the parsed data
                let displayContent: string
                try {
                  displayContent = JSON.stringify(devEvent.event, null, 2)
                } catch {
                  // Parsing failed, fall back to raw SSE
                  displayContent = devEvent.rawSSE
                }

                const isCollapsed = collapsedMessages.has(index)
                const isCopied = copiedIndex === index

                return (
                  <div
                    key={`${devEvent.event.requestId}-${index}`}
                    className="space-y-1 pb-3 border-b border-green-900/30"
                  >
                    {/* Header with timestamp, event type, and controls */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMessageCollapse(index)}
                        className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
                      >
                        <span className="text-green-700">
                          [{new Date(devEvent.event.timestamp).toLocaleTimeString()}]
                        </span>
                        <span className={getEventColor(devEvent.eventName)}>{devEvent.eventName}</span>
                        <span className="text-green-700 text-[10px]">{isCollapsed ? "▶" : "▼"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copyMessage(displayContent, index)}
                        className="text-green-600 hover:text-green-400 transition-colors text-[10px] px-2 py-0.5"
                        title="Copy to clipboard"
                      >
                        {isCopied ? "✓ copied" : "copy"}
                      </button>
                    </div>

                    {/* Beautified JSON or raw SSE fallback */}
                    {!isCollapsed && (
                      <pre className="text-green-500 whitespace-pre-wrap break-all leading-relaxed text-[10px]">
                        {displayContent}
                      </pre>
                    )}
                  </div>
                )
              })
          )}
        </div>
      )}

      {/* Footer stats */}
      {!isMinimized && (
        <div className="px-3 py-2 border-t border-green-700/30 bg-black/90 text-green-700 text-[10px]">
          {(() => {
            const visibleCount = events.filter(e => e.eventName !== BridgeStreamType.PING).length
            return `${visibleCount} event${visibleCount !== 1 ? "s" : ""} • ${visibleCount > 0 ? "live data" : "waiting..."}`
          })()}
        </div>
      )}
    </div>
  )
}
