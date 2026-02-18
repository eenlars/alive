"use client"
import { useRef, useState } from "react"
import { truncateDeep } from "@/lib/utils"
import { useDevTerminal } from "../../lib/dev-terminal-context"
import { BridgeStreamType } from "../../lib/streaming/ndjson"

// Get color class for event name
function getEventColor(eventName: string): string {
  if (eventName === "outgoing_request") return "text-orange-400 font-semibold"
  if (eventName === "client_error") return "text-red-400 font-semibold"
  if (eventName === "stream_error") return "text-red-400 font-semibold"
  if (eventName === "stream_interrupt") return "text-yellow-400 font-semibold"
  if (eventName === "stream_complete") return "text-green-400 font-semibold"
  if (eventName.startsWith("stream_")) return "text-cyan-400 font-semibold"
  if (eventName === "done") return "text-yellow-500 font-semibold"
  return "text-red-400 font-semibold"
}

export function SandboxEventsPanel() {
  const { events, clearEvents } = useDevTerminal()
  const [collapsedMessages, setCollapsedMessages] = useState<Set<number>>(new Set())
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const copyAllMessages = async () => {
    try {
      const allMessages = events
        .filter(devEvent => devEvent.eventName !== BridgeStreamType.PING)
        .map(devEvent => {
          try {
            return devEvent.event
          } catch {
            return devEvent.rawSSE
          }
        })

      const truncatedMessages = truncateDeep(allMessages, 200)
      await navigator.clipboard.writeText(JSON.stringify(truncatedMessages, null, 2))
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    } catch (err) {
      console.error("Failed to copy all messages:", err)
    }
  }

  const visibleEvents = events.filter(e => e.eventName !== BridgeStreamType.PING)

  return (
    <div className="h-full flex flex-col bg-black text-green-400 font-mono text-xs">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-green-700/30 bg-black/90 shrink-0">
        <span className="text-green-600 text-[10px]">
          {visibleEvents.length} event{visibleEvents.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyAllMessages}
            className="text-green-600 hover:text-green-400 transition-colors text-[10px] px-2 py-0.5 border border-green-700/30 rounded"
            title="Copy all messages as JSON array"
          >
            {copiedAll ? "copied" : "copy all"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearEvents()
              setCollapsedMessages(new Set())
            }}
            className="text-green-600 hover:text-green-400 transition-colors text-[10px] px-2 py-0.5 border border-green-700/30 rounded"
          >
            clear
          </button>
        </div>
      </div>

      {/* Events list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {visibleEvents.length === 0 ? (
          <div className="text-green-700">No events yet...</div>
        ) : (
          visibleEvents.map((devEvent, index) => {
            let displayContent: string
            try {
              displayContent = JSON.stringify(devEvent.event, null, 2)
            } catch {
              displayContent = devEvent.rawSSE
            }

            const isCollapsed = collapsedMessages.has(index)
            const isCopied = copiedIndex === index

            return (
              <div key={`${devEvent.event.requestId}-${index}`} className="space-y-1 pb-3 border-b border-green-900/30">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleMessageCollapse(index)}
                    className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
                  >
                    <span className="text-green-700">[{new Date(devEvent.event.timestamp).toLocaleTimeString()}]</span>
                    <span className={getEventColor(devEvent.eventName)}>{devEvent.eventName}</span>
                    <span className="text-green-700 text-[10px]">{isCollapsed ? ">" : "v"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => copyMessage(displayContent, index)}
                    className="text-green-600 hover:text-green-400 transition-colors text-[10px] px-2 py-0.5"
                    title="Copy to clipboard"
                  >
                    {isCopied ? "copied" : "copy"}
                  </button>
                </div>

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
    </div>
  )
}
