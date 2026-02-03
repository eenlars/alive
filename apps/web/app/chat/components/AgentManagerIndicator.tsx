"use client"

interface AgentManagerIndicatorProps {
  isEvaluating: boolean
  message: string
  workspace: string | null
  agentManagerAbortRef: React.RefObject<AbortController | null>
  agentManagerTimeoutRef: React.RefObject<NodeJS.Timeout | null>
  onCancel: () => void
}

export function AgentManagerIndicator({
  isEvaluating,
  workspace,
  agentManagerAbortRef,
  agentManagerTimeoutRef,
  onCancel,
}: AgentManagerIndicatorProps) {
  if (!isEvaluating) return null

  const handleStop = () => {
    // Abort the client-side fetch request
    agentManagerAbortRef.current?.abort()

    // Send cancel request to server to stop server-side processing
    if (workspace) {
      fetch(`/api/evaluate-progress?workspace=${encodeURIComponent(workspace)}`, {
        method: "DELETE",
        credentials: "include",
      }).catch(() => {
        // Ignore errors - best effort cancellation
      })
    }

    // Clear any pending auto-send timeout
    if (agentManagerTimeoutRef.current) {
      clearTimeout(agentManagerTimeoutRef.current)
      agentManagerTimeoutRef.current = null
    }

    onCancel()
  }

  return (
    <div className="my-4 flex items-center gap-3 text-xs text-purple-600 dark:text-purple-400">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" />
        </div>
        <span className="font-medium">Agent Manager evaluating...</span>
      </div>
      <button
        type="button"
        onClick={handleStop}
        className="px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded transition-colors"
      >
        Stop
      </button>
    </div>
  )
}
