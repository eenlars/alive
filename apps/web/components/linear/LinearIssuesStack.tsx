/**
 * LinearIssuesStack Component
 *
 * Displays the current user's Linear issues in a stack/list format.
 * Requires Linear OAuth connection.
 */

"use client"

import { AlertCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConnectIntegration } from "@/hooks/use-integrations"
import { type LinearIssue, useLinearIssues } from "@/hooks/use-linear-issues"

interface LinearIssuesStackProps {
  limit?: number
  includeCompleted?: boolean
  className?: string
  compact?: boolean
}

/**
 * Priority colors matching Linear's design
 */
const priorityColors: Record<number, string> = {
  0: "bg-zinc-400", // No priority
  1: "bg-orange-500", // Urgent
  2: "bg-red-500", // High
  3: "bg-yellow-500", // Medium
  4: "bg-blue-500", // Low
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function LinearIssuesStack({
  limit = 10,
  includeCompleted = false,
  className = "",
  compact = false,
}: LinearIssuesStackProps) {
  const { issues, loading, error, isConnected, refetch } = useLinearIssues({
    limit,
    includeCompleted,
  })

  const { connect, connecting } = useConnectIntegration("linear")

  // Not connected state
  if (!isConnected) {
    return (
      <div className={`rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 ${className}`}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <img src="/integrations/linear.svg" alt="Linear" className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-black dark:text-white mb-2">Connect Linear</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 max-w-xs">
            Connect your Linear account to see your assigned issues here.
          </p>
          <Button onClick={connect} disabled={connecting} size="sm">
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect Linear"
            )}
          </Button>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className={`rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 ${className}`}>
        <div className="flex items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading issues...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4 ${className}`}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Failed to load issues</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={refetch} className="flex-shrink-0">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Empty state
  if (issues.length === 0) {
    return (
      <div className={`rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 ${className}`}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No issues assigned to you</p>
          <Button variant="ghost" size="sm" onClick={refetch} className="mt-2">
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
        </div>
      </div>
    )
  }

  // Issues list
  return (
    <div className={`rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <img src="/integrations/linear.svg" alt="Linear" className="w-4 h-4" />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">My Issues</span>
          <span className="text-xs text-zinc-500 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded">
            {issues.length}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={refetch} className="h-7 w-7 p-0">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Issues */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {issues.map(issue => (
          <IssueRow key={issue.id} issue={issue} compact={compact} />
        ))}
      </div>
    </div>
  )
}

/**
 * Individual issue row
 */
function IssueRow({ issue, compact }: { issue: LinearIssue; compact: boolean }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
    >
      {/* Priority indicator */}
      <div
        className={`w-1 h-full min-h-[2.5rem] rounded-full ${priorityColors[issue.priority] || priorityColors[0]}`}
        title={issue.priorityLabel}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Identifier + Title */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                {issue.identifier}
              </span>
              <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{issue.title}</h4>
            </div>

            {/* Description (if not compact) */}
            {!compact && issue.description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                {issue.description.slice(0, 150)}
                {issue.description.length > 150 ? "..." : ""}
              </p>
            )}
          </div>

          {/* External link icon */}
          <ExternalLink className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-2">
          {/* State badge */}
          <span
            className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: `${issue.state.color}20`,
              color: issue.state.color,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: issue.state.color }} />
            {issue.state.name}
          </span>

          {/* Updated time */}
          <span className="text-xs text-zinc-400">{formatRelativeTime(issue.updatedAt)}</span>
        </div>
      </div>
    </a>
  )
}

export default LinearIssuesStack
