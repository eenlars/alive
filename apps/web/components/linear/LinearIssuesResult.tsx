/**
 * LinearIssuesResult Component
 *
 * Renders a list of Linear issues from MCP tool results (mcp__linear__list_issues).
 *
 * UX Principles:
 * - Full titles visible, wrapped not truncated
 * - Clear visual priority/status indicators
 * - Scannable list with good information density
 * - Sorting and filtering for power users
 */

"use client"

import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, ExternalLink, Filter, Folder, User } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import type { ToolResultRendererProps } from "@/lib/tools/tool-registry"

interface LinearMcpIssue {
  id: string
  identifier: string
  title: string
  description?: string
  priority: {
    value: number
    name: string
  }
  status: string
  url: string
  createdAt: string
  updatedAt: string
  project?: string
  team?: string
  assignee?: string
  labels?: Array<{ name: string; color?: string }>
}

type SortField = "status" | "priority" | "updated" | "identifier"
type SortDirection = "asc" | "desc"

const priorityConfig: Record<number, { color: string; bg: string; border: string; label: string; sortOrder: number }> =
  {
    0: {
      color: "bg-zinc-300 dark:bg-zinc-600",
      bg: "bg-zinc-50 dark:bg-zinc-800/50",
      border: "border-zinc-200 dark:border-zinc-700",
      label: "No priority",
      sortOrder: 99, // Treat as lowest
    },
    1: {
      color: "bg-orange-500",
      bg: "bg-orange-50 dark:bg-orange-900/10",
      border: "border-orange-200 dark:border-orange-800/30",
      label: "Urgent",
      sortOrder: 1,
    },
    2: {
      color: "bg-red-500",
      bg: "bg-red-50 dark:bg-red-900/10",
      border: "border-red-200 dark:border-red-800/30",
      label: "High",
      sortOrder: 2,
    },
    3: {
      color: "bg-yellow-500",
      bg: "bg-yellow-50 dark:bg-yellow-900/10",
      border: "border-yellow-200 dark:border-yellow-800/30",
      label: "Medium",
      sortOrder: 3,
    },
    4: {
      color: "bg-blue-500",
      bg: "bg-blue-50 dark:bg-blue-900/10",
      border: "border-blue-200 dark:border-blue-800/30",
      label: "Low",
      sortOrder: 4,
    },
  }

function getPrioritySortOrder(value: number): number {
  return priorityConfig[value]?.sortOrder ?? 99
}

const statusConfig: Record<string, { bg: string; text: string; dot: string; order: number }> = {
  "In Progress": {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-700 dark:text-yellow-400",
    dot: "bg-yellow-500",
    order: 0,
  },
  "In Review": {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-700 dark:text-purple-400",
    dot: "bg-purple-500",
    order: 1,
  },
  Todo: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400", dot: "bg-zinc-400", order: 2 },
  Backlog: {
    bg: "bg-zinc-100 dark:bg-zinc-800",
    text: "text-zinc-600 dark:text-zinc-400",
    dot: "bg-zinc-400",
    order: 3,
  },
  Done: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    order: 4,
  },
  Canceled: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
    order: 5,
  },
}

function getStatusStyle(status: string) {
  return statusConfig[status] || { ...statusConfig.Backlog, order: 99 }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function getSortDescription(field: SortField, direction: SortDirection): string {
  const descriptions: Record<SortField, { asc: string; desc: string }> = {
    status: { asc: "In Progress first", desc: "Done first" },
    priority: { asc: "Urgent first", desc: "Low priority first" },
    updated: { asc: "Oldest first", desc: "Recent first" },
    identifier: { asc: "A → Z", desc: "Z → A" },
  }
  return descriptions[field][direction]
}

// Statuses hidden by default (completed/closed states)
const HIDDEN_BY_DEFAULT = new Set(["Done", "Duplicate", "Canceled", "Cancelled", "Won't Fix"])

export function LinearIssuesResult({ data }: ToolResultRendererProps<LinearMcpIssue[]>) {
  const issues = Array.isArray(data) ? data : []
  // Multi-select: Set of selected statuses (empty = show active only, excluding hidden)
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [sortField, setSortField] = useState<SortField>("status")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [showFilters, setShowFilters] = useState(false)

  // Get unique statuses from issues, split into active and hidden
  const { activeStatuses, hiddenStatuses } = useMemo(() => {
    const statuses = new Set(issues.map(i => i.status))
    const active: string[] = []
    const hidden: string[] = []

    Array.from(statuses)
      .sort((a, b) => getStatusStyle(a).order - getStatusStyle(b).order)
      .forEach(status => {
        if (HIDDEN_BY_DEFAULT.has(status)) {
          hidden.push(status)
        } else {
          active.push(status)
        }
      })

    return { activeStatuses: active, hiddenStatuses: hidden }
  }, [issues])

  // Toggle a status in multi-select
  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  // Filter and sort issues
  const filteredAndSortedIssues = useMemo(() => {
    let result = [...issues]

    // Apply filter
    if (selectedStatuses.size > 0) {
      // Show only selected statuses
      result = result.filter(i => selectedStatuses.has(i.status))
    } else {
      // Default: show active statuses only (hide Done/Duplicate etc)
      if (!showHidden) {
        result = result.filter(i => !HIDDEN_BY_DEFAULT.has(i.status))
      }
    }

    // Apply sort
    result.sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case "status":
          comparison = getStatusStyle(a.status).order - getStatusStyle(b.status).order
          break
        case "priority":
          comparison = getPrioritySortOrder(a.priority?.value ?? 0) - getPrioritySortOrder(b.priority?.value ?? 0)
          break
        case "updated":
          // a - b so asc = oldest first, desc = recent first
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
        case "identifier":
          comparison = a.identifier.localeCompare(b.identifier)
          break
      }

      return sortDirection === "asc" ? comparison : -comparison
    })

    return result
  }, [issues, selectedStatuses, showHidden, sortField, sortDirection])

  // Count by status for badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    issues.forEach(i => {
      counts[i.status] = (counts[i.status] || 0) + 1
    })
    return counts
  }, [issues])

  // Count active issues (excluding hidden statuses)
  const activeIssueCount = useMemo(() => {
    return issues.filter(i => !HIDDEN_BY_DEFAULT.has(i.status)).length
  }, [issues])

  if (issues.length === 0) {
    return (
      <div className="mt-2 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-900/50 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No issues found</p>
      </div>
    )
  }

  // Smart default directions: what users typically want first
  const defaultDirections: Record<SortField, SortDirection> = {
    status: "asc", // In Progress first
    priority: "asc", // Urgent first
    updated: "desc", // Recent first (note: sort logic already inverts for dates)
    identifier: "asc", // A → Z
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection(defaultDirections[field])
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700/50">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 100 100" fill="currentColor">
            <path d="M50 0L93.3 25v50L50 100 6.7 75V25L50 0z" />
          </svg>
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Linear Issues</span>
          <span className="text-xs text-zinc-500 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full font-medium">
            {filteredAndSortedIssues.length !== activeIssueCount
              ? `${filteredAndSortedIssues.length}/${issues.length}`
              : `${activeIssueCount}${hiddenStatuses.length > 0 ? ` of ${issues.length}` : ""}`}
          </span>
          {hiddenStatuses.length > 0 && !showHidden && selectedStatuses.size === 0 && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              +{issues.length - activeIssueCount} hidden
            </span>
          )}
        </div>

        {/* Filter/Sort toggle */}
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
            showFilters || selectedStatuses.size > 0 || showHidden
              ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
              : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Filter className="w-3 h-3" />
          {selectedStatuses.size > 0 ? `${selectedStatuses.size} selected` : "Filter"}
          <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Filter/Sort controls */}
      {showFilters && (
        <div className="px-4 py-3 bg-zinc-50/50 dark:bg-zinc-800/30 border-b border-zinc-200 dark:border-zinc-700/50 space-y-3">
          {/* Status filter - multi-select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">
                Filter by Status
              </span>
              {selectedStatuses.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedStatuses(new Set())}
                  className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {/* Active statuses */}
              {activeStatuses.map(status => {
                const style = getStatusStyle(status)
                const isSelected = selectedStatuses.has(status)
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={`text-xs px-2 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : `${style.bg} ${style.text} hover:opacity-80`
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white dark:bg-zinc-900" : style.dot}`}
                    />
                    {status} ({statusCounts[status] || 0})
                  </button>
                )
              })}

              {/* Divider if hidden statuses exist */}
              {hiddenStatuses.length > 0 && <span className="text-zinc-300 dark:text-zinc-600 mx-1">|</span>}

              {/* Hidden statuses (Done, Duplicate, etc) */}
              {hiddenStatuses.map(status => {
                const style = getStatusStyle(status)
                const isSelected = selectedStatuses.has(status)
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={`text-xs px-2 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:opacity-80"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white dark:bg-zinc-900" : style.dot}`}
                    />
                    {status} ({statusCounts[status] || 0})
                  </button>
                )
              })}
            </div>
            {/* Show all toggle when no selection */}
            {selectedStatuses.size === 0 && hiddenStatuses.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHidden(!showHidden)}
                className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                {showHidden ? "Hide completed" : "Show all including completed"}
              </button>
            )}
          </div>

          {/* Sort controls */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">
                Sort by
              </span>
              {/* Current sort description */}
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {getSortDescription(sortField, sortDirection)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { field: "status", label: "Status" },
                  { field: "priority", label: "Priority" },
                  { field: "updated", label: "Updated" },
                  { field: "identifier", label: "ID" },
                ] as const
              ).map(({ field, label }) => {
                const isActive = sortField === field
                const Arrow = sortDirection === "asc" ? ArrowUp : ArrowDown
                return (
                  <button
                    key={field}
                    type="button"
                    onClick={() => handleSort(field)}
                    className={`text-xs px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                      isActive
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {label}
                    {isActive && <Arrow className="w-3 h-3" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Issues list */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[500px] overflow-y-auto">
        {filteredAndSortedIssues.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No issues match the filter</p>
            <button
              type="button"
              onClick={() => {
                setSelectedStatuses(new Set())
                setShowHidden(false)
              }}
              className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Clear filter
            </button>
          </div>
        ) : (
          filteredAndSortedIssues.map(issue => <IssueRow key={issue.id} issue={issue} />)
        )}
      </div>
    </div>
  )
}

function IssueRow({ issue }: { issue: LinearMcpIssue }) {
  const [copied, setCopied] = useState(false)
  const statusStyle = getStatusStyle(issue.status)
  const priority = priorityConfig[issue.priority?.value ?? 0]
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const copyIdentifier = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = undefined
    }

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(issue.identifier)
        setCopied(true)
        timeoutRef.current = setTimeout(() => {
          setCopied(false)
          timeoutRef.current = undefined
        }, 1500)
      } else {
        // Fallback for insecure contexts (http://)
        fallbackCopyToClipboard(issue.identifier)
        setCopied(true)
        timeoutRef.current = setTimeout(() => {
          setCopied(false)
          timeoutRef.current = undefined
        }, 1500)
      }
    } catch (error) {
      console.error("[LinearIssuesResult] Failed to copy identifier:", error)
      toast.error("Failed to copy to clipboard")
      // Don't set copied to true on error
    }
  }

  /**
   * Fallback copy method for insecure contexts (http://)
   * Creates a temporary textarea element for the copy operation
   */
  const fallbackCopyToClipboard = (text: string) => {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.left = "-999999px"
    textArea.style.top = "-999999px"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    try {
      document.execCommand("copy")
    } catch (error) {
      console.error("[LinearIssuesResult] Fallback copy failed:", error)
      throw error // Re-throw to be caught by main try-catch
    } finally {
      document.body.removeChild(textArea)
    }
  }

  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${priority.bg}`}
    >
      {/* Priority bar */}
      <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${priority.color}`} title={issue.priority?.name} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: identifier + title */}
        <div className="flex items-start gap-2 mb-1.5">
          <button
            type="button"
            onClick={copyIdentifier}
            className="text-xs font-mono font-medium text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5 flex items-center gap-1 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
            title="Copy identifier"
          >
            {issue.identifier}
            {copied ? (
              <Check className="w-3 h-3 text-emerald-500" />
            ) : (
              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
            )}
          </button>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug flex-1">{issue.title}</h4>
          <ExternalLink className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
        </div>

        {/* Description preview */}
        {issue.description && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2 leading-relaxed">
            {issue.description}
          </p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status badge */}
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
            {issue.status}
          </span>

          {/* Project */}
          {issue.project && (
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              <Folder className="w-3 h-3" />
              <span className="max-w-[120px] truncate">{issue.project}</span>
            </span>
          )}

          {/* Assignee */}
          {issue.assignee && (
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              <User className="w-3 h-3" />
              <span className="max-w-[100px] truncate">{issue.assignee}</span>
            </span>
          )}

          {/* Time */}
          <span className="text-[10px] text-zinc-400 ml-auto">{formatRelativeTime(issue.updatedAt)}</span>
        </div>
      </div>
    </a>
  )
}

export function validateLinearIssues(data: unknown): boolean {
  if (!Array.isArray(data)) return false
  if (data.length === 0) return true
  const first = data[0]
  return typeof first === "object" && first !== null && "identifier" in first && "title" in first
}
