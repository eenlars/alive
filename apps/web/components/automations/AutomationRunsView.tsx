"use client"

import { AlertCircle, CheckCircle2, Clock, History, RefreshCw, XCircle } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { type AutomationJob, useAutomationRunsQuery } from "@/lib/hooks/useSettingsQueries"

function RunMetaBadges({ result }: { result: Record<string, unknown> | null }) {
  if (!result) return null
  const numTurns = typeof result.num_turns === "number" ? result.num_turns : null
  const costUsd = typeof result.cost_usd === "number" ? result.cost_usd : null
  const usage =
    result.usage && typeof result.usage === "object" && !Array.isArray(result.usage)
      ? (result.usage as Record<string, unknown>)
      : null
  const inputTokens = usage && typeof usage.input_tokens === "number" ? usage.input_tokens : null
  const outputTokens = usage && typeof usage.output_tokens === "number" ? usage.output_tokens : null

  if (numTurns == null && costUsd == null && inputTokens == null) return null

  return (
    <div className="flex gap-2 mt-1 flex-wrap">
      {numTurns != null && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50">
          {numTurns} turn{numTurns === 1 ? "" : "s"}
        </span>
      )}
      {costUsd != null && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50">
          ${costUsd.toFixed(3)}
        </span>
      )}
      {inputTokens != null && outputTokens != null && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50">
          {inputTokens.toLocaleString()}&#8595; {outputTokens.toLocaleString()}&#8593;
        </span>
      )}
    </div>
  )
}

interface AutomationRunsViewProps {
  job: AutomationJob | null
}

export function AutomationRunsView({ job }: AutomationRunsViewProps) {
  const { data, isLoading, error } = useAutomationRunsQuery(job?.id ?? null)

  if (!job) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <History size={32} className="mx-auto mb-3 text-black/20 dark:text-white/20" />
          <p className="text-black/40 dark:text-white/40 text-sm">Select an automation to view run history</p>
        </div>
      </div>
    )
  }

  const runs = data?.runs ?? []

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 size={16} className="text-green-500" />
      case "failure":
        return <XCircle size={16} className="text-red-500" />
      case "running":
        return <RefreshCw size={16} className="text-blue-500 animate-spin" />
      case "pending":
        return <Clock size={16} className="text-yellow-500" />
      default:
        return <AlertCircle size={16} className="text-gray-400" />
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading run history..." />
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-red-500 text-sm">Failed to load run history</p>
        </div>
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <History size={32} className="mx-auto mb-3 text-black/20 dark:text-white/20" />
          <p className="text-black/50 dark:text-white/50">No runs yet</p>
          <p className="text-xs text-black/40 dark:text-white/40 mt-1">This automation hasn't been executed.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <h2 className="text-sm font-semibold text-black dark:text-white">Run History</h2>
        <p className="text-xs text-black/50 dark:text-white/50 mt-0.5">{job.name}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-2">
          {runs.map(run => (
            <div
              key={run.id}
              className={`p-2.5 rounded-lg border text-xs ${
                run.status === "failure"
                  ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"
                  : run.status === "success"
                    ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30"
                    : "bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/10"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">{getStatusIcon(run.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-medium text-black dark:text-white capitalize">{run.status}</span>
                    <span className="text-black/50 dark:text-white/50 whitespace-nowrap">
                      {formatTime(run.started_at)}
                    </span>
                  </div>

                  {run.duration_ms !== null && (
                    <p className="text-black/50 dark:text-white/50 mb-0.5">
                      Duration:{" "}
                      {run.duration_ms < 1000 ? `${run.duration_ms}ms` : `${(run.duration_ms / 1000).toFixed(1)}s`}
                    </p>
                  )}

                  {run.triggered_by && (
                    <p className="text-black/50 dark:text-white/50 mb-0.5">Triggered by: {run.triggered_by}</p>
                  )}

                  {typeof run.result?.summary === "string" && (
                    <p className="text-black/70 dark:text-white/70 mt-1 line-clamp-3">{run.result.summary}</p>
                  )}

                  <RunMetaBadges result={run.result} />

                  {run.error && (
                    <div className="mt-1.5 p-1.5 rounded bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30">
                      <p className="font-medium text-red-700 dark:text-red-400 mb-0.5">Error:</p>
                      <p className="text-red-600 dark:text-red-300 font-mono break-all whitespace-pre-wrap text-[10px]">
                        {run.error}
                      </p>
                    </div>
                  )}

                  {run.changes_made && run.changes_made.length > 0 && (
                    <div className="mt-1.5">
                      <p className="font-medium text-black/70 dark:text-white/70 mb-0.5">Changes made:</p>
                      <ul className="text-black/50 dark:text-white/50 list-disc list-inside text-[10px]">
                        {run.changes_made.map((change, i) => (
                          <li key={i}>{change}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
