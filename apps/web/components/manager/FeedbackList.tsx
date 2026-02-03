"use client"

interface FeedbackEntry {
  id: string
  workspace: string
  timestamp: string
  feedback: string
  conversationId?: string
  userAgent?: string
}

interface FeedbackListProps {
  feedback: FeedbackEntry[]
  loading: boolean
  onRefresh: () => void
}

export function FeedbackList({ feedback, loading, onRefresh }: FeedbackListProps) {
  return (
    <>
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {feedback.length} feedback {feedback.length !== 1 ? "entries" : "entry"}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 dark:bg-[#333] dark:text-slate-300 dark:border-white/20 dark:hover:bg-[#444] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-white/10">
        {loading ? (
          <div className="text-center py-12 px-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading feedback...</p>
          </div>
        ) : feedback.length === 0 ? (
          <div className="text-center py-12 px-6">
            <p className="text-sm text-slate-600 dark:text-slate-400">No feedback submitted yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Feedback from users will appear here</p>
          </div>
        ) : (
          feedback.map(entry => (
            <div key={entry.id} className="px-4 sm:px-6 py-4 sm:py-5 hover:bg-slate-50 dark:hover:bg-[#333]">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="font-medium text-sm text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-none">
                    {entry.workspace}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(entry.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {entry.conversationId && (
                  <span className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 rounded self-start">
                    Has conversation
                  </span>
                )}
              </div>

              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap mb-3 break-words">
                {entry.feedback}
              </div>

              {entry.userAgent && (
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{entry.userAgent}</div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  )
}
