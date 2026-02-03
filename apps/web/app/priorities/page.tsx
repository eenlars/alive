"use client"

import { useEffect, useState } from "react"

interface Priority {
  id: string
  topic: string
  content: string
  context: string
  status: "not_started" | "in_progress" | "done" | "blocked"
  tags: string[]
}

const PRIORITY_ORDER = [
  "business-priority-1", // ICP
  "business-priority-2", // Financials
  "business-priority-3", // Differentiation
  "business-priority-4", // Value prop clarity
  "business-priority-5", // Service to self-serve
]

export default function PrioritiesPage() {
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPriorities()
  }, [])

  const fetchPriorities = async () => {
    try {
      const response = await fetch("/api/priorities")
      if (response.ok) {
        const data = await response.json()
        // Sort by predefined order
        const sorted = data.priorities.sort((a: Priority, b: Priority) => {
          const aIndex = PRIORITY_ORDER.indexOf(a.topic)
          const bIndex = PRIORITY_ORDER.indexOf(b.topic)
          return aIndex - bIndex
        })
        setPriorities(sorted)
      }
    } catch (error) {
      console.error("Failed to fetch priorities:", error)
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (id: string, status: Priority["status"]) => {
    try {
      await fetch("/api/priorities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      setPriorities(prev => prev.map(p => (p.id === id ? { ...p, status } : p)))
    } catch (error) {
      console.error("Failed to update status:", error)
    }
  }

  const getStatusColor = (status: Priority["status"]) => {
    switch (status) {
      case "done":
        return "bg-green-500"
      case "in_progress":
        return "bg-yellow-500"
      case "blocked":
        return "bg-red-500"
      default:
        return "bg-gray-300 dark:bg-gray-600"
    }
  }

  const getStatusLabel = (status: Priority["status"]) => {
    switch (status) {
      case "done":
        return "Done"
      case "in_progress":
        return "In Progress"
      case "blocked":
        return "Blocked"
      default:
        return "Not Started"
    }
  }

  const getPriorityLabel = (index: number) => {
    if (index < 3) return { label: "P0", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" }
    return { label: "P1", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" }
  }

  const completedCount = priorities.filter(p => p.status === "done").length
  const progress = priorities.length > 0 ? (completedCount / priorities.length) * 100 : 0

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-black/60 dark:text-white/60">Loading priorities...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold text-black dark:text-white mb-2">Business Priorities</h1>
          <p className="text-black/60 dark:text-white/60">From Philips Innovation Award panel feedback (Jan 2026)</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-10">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-black/60 dark:text-white/60">Progress</span>
            <span className="text-black dark:text-white font-medium">
              {completedCount}/{priorities.length} complete
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Priority List */}
        <div className="space-y-4">
          {priorities.map((priority, index) => (
            <div
              key={priority.id}
              className={`border rounded-lg p-5 transition-all ${
                priority.status === "done"
                  ? "border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-900/10"
                  : "border-gray-200 dark:border-white/10 bg-white dark:bg-black"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Status indicator */}
                <button
                  type="button"
                  onClick={() => {
                    const nextStatus: Priority["status"][] = ["not_started", "in_progress", "done", "blocked"]
                    const currentIndex = nextStatus.indexOf(priority.status)
                    const next = nextStatus[(currentIndex + 1) % nextStatus.length]
                    updateStatus(priority.id, next)
                  }}
                  className={`mt-1 w-5 h-5 rounded-full ${getStatusColor(priority.status)} flex-shrink-0 hover:ring-2 hover:ring-offset-2 hover:ring-gray-400 transition-all`}
                  title={`Status: ${getStatusLabel(priority.status)}. Click to change.`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${getPriorityLabel(index).color}`}>
                      {getPriorityLabel(index).label}
                    </span>
                    <span className="text-xs text-black/40 dark:text-white/40">{getStatusLabel(priority.status)}</span>
                  </div>

                  <p
                    className={`text-black dark:text-white font-medium mb-2 ${
                      priority.status === "done" ? "line-through opacity-60" : ""
                    }`}
                  >
                    {priority.content}
                  </p>

                  <p className="text-sm text-black/60 dark:text-white/60">{priority.context}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {priorities.length === 0 && (
          <div className="text-center py-12 text-black/40 dark:text-white/40">
            No priorities found. Add them via the memory database.
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-white/10">
          <p className="text-sm text-black/40 dark:text-white/40">
            Source:{" "}
            <a
              href="/docs/business/panel-feedback/philips-innovation-award-2026.md"
              className="underline hover:text-black dark:hover:text-white"
            >
              docs/business/panel-feedback/philips-innovation-award-2026.md
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
