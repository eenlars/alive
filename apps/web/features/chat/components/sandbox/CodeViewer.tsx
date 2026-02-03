"use client"

import { Check, Copy, X } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFileContent } from "./hooks/useFileContent"
import { getFileColor } from "./lib/file-colors"
import { getFileName } from "./lib/file-path"
import { TOKEN_COLORS, type Token, tokenizeLine } from "./lib/syntax"
import { ErrorMessage, LoadingSpinner } from "./ui"

interface CodeViewerProps {
  workspace: string
  filePath: string
  onClose: () => void
}

// Line height in pixels (must match CSS)
const LINE_HEIGHT = 21 // 13px font * 1.6 line-height ≈ 21px
// Buffer lines above/below viewport
const OVERSCAN = 10
// Virtualization threshold - only virtualize files with more lines
const VIRTUALIZATION_THRESHOLD = 200

export function CodeViewer({ workspace, filePath, onClose }: CodeViewerProps) {
  const { file, loading, error } = useFileContent(workspace, filePath)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  // Reset scroll on file change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
    setScrollTop(0)
  }, [filePath])

  // Track container height
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })

    observer.observe(container)
    setContainerHeight(container.clientHeight)

    return () => observer.disconnect()
  }, [])

  // Handle scroll for virtualization
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const handleCopy = async () => {
    if (!file?.content) return
    try {
      await navigator.clipboard.writeText(file.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore
    }
  }

  const lines = useMemo(() => file?.content.split("\n") || [], [file?.content])
  const lineNumberWidth = Math.max(3, String(lines.length).length)
  const filename = getFileName(filePath)
  const language = file?.language || "plaintext"

  // Memoize tokenization for all lines
  const tokenizedLines = useMemo(() => {
    return lines.map(line => tokenizeLine(line, language))
  }, [lines, language])

  // Calculate visible range for virtualization
  const shouldVirtualize = lines.length > VIRTUALIZATION_THRESHOLD
  const totalHeight = lines.length * LINE_HEIGHT

  const visibleRange = useMemo(() => {
    if (!shouldVirtualize) {
      return { start: 0, end: lines.length }
    }
    const start = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN)
    const visibleCount = Math.ceil(containerHeight / LINE_HEIGHT)
    const end = Math.min(lines.length, start + visibleCount + OVERSCAN * 2)
    return { start, end }
  }, [scrollTop, containerHeight, lines.length, shouldVirtualize])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-9 px-3 flex items-center gap-2 border-b border-white/[0.04] bg-neutral-900/30 shrink-0">
        <span className={`${getFileColor(filename)}`}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </span>
        <span className="text-[13px] text-neutral-300 truncate flex-1">{filename}</span>

        <button
          type="button"
          onClick={handleCopy}
          disabled={!file?.content}
          className="p-1 text-neutral-600 hover:text-neutral-300 rounded transition-colors disabled:opacity-30"
          title={copied ? "Copied!" : "Copy"}
        >
          {copied ? (
            <Check size={14} strokeWidth={1.5} className="text-emerald-500" />
          ) : (
            <Copy size={14} strokeWidth={1.5} />
          )}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="p-1 text-neutral-600 hover:text-neutral-300 rounded transition-colors"
          title="Close (Esc)"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto" onScroll={shouldVirtualize ? handleScroll : undefined}>
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : shouldVirtualize ? (
          // Virtualized rendering for large files
          <div style={{ height: totalHeight, position: "relative" }}>
            <table
              className="font-mono text-[13px] leading-[1.6] w-full border-collapse absolute"
              style={{ top: visibleRange.start * LINE_HEIGHT }}
            >
              <tbody>
                {tokenizedLines.slice(visibleRange.start, visibleRange.end).map((tokens, i) => (
                  <CodeLine
                    key={visibleRange.start + i}
                    lineNumber={visibleRange.start + i + 1}
                    tokens={tokens}
                    lineNumberWidth={lineNumberWidth}
                    originalLine={lines[visibleRange.start + i]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // Regular rendering for small files
          <table className="font-mono text-[13px] leading-[1.6] w-full border-collapse">
            <tbody>
              {tokenizedLines.map((tokens, index) => (
                <CodeLine
                  key={index}
                  lineNumber={index + 1}
                  tokens={tokens}
                  lineNumberWidth={lineNumberWidth}
                  originalLine={lines[index]}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

interface CodeLineProps {
  lineNumber: number
  tokens: Token[]
  lineNumberWidth: number
  originalLine: string
}

// Memoize individual lines to prevent re-renders
const CodeLine = memo(function CodeLine({ lineNumber, tokens, lineNumberWidth, originalLine }: CodeLineProps) {
  return (
    <tr className="hover:bg-white/[0.02]">
      <td
        className="px-3 text-right text-neutral-700 select-none align-top sticky left-0 bg-[#0d0d0d]"
        style={{ width: `${lineNumberWidth + 2}ch`, minWidth: `${lineNumberWidth + 2}ch` }}
      >
        {lineNumber}
      </td>
      <td className="pl-4 pr-4 whitespace-pre">
        {tokens.map((token, i) => (
          <span key={i} className={TOKEN_COLORS[token.type]}>
            {token.value}
          </span>
        ))}
        {originalLine === "" && "\u00A0"}
      </td>
    </tr>
  )
})
