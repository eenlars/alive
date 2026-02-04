"use client"

import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react"
import { useState } from "react"

interface WebFetchOutputProps {
  /** The response text from fetching and processing the URL */
  content?: string
  /** URL that was fetched (from tool input) */
  url?: string
  /** Error message if fetch failed */
  error?: string
}

/**
 * Extract hostname for display
 */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function WebFetchOutput({ content, url, error }: WebFetchOutputProps) {
  const [expanded, setExpanded] = useState(true)
  const hostname = url ? getHostname(url) : "website"

  // Error state - compact inline error
  if (error) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-500/[0.08] dark:bg-red-500/[0.12] text-xs">
        <AlertCircle className="w-3.5 h-3.5 text-red-500" />
        <span className="text-red-600 dark:text-red-400">Failed to fetch {hostname}</span>
      </div>
    )
  }

  // Success state - compact chip, expandable content
  return (
    <div className="text-xs">
      {/* Compact chip */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.09] transition-colors text-left"
      >
        <ChevronRight
          className={`w-3 h-3 text-black/40 dark:text-white/40 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-black/70 dark:text-white/70">Fetched</span>
        <span className="text-black/50 dark:text-white/50 font-diatype-mono">{hostname}</span>
      </button>

      {/* Expanded content */}
      {expanded && content && (
        <div className="mt-2 p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] max-h-48 overflow-auto">
          <pre className="text-[11px] text-black/60 dark:text-white/60 font-diatype-mono leading-relaxed whitespace-pre-wrap break-words">
            {content.length > 3000 ? `${content.slice(0, 3000)}...` : content}
          </pre>
        </div>
      )}
    </div>
  )
}
