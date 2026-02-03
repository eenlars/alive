/**
 * LinearCommentResult Component
 *
 * Renders Linear comment results from MCP tools.
 * Handles both create_comment (often returns {}) and list_comments.
 *
 * UX: Show confirmation for empty results, full comment for populated results
 */

"use client"

import { Check, Clock, MessageSquare, User } from "lucide-react"
import type { ToolResultRendererProps } from "@/lib/tools/tool-registry"

/**
 * Comment from Linear MCP
 */
interface LinearMcpComment {
  id?: string
  body?: string
  user?: {
    id?: string
    name?: string
    email?: string
  }
  createdAt?: string
  updatedAt?: string
  issue?: {
    id?: string
    identifier?: string
    title?: string
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 10) return "just now"
  if (diffSecs < 60) return `${diffSecs}s ago`
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

/**
 * Render markdown-like text with basic formatting
 */
function renderCommentBody(body: string) {
  // Split by double newlines for paragraphs
  const paragraphs = body.split(/\n\n+/)

  return (
    <div className="space-y-2">
      {paragraphs.map((para, i) => {
        // Check if it's a list
        const lines = para.split("\n")
        const isList = lines.every(line => line.trim().startsWith("- ") || line.trim() === "")

        if (isList) {
          const items = lines.filter(line => line.trim().startsWith("- "))
          return (
            <ul key={i} className="list-disc list-inside space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {items.map((item, j) => (
                <li key={j}>{item.trim().slice(2)}</li>
              ))}
            </ul>
          )
        }

        return (
          <p key={i} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {para}
          </p>
        )
      })}
    </div>
  )
}

/**
 * Input type for create_comment
 */
interface CreateCommentInput {
  issueId?: string
  body?: string
}

/**
 * Single comment result (for create_comment)
 */
export function LinearCommentResult({
  data,
  toolName,
  toolInput,
}: ToolResultRendererProps<LinearMcpComment | Record<string, never>>) {
  const isCreate = toolName.includes("create")
  const isEmpty = !data || Object.keys(data).length === 0
  const input = toolInput as CreateCommentInput | undefined

  // Empty result from create_comment - show the comment that was added from input
  if (isEmpty && isCreate && input?.body) {
    return (
      <div className="mt-2 rounded-xl border border-emerald-200 dark:border-emerald-800/30 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
        {/* Success header */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/30">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Comment added</span>
        </div>

        {/* Comment content from input */}
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">You</span>
            <span className="text-xs text-zinc-400">just now</span>
          </div>
          {renderCommentBody(input.body)}
        </div>
      </div>
    )
  }

  // Empty result without input body - simple confirmation
  if (isEmpty && isCreate) {
    return (
      <div className="mt-2 rounded-xl border border-emerald-200 dark:border-emerald-800/30 bg-emerald-50 dark:bg-emerald-900/10 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Comment added</p>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Your comment was posted to the issue</p>
          </div>
        </div>
      </div>
    )
  }

  // Empty result for non-create - minimal feedback
  if (isEmpty) {
    return (
      <div className="mt-2 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-900/50 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No comment data</p>
      </div>
    )
  }

  // Full comment display
  const comment = data as LinearMcpComment

  return (
    <div className="mt-2 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700/50">
        <MessageSquare className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {isCreate ? "Comment added" : "Comment"}
        </span>
        {comment.issue?.identifier && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">on {comment.issue.identifier}</span>
        )}
      </div>

      {/* Comment content */}
      <div className="p-4">
        {/* Author row */}
        {(comment.user?.name || comment.user?.email || comment.createdAt) && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {comment.user?.name || comment.user?.email || "You"}
              </span>
              {comment.createdAt && (
                <span className="text-xs text-zinc-400 ml-2">{formatRelativeTime(comment.createdAt)}</span>
              )}
            </div>
          </div>
        )}

        {/* Comment body */}
        {comment.body && renderCommentBody(comment.body)}
      </div>
    </div>
  )
}

/**
 * List of comments result
 */
export function LinearCommentsResult({ data }: ToolResultRendererProps<LinearMcpComment[]>) {
  const comments = Array.isArray(data) ? data : []

  if (comments.length === 0) {
    return (
      <div className="mt-2 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-900/50 text-center">
        <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No comments yet</p>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700/50">
        <MessageSquare className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Comments</span>
        <span className="text-xs text-zinc-500 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full font-medium">
          {comments.length}
        </span>
      </div>

      {/* Comments list */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[400px] overflow-y-auto">
        {comments.map((comment, i) => (
          <div key={comment.id || i} className="p-4">
            {/* Author row */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <User className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex-1">
                {comment.user?.name || comment.user?.email || "Unknown"}
              </span>
              {comment.createdAt && (
                <span className="text-xs text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(comment.createdAt)}
                </span>
              )}
            </div>

            {/* Comment body */}
            {comment.body && renderCommentBody(comment.body)}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Validate comment data
 */
export function validateLinearComment(data: unknown): boolean {
  // Accept empty objects (create_comment returns {})
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return true
  }
  return false
}

export function validateLinearComments(data: unknown): boolean {
  return Array.isArray(data)
}
