/**
 * LinearIssueResult Component
 *
 * Displays a Linear issue as a clean card. No collapse/expand - when
 * someone asks for an issue, they want to see it.
 */

"use client"

import { Clock, ExternalLink, Folder, Pencil, Plus, User } from "lucide-react"
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

const priorityConfig: Record<number, { bg: string; text: string; label: string }> = {
  0: { bg: "bg-zinc-500/10", text: "text-zinc-500", label: "No priority" },
  1: { bg: "bg-orange-500/10", text: "text-orange-500", label: "Urgent" },
  2: { bg: "bg-red-500/10", text: "text-red-500", label: "High" },
  3: { bg: "bg-yellow-500/10", text: "text-yellow-500", label: "Medium" },
  4: { bg: "bg-blue-500/10", text: "text-blue-500", label: "Low" },
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  Backlog: { bg: "bg-zinc-500/10", text: "text-zinc-500" },
  Todo: { bg: "bg-zinc-500/10", text: "text-zinc-500" },
  "In Progress": { bg: "bg-yellow-500/10", text: "text-yellow-500" },
  "In Review": { bg: "bg-purple-500/10", text: "text-purple-500" },
  Done: { bg: "bg-emerald-500/10", text: "text-emerald-500" },
  Canceled: { bg: "bg-red-500/10", text: "text-red-500" },
}

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

function getActionBadge(toolName: string) {
  if (toolName.includes("create"))
    return { Icon: Plus, label: "Created", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" }
  if (toolName.includes("update"))
    return { Icon: Pencil, label: "Updated", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" }
  return null
}

export function LinearIssueResult({ data, toolName }: ToolResultRendererProps<LinearMcpIssue>) {
  const issue = data
  if (!issue?.identifier) return null

  const actionBadge = getActionBadge(toolName)
  const status = statusConfig[issue.status] || statusConfig.Backlog
  const priority = priorityConfig[issue.priority?.value ?? 0]

  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.09] transition-colors overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-3 pb-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-medium text-indigo-600 dark:text-indigo-400 flex-shrink-0">
            {issue.identifier}
          </span>
          {actionBadge && (
            <span
              className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md ${actionBadge.bg} ${actionBadge.text}`}
            >
              <actionBadge.Icon className="w-3 h-3" />
              {actionBadge.label}
            </span>
          )}
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-black/30 dark:text-white/30 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>

      {/* Title */}
      <div className="px-3 pt-1.5 pb-2">
        <h3 className="text-sm font-medium text-black/80 dark:text-white/80 leading-snug">{issue.title}</h3>
      </div>

      {/* Description */}
      {issue.description && (
        <div className="px-3 pb-2">
          <p className="text-xs text-black/50 dark:text-white/50 leading-relaxed line-clamp-2">{issue.description}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-black/[0.02] dark:bg-white/[0.02]">
        {/* Status */}
        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md ${status.bg} ${status.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.text.replace("text-", "bg-")}`} />
          {issue.status}
        </span>

        {/* Priority */}
        <span
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${priority.bg} ${priority.text}`}
        >
          {issue.priority?.name || priority.label}
        </span>

        {/* Metadata */}
        <div className="flex items-center gap-2 ml-auto text-xs text-black/40 dark:text-white/40">
          {issue.assignee && (
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              {issue.assignee}
            </span>
          )}
          {issue.project && (
            <span className="inline-flex items-center gap-1">
              <Folder className="w-3 h-3" />
              {issue.project}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(issue.updatedAt)}
          </span>
        </div>
      </div>
    </a>
  )
}

export function validateLinearIssue(data: unknown): boolean {
  if (!data || typeof data !== "object") return false
  const issue = data as Record<string, unknown>
  return "identifier" in issue && "title" in issue
}
