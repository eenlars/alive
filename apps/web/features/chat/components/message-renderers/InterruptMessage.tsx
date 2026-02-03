"use client"
import type { BridgeInterruptMessage } from "@/features/chat/lib/streaming/ndjson"
import { useDebugVisible } from "@/lib/stores/debug-store"

interface InterruptMessageProps {
  data: BridgeInterruptMessage["data"]
}

export function InterruptMessage({ data }: InterruptMessageProps) {
  const showDebug = useDebugVisible()

  return (
    <div className="py-3 mb-4 flex items-center justify-center">
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-amber-600 dark:text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-sm text-amber-800 dark:text-amber-200 font-medium">
            {data.message}
            {showDebug && (
              <span className="ml-2 text-xs text-amber-700 dark:text-amber-300 opacity-70">[{data.source}]</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
