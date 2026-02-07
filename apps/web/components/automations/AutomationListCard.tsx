"use client"

import { Calendar, Clock, Globe, History, Zap } from "lucide-react"
import type { AutomationJob } from "@/lib/hooks/useSettingsQueries"

function formatSchedule(job: AutomationJob): string {
  if (job.trigger_type === "one-time") {
    return "One-time"
  }
  if (job.trigger_type === "webhook") {
    return "Webhook trigger"
  }
  if (job.cron_schedule) {
    const parts = job.cron_schedule.split(" ")
    if (parts.length === 5) {
      const [min, hour, day, month, weekday] = parts
      if (min === "0" && hour !== "*" && day === "*" && month === "*" && weekday === "*") {
        return `Daily at ${hour}:00`
      }
      if (min === "0" && hour !== "*" && weekday !== "*" && day === "*") {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        return `${days[parseInt(weekday, 10)] || "Weekly"} at ${hour}:00`
      }
    }
    return job.cron_schedule
  }
  return "Unknown"
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null

  const styles: Record<string, string> = {
    success: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    failure: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
    running: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  }

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[status] || styles.pending}`}>{status}</span>
  )
}

interface AutomationListCardProps {
  job: AutomationJob
  onEdit: (job: AutomationJob) => void
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onViewRuns: (job: AutomationJob) => void
  isSelected: boolean
  onSelect: () => void
}

export function AutomationListCard({
  job,
  onEdit,
  onToggle,
  onDelete,
  onViewRuns,
  isSelected,
  onSelect,
}: AutomationListCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? "bg-black/[0.04] dark:bg-white/[0.08] border-black/15 dark:border-white/15"
          : job.is_active
            ? "bg-white dark:bg-white/[0.03] border-black/8 dark:border-white/8 hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
            : "bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5 opacity-60 hover:opacity-70"
      }`}
    >
      {/* Title + Action type */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-black dark:text-white truncate text-xs">{job.name}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {job.is_active ? (
            <Zap size={12} className="text-amber-600 dark:text-amber-400" />
          ) : (
            <Zap size={12} className="text-black/30 dark:text-white/30" />
          )}
        </div>
      </div>

      {/* Website */}
      {job.hostname && (
        <p className="text-[11px] text-black/50 dark:text-white/50 mb-1 truncate flex items-center gap-1">
          <Globe size={10} />
          {job.hostname}
        </p>
      )}

      {/* Schedule info */}
      <p className="text-[11px] text-black/60 dark:text-white/60 mb-1.5 flex items-center gap-1">
        <Calendar size={10} />
        {formatSchedule(job)}
      </p>

      {/* Last run status */}
      {job.last_run_at && (
        <div className="flex items-center gap-1.5 mb-2">
          <Clock size={10} className="text-black/40 dark:text-white/40" />
          <span className="text-[11px] text-black/50 dark:text-white/50">{formatRelativeTime(job.last_run_at)}</span>
          {job.last_run_status && <StatusBadge status={job.last_run_status} />}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 pt-1.5 border-t border-black/5 dark:border-white/5">
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onEdit(job)
          }}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-black/5 dark:bg-white/10 text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
        >
          Edit
        </button>

        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onViewRuns(job)
          }}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-black/5 dark:bg-white/10 text-black/70 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/15 transition-colors inline-flex items-center gap-1"
        >
          <History size={10} />
          Runs
        </button>

        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onToggle(job.id, !job.is_active)
          }}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            job.is_active
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/40"
              : "bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/15"
          }`}
        >
          {job.is_active ? "Pause" : "Resume"}
        </button>

        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onDelete(job.id)
          }}
          className="ml-auto px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-100/50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        >
          Delete
        </button>
      </div>
    </button>
  )
}
