"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Zap } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { EmptyState } from "@/components/ui/EmptyState"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { AutomationSidePanel } from "@/components/automations/AutomationSidePanel"
import { AutomationListCard } from "@/components/automations/AutomationListCard"
import { AutomationRunsView } from "@/components/automations/AutomationRunsView"
import { useAutomationsQuery, useSitesQuery, type AutomationJob } from "@/lib/hooks/useSettingsQueries"
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
  const [viewMode, setViewMode] = useState<"edit" | "runs">("edit")

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
      <SettingsTabLayout
        title="Automations"
        description="Let the AI run tasks on a schedule -- like updating content, syncing data, or checking your site automatically."
      >
        <EmptyState icon={Zap} message={error} />
      </SettingsTabLayout>
    )
  }

  if (automations.length === 0) {
    return (
      <SettingsTabLayout
        title="Automations"
        description="Let the AI run tasks on a schedule -- like updating content, syncing data, or checking your site automatically."
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
      className="h-full min-h-0 flex flex-col"
      contentClassName="flex-1 min-h-0"
    >
      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 h-full min-h-0">
        {/* Left: List of automations */}
        <div className="overflow-y-auto pr-2">
          <div className="space-y-2">
            {automations.map(job => (
              <AutomationListCard
                key={job.id}
                job={job}
                isSelected={editingJob?.id === job.id}
                onSelect={() => {
                  handleEdit(job)
                  setViewMode("edit")
                }}
                onEdit={() => {
                  handleEdit(job)
                  setViewMode("edit")
                }}
                onViewRuns={() => {
                  handleEdit(job)
                  setViewMode("runs")
                }}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>

        {/* Right: Edit/Runs panel */}
        {editingJob ? (
          <div className="overflow-hidden flex flex-col border-l border-black/10 dark:border-white/10 pl-6">
            {/* View mode tabs */}
            <div className="flex items-center gap-1 px-6 py-4 border-b border-black/10 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("edit")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === "edit"
                    ? "bg-black/10 dark:bg-white/10 text-black dark:text-white"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                }`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setViewMode("runs")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === "runs"
                    ? "bg-black/10 dark:bg-white/10 text-black dark:text-white"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                }`}
              >
                Run History
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {viewMode === "edit" ? (
                <AutomationSidePanel
                  isOpen={true}
                  onClose={() => setEditingJob(null)}
                  sites={sites}
                  editingJob={editingJob}
                  onSave={handleSave}
                  saving={saveMutation.isPending}
                />
              ) : (
                <AutomationRunsView job={editingJob} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center border-l border-black/10 dark:border-white/10 pl-6">
            <div className="text-center">
              <p className="text-black/40 dark:text-white/40 text-sm">Select an automation to edit or view runs</p>
            </div>
          </div>
        )}
      </div>
    </SettingsTabLayout>
  )
}
