"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useDebugVisible } from "@/lib/stores/debug-store"

type CompactState = "compacting" | "compacted"

interface CompactIndicatorProps {
  state: CompactState
  metadata?: {
    trigger?: string
    pre_tokens?: number
  }
}

export function CompactIndicator({ state, metadata }: CompactIndicatorProps) {
  const isDebugMode = useDebugVisible()
  const [dismissed, setDismissed] = useState(false)

  // Auto-dismiss after completion (non-debug mode only)
  useEffect(() => {
    if (state === "compacted" && !isDebugMode) {
      const timer = setTimeout(() => setDismissed(true), 3000)
      return () => clearTimeout(timer)
    }
  }, [state, isDebugMode])

  if (dismissed) return null

  const isCompacting = state === "compacting"

  return (
    <div className="py-2 flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, scale: 0.95, y: -5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 5 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            isCompacting
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50"
              : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50"
          }`}
        >
          {isCompacting ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                className="w-3 h-3"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </motion.div>
              <span>Compacting context</span>
            </>
          ) : (
            <>
              <motion.svg
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </motion.svg>
              <span>Context compacted</span>
              {isDebugMode && metadata?.pre_tokens && (
                <span className="opacity-60 font-mono">{metadata.pre_tokens.toLocaleString()} tokens</span>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// Wrapper components for backwards compatibility with message renderer
export function CompactingMessage() {
  return <CompactIndicator state="compacting" />
}

interface CompactBoundaryData {
  session_id: string
  uuid: string
  compact_metadata?: {
    trigger: string
    pre_tokens: number
  }
}

export function CompactBoundaryMessage({ data }: { data: CompactBoundaryData }) {
  return <CompactIndicator state="compacted" metadata={data.compact_metadata} />
}
