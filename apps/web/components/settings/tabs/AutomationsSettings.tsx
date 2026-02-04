"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
  History,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { EmptyState } from "@/components/ui/EmptyState"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { Modal } from "@/components/ui/Modal"
import { AutomationSidePanel } from "@/components/automations/AutomationSidePanel"
import {
  useAutomationsQuery,
  useAutomationRunsQuery,
  useSitesQuery,
  type AutomationJob,
} from "@/lib/hooks/useSettingsQueries"
import { queryKeys, ApiError } from "@/lib/tanstack"
import { SettingsTabLayout } from "./SettingsTabLayout"

type FormData = {
  site_id: string
  name: string
  description: string
  trigger_type: "cron" | "webhook" | "one-time"
  cron_schedule: string
  cron_timezone: string
  run_at: string
  action_type: "prompt" | "sync" | "publish"
  action_prompt: string
  action_source: string
  action_target_page: string
  skills: string[]
  is_active: boolean
}

export type SkillItem = {
  id: string
  displayName: string
  description: string
}

export const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "Amsterdam (CET)", value: "Europe/Amsterdam" },
  { label: "London (GMT)", value: "Europe/London" },
  { label: "Paris (CET)", value: "Europe/Paris" },
  { label: "Berlin (CET)", value: "Europe/Berlin" },
  { label: "New York (EST)", value: "America/New_York" },
  { label: "Chicago (CST)", value: "America/Chicago" },
  { label: "Denver (MST)", value: "America/Denver" },
  { label: "Los Angeles (PST)", value: "America/Los_Angeles" },
  { label: "Tokyo (JST)", value: "Asia/Tokyo" },
  { label: "Sydney (AEST)", value: "Australia/Sydney" },
  { label: "Singapore (SGT)", value: "Asia/Singapore" },
] as const

function formatSchedule(job: AutomationJob): string {
  if (job.trigger_type === "one-time") {
    return "One-time"
  }
  if (job.trigger_type === "webhook") {
    return "Webhook trigger"
  }
  if (job.cron_schedule) {
    // Simple cron descriptions
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

function formatNextRun(dateStr: string | null): string {
  if (!dateStr) return "Not scheduled"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMs < 0) return "Overdue"
  if (diffMins < 60) return `in ${diffMins}m`
  if (diffHours < 24) return `in ${diffHours}h`
  if (diffDays < 7) return `in ${diffDays}d`
  return date.toLocaleDateString()
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null

  const styles: Record<string, string> = {
    success: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    failure: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
    running: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
    skipped: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  }

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[status] || styles.pending}`}>{status}</span>
  )
}

function ActionTypeBadge({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    prompt: <Zap size={12} />,
    sync: <RefreshCw size={12} />,
    publish: <Globe size={12} />,
  }

  const labels: Record<string, string> = {
    prompt: "AI Prompt",
    sync: "Data Sync",
    publish: "Publish",
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60">
      {icons[type]}
      {labels[type] || type}
    </span>
  )
}

function RunHistoryModal({
  isOpen,
  onClose,
  job,
}: {
  isOpen: boolean
  onClose: () => void
  job: AutomationJob | null
}) {
  const { data, isLoading, error } = useAutomationRunsQuery(job?.id ?? null)

  if (!job) return null

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Run History: ${job.name}`} size="md">
      <div className="p-4">
        {isLoading && <LoadingSpinner message="Loading run history..." />}

        {error && (
          <div className="text-center py-8 text-red-500">
            <AlertCircle size={24} className="mx-auto mb-2" />
            <p>Failed to load run history</p>
          </div>
        )}

        {!isLoading && !error && runs.length === 0 && (
          <div className="text-center py-8 text-black/50 dark:text-white/50">
            <History size={32} className="mx-auto mb-2 opacity-50" />
            <p>No runs yet</p>
            <p className="text-sm mt-1">This automation hasn't been executed.</p>
          </div>
        )}

        {!isLoading && !error && runs.length > 0 && (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {runs.map(run => (
              <div
                key={run.id}
                className={`p-3 rounded-lg border ${
                  run.status === "failure"
                    ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"
                    : run.status === "success"
                      ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30"
                      : "bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getStatusIcon(run.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-black dark:text-white capitalize">{run.status}</span>
                      <span className="text-xs text-black/50 dark:text-white/50">{formatTime(run.started_at)}</span>
                    </div>

                    {run.duration_ms !== null && (
                      <p className="text-xs text-black/50 dark:text-white/50 mb-1">
                        Duration:{" "}
                        {run.duration_ms < 1000 ? `${run.duration_ms}ms` : `${(run.duration_ms / 1000).toFixed(1)}s`}
                      </p>
                    )}

                    {run.triggered_by && (
                      <p className="text-xs text-black/50 dark:text-white/50 mb-1">Triggered by: {run.triggered_by}</p>
                    )}

                    {run.error && (
                      <div className="mt-2 p-2 rounded bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30">
                        <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Error:</p>
                        <p className="text-xs text-red-600 dark:text-red-300 font-mono break-all whitespace-pre-wrap">
                          {run.error}
                        </p>
                      </div>
                    )}

                    {run.changes_made && run.changes_made.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-black/70 dark:text-white/70 mb-1">Changes made:</p>
                        <ul className="text-xs text-black/50 dark:text-white/50 list-disc list-inside">
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
        )}
      </div>
    </Modal>
  )
}

function AutomationCard({
  job,
  onToggle,
  onEdit,
  onDelete,
  onViewHistory,
}: {
  job: AutomationJob
  onToggle: (id: string, active: boolean) => void
  onEdit: (job: AutomationJob) => void
  onDelete: (id: string) => void
  onViewHistory: (job: AutomationJob) => void
}) {
  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        job.is_active
          ? "bg-white dark:bg-white/5 border-black/10 dark:border-white/10"
          : "bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onViewHistory(job)}
          className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-black dark:text-white truncate">{job.name}</h4>
            <ActionTypeBadge type={job.action_type} />
          </div>

          {job.hostname && (
            <p className="text-xs text-black/50 dark:text-white/50 mb-2 truncate">
              <Globe size={11} className="inline mr-1" />
              {job.hostname}
            </p>
          )}

          {job.description && (
            <p className="text-sm text-black/60 dark:text-white/60 mb-3 line-clamp-2">{job.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-black/50 dark:text-white/50">
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} />
              {formatSchedule(job)}
            </span>

            {job.last_run_at && (
              <span className="inline-flex items-center gap-1">
                <Clock size={12} />
                Last: {formatRelativeTime(job.last_run_at)}
                {job.last_run_status && <StatusBadge status={job.last_run_status} />}
              </span>
            )}

            {job.is_active && job.next_run_at && (
              <span className="inline-flex items-center gap-1">Next: {formatNextRun(job.next_run_at)}</span>
            )}
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onViewHistory(job)}
            className="p-2 rounded-lg transition-all bg-black/5 dark:bg-white/10 text-black/40 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/20"
            title="View run history"
          >
            <History size={16} />
          </button>

          <button
            type="button"
            onClick={() => onEdit(job)}
            className="p-2 rounded-lg transition-all bg-black/5 dark:bg-white/10 text-black/40 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/20"
            title="Edit automation"
          >
            <Pencil size={16} />
          </button>

          <button
            type="button"
            onClick={() => onToggle(job.id, !job.is_active)}
            className={`p-2 rounded-lg transition-all ${
              job.is_active
                ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                : "bg-black/5 dark:bg-white/10 text-black/40 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/20"
            }`}
            title={job.is_active ? "Pause automation" : "Resume automation"}
          >
            {job.is_active ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button
            type="button"
            onClick={() => onDelete(job.id)}
            className="p-2 rounded-lg transition-all bg-black/5 dark:bg-white/10 text-black/40 dark:text-white/40 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
            title="Delete automation"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function AutomationsSettings() {
  const queryClient = useQueryClient()
  const { data: automationsData, isLoading: automationsLoading, error: automationsError } = useAutomationsQuery()
  const { data: sitesData } = useSitesQuery()

  const automations = automationsData?.automations ?? []
  const sites = sitesData?.sites ?? []
  const loading = automationsLoading
  const error = automationsError?.message ?? null

  const [modalOpen, setModalOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<AutomationJob | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [historyJob, setHistoryJob] = useState<AutomationJob | null>(null)

  // Toggle mutation with optimistic update
  const toggleMutation = useMutation<void, ApiError, { id: string; active: boolean }, { previous: unknown }>({
    mutationFn: async ({ id, active }) => {
      const res = await fetch(`/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: active }),
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new ApiError(data.error || "Failed to toggle automation", res.status)
      }
    },
    onMutate: async ({ id, active }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.automations.list() })
      // Snapshot previous value
      const previous = queryClient.getQueryData(queryKeys.automations.list())
      // Optimistic update
      queryClient.setQueryData(queryKeys.automations.list(), (old: { automations: AutomationJob[] } | undefined) => ({
        automations: old?.automations.map(a => (a.id === id ? { ...a, is_active: active } : a)) ?? [],
      }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      // Revert on error
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.automations.list(), context.previous)
      }
    },
  })

  // Save mutation (create/update)
  const saveMutation = useMutation<void, ApiError, { formData: FormData; editingJobId?: string }>({
    mutationFn: async ({ formData, editingJobId }) => {
      const url = editingJobId ? `/api/automations/${editingJobId}` : "/api/automations"
      const method = editingJobId ? "PATCH" : "POST"

      const body: Record<string, unknown> = {
        name: formData.name,
        description: formData.description || null,
        is_active: formData.is_active,
      }

      if (!editingJobId) {
        body.site_id = formData.site_id
        body.trigger_type = formData.trigger_type
        body.action_type = formData.action_type
      }

      if (formData.trigger_type === "cron") {
        body.cron_schedule = formData.cron_schedule
        body.cron_timezone = formData.cron_timezone
      } else if (formData.trigger_type === "one-time") {
        body.run_at = new Date(formData.run_at).toISOString()
      }

      if (formData.action_type === "prompt") {
        body.action_prompt = formData.action_prompt
      }

      // Always include skills
      body.skills = formData.skills

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new ApiError(data.error || "Failed to save automation", res.status)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.all })
      setModalOpen(false)
      setEditingJob(null)
    },
    onError: err => {
      alert(err.message || "Failed to save")
    },
  })

  // Delete mutation with optimistic update
  const deleteMutation = useMutation<void, ApiError, string, { previous: unknown }>({
    mutationFn: async id => {
      const res = await fetch(`/api/automations/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        throw new ApiError("Failed to delete automation", res.status)
      }
    },
    onMutate: async id => {
      await queryClient.cancelQueries({ queryKey: queryKeys.automations.list() })
      const previous = queryClient.getQueryData(queryKeys.automations.list())
      queryClient.setQueryData(queryKeys.automations.list(), (old: { automations: AutomationJob[] } | undefined) => ({
        automations: old?.automations.filter(a => a.id !== id) ?? [],
      }))
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.automations.list(), context.previous)
      }
    },
    onSettled: () => {
      setDeleteConfirm(null)
    },
  })

  const handleToggle = useCallback(
    (id: string, active: boolean) => {
      toggleMutation.mutate({ id, active })
    },
    [toggleMutation],
  )

  const handleEdit = useCallback((job: AutomationJob) => {
    setEditingJob(job)
    setModalOpen(true)
  }, [])

  const handleCreate = useCallback(() => {
    setEditingJob(null)
    setModalOpen(true)
  }, [])

  const handleSave = useCallback(
    async (formData: FormData) => {
      saveMutation.mutate({ formData, editingJobId: editingJob?.id })
    },
    [editingJob, saveMutation],
  )

  const handleDelete = useCallback(
    (id: string) => {
      if (deleteConfirm !== id) {
        setDeleteConfirm(id)
        return
      }
      deleteMutation.mutate(id)
    },
    [deleteConfirm, deleteMutation],
  )

  const handleViewHistory = useCallback((job: AutomationJob) => {
    setHistoryJob(job)
  }, [])

  // Reset delete confirmation when clicking elsewhere
  useEffect(() => {
    if (deleteConfirm) {
      const timeout = setTimeout(() => setDeleteConfirm(null), 3000)
      return () => clearTimeout(timeout)
    }
  }, [deleteConfirm])

  const activeCount = automations.filter(a => a.is_active).length

  const renderContent = () => {
    if (loading) return <LoadingSpinner message="Loading automations..." />
    if (error) return <EmptyState icon={Zap} message={error} />
    if (automations.length === 0) {
      return (
        <EmptyState
          icon={Zap}
          message="No automations yet. Automations let you schedule recurring tasks like syncing calendars or running AI prompts."
          action={{
            label: "Create Automation",
            onClick: handleCreate,
          }}
        />
      )
    }

    return (
      <div className="space-y-3">
        {automations.map(job => (
          <AutomationCard
            key={job.id}
            job={job}
            onToggle={handleToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onViewHistory={handleViewHistory}
          />
        ))}
      </div>
    )
  }

  return (
    <SettingsTabLayout
      title="Automations"
      description={
        automations.length > 0
          ? `${activeCount} active automation${activeCount !== 1 ? "s" : ""} across your sites`
          : "Schedule recurring tasks for your websites"
      }
      action={
        automations.length > 0
          ? {
              label: "Add Automation",
              icon: <Plus size={16} />,
              onClick: handleCreate,
            }
          : undefined
      }
    >
      {/* 2-column layout: list on left, editor panel on right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_40rem] gap-0 h-[calc(100vh-280px)]">
        {/* Left column: List of automations */}
        <div className="overflow-y-auto pr-4">
          <div className="space-y-3">{renderContent()}</div>
        </div>

        {/* Divider */}
        {modalOpen && <div className="bg-black/10 dark:bg-white/10" />}

        {/* Right column: Edit panel */}
        {modalOpen && (
          <div className="overflow-y-auto pl-4 flex flex-col">
            <AutomationSidePanel
              isOpen={true}
              onClose={() => {
                setModalOpen(false)
                setEditingJob(null)
              }}
              sites={sites}
              editingJob={editingJob}
              onSave={handleSave}
              saving={saveMutation.isPending}
            />
          </div>
        )}
      </div>

      <RunHistoryModal isOpen={!!historyJob} onClose={() => setHistoryJob(null)} job={historyJob} />
    </SettingsTabLayout>
  )
}
