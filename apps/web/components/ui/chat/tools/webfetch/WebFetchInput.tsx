"use client"

import { ChevronRight, Globe } from "lucide-react"
import { useState } from "react"

interface WebFetchInputProps {
  url: string
  prompt: string
}

/**
 * Extract hostname for compact display
 */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url.length > 30 ? `${url.slice(0, 30)}...` : url
  }
}

export function WebFetchInput({ url, prompt }: WebFetchInputProps) {
  const [expanded, setExpanded] = useState(false)
  const hostname = getHostname(url)

  return (
    <div className="text-xs">
      {/* Compact chip - always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.09] transition-colors text-left"
      >
        <ChevronRight
          className={`w-3 h-3 text-black/40 dark:text-white/40 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <Globe className="w-3.5 h-3.5 text-black/40 dark:text-white/40" />
        <span className="text-black/70 dark:text-white/70">Fetching</span>
        <span className="text-black/50 dark:text-white/50 font-diatype-mono">{hostname}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 ml-1 pl-3 border-l-2 border-black/[0.06] dark:border-white/[0.08] space-y-1.5">
          <div>
            <span className="text-black/40 dark:text-white/40">URL: </span>
            <span className="text-black/60 dark:text-white/60 font-diatype-mono break-all">{url}</span>
          </div>
          <div>
            <span className="text-black/40 dark:text-white/40">Prompt: </span>
            <span className="text-black/60 dark:text-white/60">{prompt}</span>
          </div>
        </div>
      )}
    </div>
  )
}
