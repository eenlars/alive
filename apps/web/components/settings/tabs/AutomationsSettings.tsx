"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Zap } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { AutomationListCard } from "@/components/automations/AutomationListCard"
import { AutomationRunsView } from "@/components/automations/AutomationRunsView"
import { type AutomationFormData, AutomationSidePanel } from "@/components/automations/AutomationSidePanel"
import { EmptyState } from "@/components/ui/EmptyState"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { trackAutomationCreated, trackAutomationDeleted, trackAutomationsViewed } from "@/lib/analytics/events"
import { isScheduleTrigger } from "@/lib/api/schemas"
import { type AutomationJob, useAutomationsQuery, useSitesQuery } from "@/lib/hooks/useSettingsQueries"
import { ApiError, queryKeys } from "@/lib/tanstack"
import { SettingsTabLayout } from "./SettingsTabLayout"

export function AutomationsSettings() {
  const queryClient = useQueryClient()
  const { data: automationsData, isLoading: automationsLoading, error: automationsError } = useAutomationsQuery()
  const { data: sitesData } = useSitesQuery()

  const automations = automationsData?.automations ?? []
  const sites = sitesData?.sites ?? []
  const loading = automationsLoading
  const error = automationsError?.message ?? null

  useEffect(() => {
    trackAutomationsViewed()
  }, [])

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
        throw new ApiError(data.error || "Failed to toggle agent", res.status)
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
  const saveMutation = useMutation<void, ApiError, { formData: AutomationFormData; editingJobId?: string }>({
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

      // Schedule fields only for schedule triggers — event triggers (email, webhook) have no schedule
      if (isScheduleTrigger(formData.trigger_type)) {
        if (formData.trigger_type === "cron") {
          body.cron_schedule = formData.cron_schedule
          body.cron_timezone = formData.cron_timezone
        } else if (formData.trigger_type === "one-time") {
          body.run_at = new Date(formData.run_at).toISOString()
        }
      }

      if (formData.action_type === "prompt") {
        body.action_prompt = formData.action_prompt
      } else if (formData.action_type === "sync") {
        body.action_source = formData.action_source
        body.action_target_page = formData.action_target_page
      }

      body.skills = formData.skills
      body.action_timeout_seconds = formData.action_timeout_seconds
      body.action_model = formData.action_model

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new ApiError(data.message || data.error || "Failed to save agent", res.status)
      }
    },
    onSuccess: (_data, variables) => {
      if (!variables.editingJobId) {
        trackAutomationCreated({ has_prompt: !!variables.formData.action_prompt })
      }
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
        throw new ApiError("Failed to delete agent", res.status)
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
    onSuccess: () => {
      trackAutomationDeleted()
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
    async (formData: AutomationFormData) => {
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
      <SettingsTabLayout title="Agents" description="Loading...">
        <LoadingSpinner message="Loading agents..." />
      </SettingsTabLayout>
    )
  }

  if (error) {
    return (
      <SettingsTabLayout title="Agents" description="Schedule recurring tasks">
        <EmptyState icon={Zap} message={error} />
      </SettingsTabLayout>
    )
  }

  if (automations.length === 0) {
    return (
      <SettingsTabLayout
        title="Agents"
        description="Schedule recurring tasks for your websites"
        action={{
          label: "Create Agent",
          icon: <Plus size={16} />,
          onClick: handleCreate,
        }}
      >
        <EmptyState
          icon={Zap}
          message="No agents yet. Agents let you schedule recurring tasks like syncing calendars or running AI prompts."
          action={{
            label: "Create Agent",
            onClick: handleCreate,
          }}
        />
      </SettingsTabLayout>
    )
  }

  return (
    <SettingsTabLayout
      title="Agents"
      description={`${activeCount} active agent${activeCount !== 1 ? "s" : ""} across your sites`}
      action={{
        label: "Add Agent",
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
            {/* Header with view toggle */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
              <h2 className="text-sm font-semibold text-black dark:text-white">
                {viewMode === "runs" ? "Run History" : editingJob.name}
              </h2>
              <div className="flex items-center gap-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("edit")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    viewMode === "edit"
                      ? "bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm"
                      : "text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("runs")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    viewMode === "runs"
                      ? "bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm"
                      : "text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
                  }`}
                >
                  Runs
                </button>
              </div>
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
              <p className="text-black/40 dark:text-white/40 text-sm">Select an agent to edit or view runs</p>
            </div>
          </div>
        )}
      </div>
    </SettingsTabLayout>
  )
}
