/**
 * Linear Issue Preview
 *
 * Preview for LinearIssueResult component (single issue).
 * Uses shared fake data so edits to component are reflected immediately.
 */

"use client"

import { RotateCcw } from "lucide-react"
import { useState } from "react"
import { FAKE_LINEAR_ISSUE } from "@/components/linear/fake-data"
import { LinearIssueResult } from "@/components/linear/LinearIssueResult"

type ActionType = "create" | "update" | "get"

export function LinearIssuePreview() {
  const [action, setAction] = useState<ActionType>("create")
  const [priority, setPriority] = useState(FAKE_LINEAR_ISSUE.priority.value)
  const [status, setStatus] = useState(FAKE_LINEAR_ISSUE.status)

  const toolName = `mcp__linear__${action}_issue`

  const issue = {
    ...FAKE_LINEAR_ISSUE,
    priority: { value: priority, name: ["No priority", "Urgent", "High", "Medium", "Low"][priority] },
    status,
  }

  const reset = () => {
    setAction("create")
    setPriority(FAKE_LINEAR_ISSUE.priority.value)
    setStatus(FAKE_LINEAR_ISSUE.status)
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">LinearIssueResult</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Single issue display for create, update, and get operations.
        </p>
      </div>

      <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
        <div className="flex-1 md:max-w-xl">
          <LinearIssueResult data={issue} toolName={toolName} />
        </div>

        <div className="w-full md:w-56 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Action
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(["create", "update", "get"] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAction(a)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    action === a
                      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Priority
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    priority === p
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {["None", "Urgent", "High", "Med", "Low"][p]}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Status
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {["Backlog", "Todo", "In Progress", "In Review", "Done"].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    status === s
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {s.replace("In ", "")}
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
