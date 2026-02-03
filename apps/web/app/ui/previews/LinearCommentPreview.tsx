/**
 * Linear Comment Preview
 *
 * Preview for LinearCommentResult and LinearCommentsResult components.
 * Uses shared fake data so edits to component are reflected immediately.
 */

"use client"

import { RotateCcw } from "lucide-react"
import { useState } from "react"
import { FAKE_LINEAR_COMMENT, FAKE_LINEAR_COMMENTS } from "@/components/linear/fake-data"
import { LinearCommentResult, LinearCommentsResult } from "@/components/linear/LinearCommentResult"

type ViewMode = "single" | "list" | "create-empty" | "create-with-input"

export function LinearCommentPreview() {
  const [viewMode, setViewMode] = useState<ViewMode>("single")

  const reset = () => {
    setViewMode("single")
  }

  const renderPreview = () => {
    switch (viewMode) {
      case "single":
        return <LinearCommentResult data={FAKE_LINEAR_COMMENT} toolName="mcp__linear__get_comment" />
      case "list":
        return <LinearCommentsResult data={FAKE_LINEAR_COMMENTS} toolName="mcp__linear__list_comments" />
      case "create-empty":
        return <LinearCommentResult data={{}} toolName="mcp__linear__create_comment" />
      case "create-with-input":
        return (
          <LinearCommentResult
            data={{}}
            toolName="mcp__linear__create_comment"
            toolInput={{ issueId: "issue-1", body: FAKE_LINEAR_COMMENT.body }}
          />
        )
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">LinearCommentResult</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Comment display for single, list, and create operations.
        </p>
      </div>

      <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
        <div className="flex-1 md:max-w-xl">{renderPreview()}</div>

        <div className="w-full md:w-56 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">View</h3>
            <div className="space-y-1.5">
              {[
                { id: "single", label: "Single Comment" },
                { id: "list", label: "Comments List" },
                { id: "create-empty", label: "Create (empty)" },
                { id: "create-with-input", label: "Create (with input)" },
              ].map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setViewMode(mode.id as ViewMode)}
                  className={`w-full text-left px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                    viewMode === mode.id
                      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={reset}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
