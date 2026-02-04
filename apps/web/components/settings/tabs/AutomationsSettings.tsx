"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, CheckCircle2, Clock, History, Plus, RefreshCw, XCircle, Zap } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { EmptyState } from "@/components/ui/EmptyState"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { Modal } from "@/components/ui/Modal"
import { AutomationSidePanel } from "@/components/automations/AutomationSidePanel"
import { AutomationListCard } from "@/components/automations/AutomationListCard"
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

export function AutomationsSettings() {
  const queryClient = useQueryClient()
  const { data: automationsData, isLoading: automationsLoading, error: automationsError } = useAutomationsQuery()
  const { data: sitesData } = useSitesQuery()

  const automations = automationsData?.automations ?? []
  const sites = sitesData?.sites ?? []
  const loading = automationsLoading
  const error = automationsError?.message ?? null

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
      await queryClient.cancelQueries({ queryKey: queryKeys.automations.list() })
      const previous = queryClient.getQueryData(queryKeys.automations.list())
      queryClient.setQueryData(queryKeys.automations.list(), (old: { automations: AutomationJob[] } | undefined) => ({
        automations: old?.automations.map(a => (a.id === id ? { ...a, is_active: active } : a)) ?? [],
      }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
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
      } else if (formData.action_type === "sync") {
        body.action_source = formData.action_source
        body.action_target_page = formData.action_target_page
      }

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
  }, [])

  const handleCreate = useCallback(() => {
    setEditingJob(null)
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

  useEffect(() => {
    if (deleteConfirm) {
      const timeout = setTimeout(() => setDeleteConfirm(null), 3000)
      return () => clearTimeout(timeout)
    }
  }, [deleteConfirm])

  const activeCount = automations.filter(a => a.is_active).length

  if (loading) {
    return (
      <SettingsTabLayout title="Automations" description="Loading...">
        <LoadingSpinner message="Loading automations..." />
      </SettingsTabLayout>
    )
  }

  if (error) {
    return (
      <SettingsTabLayout title="Automations" description="Schedule recurring tasks">
        <EmptyState icon={Zap} message={error} />
      </SettingsTabLayout>
    )
  }

  if (automations.length === 0) {
    return (
      <SettingsTabLayout
        title="Automations"
        description="Schedule recurring tasks for your websites"
        action={{
          label: "Create Automation",
          icon: <Plus size={16} />,
          onClick: handleCreate,
        }}
      >
        <EmptyState
          icon={Zap}
          message="No automations yet. Automations let you schedule recurring tasks like syncing calendars or running AI prompts."
          action={{
            label: "Create Automation",
            onClick: handleCreate,
          }}
        />
      </SettingsTabLayout>
    )
  }

  return (
    <SettingsTabLayout
      title="Automations"
      description={`${activeCount} active automation${activeCount !== 1 ? "s" : ""} across your sites`}
      action={{
        label: "Add Automation",
        icon: <Plus size={16} />,
        onClick: handleCreate,
      }}
    >
      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 h-[calc(100vh-300px)]">
        {/* Left: List of automations */}
        <div className="overflow-y-auto pr-2">
          <div className="space-y-2">
            {automations.map(job => (
              <AutomationListCard
                key={job.id}
                job={job}
                isSelected={editingJob?.id === job.id}
                onSelect={() => handleEdit(job)}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>

        {/* Right: Edit panel */}
        {editingJob ? (
          <div className="overflow-hidden flex flex-col border-l border-black/10 dark:border-white/10 pl-6">
            <AutomationSidePanel
              isOpen={true}
              onClose={() => setEditingJob(null)}
              sites={sites}
              editingJob={editingJob}
              onSave={handleSave}
              saving={saveMutation.isPending}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center border-l border-black/10 dark:border-white/10 pl-6">
            <div className="text-center">
              <p className="text-black/40 dark:text-white/40 text-sm">Select an automation to edit</p>
            </div>
          </div>
        )}
      </div>

      <RunHistoryModal isOpen={!!historyJob} onClose={() => setHistoryJob(null)} job={historyJob} />
    </SettingsTabLayout>
  )
}
