"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
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
  X,
  XCircle,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { EmptyState } from "@/components/ui/EmptyState"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { Modal } from "@/components/ui/Modal"
import {
  useAutomationsQuery,
  useAutomationRunsQuery,
  useSitesQuery,
  type AutomationJob,
  type Site,
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

type SkillItem = {
  id: string
  displayName: string
  description: string
}

const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "Amsterdam (CET)", value: "Europe/Amsterdam" },
  { label: "London (GMT)", value: "Europe/London" },
  { label: "New York (EST)", value: "America/New_York" },
  { label: "Los Angeles (PST)", value: "America/Los_Angeles" },
]

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

// =============================================================================
// SCHEDULE OPTIONS - Simple repeat dropdown
// =============================================================================

const REPEAT_OPTIONS = [
  { label: "No repeat", value: "once" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Custom", value: "custom" },
] as const

type RepeatValue = (typeof REPEAT_OPTIONS)[number]["value"]

// Convert repeat + time to cron
function repeatToCron(repeat: RepeatValue, hour: number, minute: number): string {
  switch (repeat) {
    case "daily":
      return `${minute} ${hour} * * *`
    case "weekly":
      return `${minute} ${hour} * * 1`
    case "monthly":
      return `${minute} ${hour} 1 * *`
    default:
      return `${minute} ${hour} * * *`
  }
}

// Parse cron to repeat type
function cronToRepeat(cron: string): RepeatValue {
  if (!cron) return "once"
  const parts = cron.split(" ")
  if (parts.length !== 5) return "custom"
  const [, , dom, , dow] = parts
  if (dom === "*" && dow === "*") return "daily"
  if (dom === "*" && dow !== "*") return "weekly"
  if (dom !== "*" && dow === "*") return "monthly"
  return "custom"
}

// =============================================================================
// SINGLE-PAGE FORM MODAL
// =============================================================================

function AutomationFormModal({
  isOpen,
  onClose,
  sites,
  editingJob,
  onSave,
  saving,
}: {
  isOpen: boolean
  onClose: () => void
  sites: Site[]
  editingJob: AutomationJob | null
  onSave: (data: FormData) => Promise<void>
  saving: boolean
}) {
  // Form fields
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [siteId, setSiteId] = useState("")
  const [siteSearch, setSiteSearch] = useState("")
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false)

  // Schedule
  const [repeat, setRepeat] = useState<RepeatValue>("once")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("09:00")
  const [customCron, setCustomCron] = useState("")

  // Advanced
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [timezone, setTimezone] = useState("Europe/Amsterdam")
  const [skills, setSkills] = useState<string[]>([])
  const [skillsDropdownOpen, setSkillsDropdownOpen] = useState(false)

  // Fetch skills
  const { data: skillsData } = useQuery<{ skills: SkillItem[] }>({
    queryKey: ["skills", "list"],
    queryFn: async () => {
      const res = await fetch("/api/skills/list")
      if (!res.ok) throw new Error("Failed to fetch skills")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
  const availableSkills = skillsData?.skills ?? []

  const filteredSites = sites.filter(s => s.hostname.toLowerCase().includes(siteSearch.toLowerCase()))

  // Initialize form
  useEffect(() => {
    if (isOpen) {
      if (editingJob) {
        setTitle(editingJob.name)
        setPrompt(editingJob.action_prompt || "")
        setSiteId(editingJob.site_id)
        const site = sites.find(s => s.id === editingJob.site_id)
        setSiteSearch(site?.hostname || "")
        setTimezone(editingJob.cron_timezone || "Europe/Amsterdam")
        setSkills(editingJob.skills ?? [])

        if (editingJob.trigger_type === "one-time" && editingJob.run_at) {
          setRepeat("once")
          const d = new Date(editingJob.run_at)
          setDate(d.toISOString().split("T")[0])
          setTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)
        } else if (editingJob.cron_schedule) {
          const r = cronToRepeat(editingJob.cron_schedule)
          setRepeat(r)
          if (r === "custom") {
            setCustomCron(editingJob.cron_schedule)
          } else {
            const parts = editingJob.cron_schedule.split(" ")
            if (parts.length === 5) {
              setTime(`${parts[1].padStart(2, "0")}:${parts[0].padStart(2, "0")}`)
            }
          }
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          setDate(tomorrow.toISOString().split("T")[0])
        }
      } else {
        setTitle("")
        setPrompt("")
        setSiteId("")
        setSiteSearch("")
        setRepeat("once")
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setDate(tomorrow.toISOString().split("T")[0])
        setTime("09:00")
        setCustomCron("")
        setTimezone("Europe/Amsterdam")
        setSkills([])
        setAdvancedOpen(false)
      }
      setSiteDropdownOpen(false)
      setSkillsDropdownOpen(false)
    }
  }, [isOpen, editingJob, sites])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const [hour, minute] = time.split(":").map(Number)
    const isOneTime = repeat === "once"
    const cronSchedule = repeat === "custom" ? customCron : repeatToCron(repeat, hour, minute)

    const formData: FormData = {
      site_id: siteId,
      name: title,
      description: "",
      trigger_type: isOneTime ? "one-time" : "cron",
      cron_schedule: isOneTime ? "" : cronSchedule,
      cron_timezone: timezone,
      run_at: isOneTime ? new Date(`${date}T${time}`).toISOString() : "",
      action_type: "prompt",
      action_prompt: prompt,
      action_source: "",
      action_target_page: "",
      skills,
      is_active: true,
    }

    await onSave(formData)
  }

  const isValid = title.trim() && prompt.trim() && siteId && (repeat !== "custom" || customCron.trim())
  const isEditing = !!editingJob

  const advancedSummary = [
    skills.length > 0 ? `${skills.length} skill${skills.length > 1 ? "s" : ""}` : null,
    timezone !== "Europe/Amsterdam" ? timezone.split("/")[1] : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit scheduled task" : "Add scheduled task"} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="px-6 pb-5 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="task-title" className="text-[13px] font-medium text-black dark:text-white">
              Title
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Summary of AI news"
              autoComplete="off"
              className="w-full h-9 px-4 rounded-xl text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"
            />
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <label htmlFor="task-prompt" className="text-[13px] font-medium text-black dark:text-white">
              Prompt
            </label>
            <textarea
              id="task-prompt"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Search for yesterday's most impactful AI news and send me a brief summary."
              className="w-full h-[120px] px-4 py-3 rounded-xl text-sm leading-relaxed bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"
              maxLength={5000}
            />
          </div>

          {/* Website */}
          <div className="space-y-1.5">
            <label htmlFor="task-site" className="text-[13px] font-medium text-black dark:text-white">
              Website
            </label>
            <div className="relative">
              <input
                id="task-site"
                type="text"
                value={siteSearch}
                onChange={e => {
                  setSiteSearch(e.target.value)
                  setSiteDropdownOpen(true)
                  if (!e.target.value) setSiteId("")
                }}
                onFocus={() => setSiteDropdownOpen(true)}
                onBlur={() => setTimeout(() => setSiteDropdownOpen(false), 150)}
                placeholder="Select website..."
                autoComplete="off"
                className="w-full h-9 px-4 rounded-xl text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"
              />
              {siteDropdownOpen && filteredSites.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1.5 max-h-48 overflow-auto rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.08] dark:border-white/[0.08] shadow-xl ring-1 ring-black/[0.04] dark:ring-white/[0.04] animate-in fade-in slide-in-from-bottom-2 duration-150">
                  {filteredSites.slice(0, 8).map(site => (
                    <button
                      key={site.id}
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault()
                        setSiteId(site.id)
                        setSiteSearch(site.hostname)
                        setSiteDropdownOpen(false)
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-black/[0.07] dark:active:bg-white/[0.09] transition-colors ${
                        siteId === site.id ? "bg-black/[0.04] dark:bg-white/[0.06]" : ""
                      }`}
                    >
                      {site.hostname}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Schedule - inline row */}
          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-medium text-black dark:text-white">Schedule</legend>
            <div className="grid grid-cols-3 gap-2">
              {/* Repeat dropdown */}
              <select
                value={repeat}
                onChange={e => setRepeat(e.target.value as RepeatValue)}
                className="h-9 px-4 rounded-xl text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer transition-all appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                }}
              >
                {REPEAT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Date */}
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="h-9 px-4 rounded-xl text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer transition-all"
              />

              {/* Time */}
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="h-9 px-4 rounded-xl text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer transition-all"
              />
            </div>
          </fieldset>

          {/* Custom cron (only when custom selected) */}
          {repeat === "custom" && (
            <div className="space-y-1.5">
              <label htmlFor="task-cron" className="text-[13px] font-medium text-black dark:text-white">
                Cron expression
              </label>
              <input
                id="task-cron"
                type="text"
                value={customCron}
                onChange={e => setCustomCron(e.target.value)}
                placeholder="0 9 * * 1-5"
                className="w-full h-9 px-4 rounded-xl text-sm font-mono bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"
              />
              <p className="text-[11px] text-black/40 dark:text-white/40">
                minute hour day month weekday (e.g., "0 9 * * 1-5" = weekdays at 9am)
              </p>
            </div>
          )}

          {/* Advanced settings - collapsible */}
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-sm font-medium text-black dark:text-white">Advanced settings</span>
              <div className="flex items-center gap-2">
                {advancedSummary && <span className="text-sm text-black/40 dark:text-white/40">{advancedSummary}</span>}
                <svg
                  className={`w-4 h-4 text-black/40 dark:text-white/40 transition-transform duration-150 ${advancedOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {advancedOpen && (
              <div className="px-4 pb-4 pt-3 border-t border-black/[0.06] dark:border-white/[0.06] space-y-4">
                {/* Timezone */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-black dark:text-white">Timezone</p>
                    <p className="text-[11px] text-black/40 dark:text-white/40">When should the task run?</p>
                  </div>
                  <select
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className="h-9 px-3 rounded-xl text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none cursor-pointer"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Skills */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-black dark:text-white">Skills</p>
                    <p className="text-[11px] text-black/40 dark:text-white/40">Add specialized capabilities</p>
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setSkillsDropdownOpen(!skillsDropdownOpen)}
                      className="h-9 px-3 rounded-xl text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white flex items-center gap-2 hover:bg-black/[0.07] dark:hover:bg-white/[0.09] transition-colors"
                    >
                      {skills.length > 0 ? `${skills.length} selected` : "Add skills"}
                      <Plus size={14} className="text-black/40 dark:text-white/40" />
                    </button>

                    {skillsDropdownOpen && availableSkills.length > 0 && (
                      <div className="absolute z-20 top-full right-0 mt-1.5 w-64 max-h-48 overflow-auto rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.08] dark:border-white/[0.08] shadow-xl ring-1 ring-black/[0.04] dark:ring-white/[0.04] animate-in fade-in slide-in-from-bottom-2 duration-150">
                        {availableSkills.map(skill => {
                          const isSelected = skills.includes(skill.id)
                          return (
                            <button
                              key={skill.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSkills(skills.filter(s => s !== skill.id))
                                } else {
                                  setSkills([...skills, skill.id])
                                }
                              }}
                              className="w-full px-3 py-2.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2 rounded-xl transition-colors"
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? "bg-black dark:bg-white border-black dark:border-white"
                                    : "border-black/20 dark:border-white/20"
                                }`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-3 h-3 text-white dark:text-black"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={3}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </div>
                              <span className="text-sm text-black dark:text-white truncate">{skill.displayName}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected skills chips */}
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map(skillId => {
                      const skill = availableSkills.find(s => s.id === skillId)
                      return (
                        <span
                          key={skillId}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-black/70 dark:text-white/70 transition-colors"
                        >
                          {skill?.displayName || skillId}
                          <button
                            type="button"
                            onClick={() => setSkills(skills.filter(s => s !== skillId))}
                            className="hover:text-black dark:hover:text-white transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center justify-end gap-2 border-t border-black/[0.04] dark:border-white/[0.04]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl text-sm font-medium text-black/70 dark:text-white/70 border border-black/[0.08] dark:border-white/[0.08] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !isValid}
            className="h-9 px-4 rounded-xl text-sm font-medium bg-black dark:bg-white text-white dark:text-black hover:brightness-[0.85] active:brightness-75 disabled:opacity-30 disabled:hover:brightness-100 transition-all"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
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
      <div className="space-y-4">{renderContent()}</div>

      <AutomationFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingJob(null)
        }}
        sites={sites}
        editingJob={editingJob}
        onSave={handleSave}
        saving={saveMutation.isPending}
      />

      <RunHistoryModal isOpen={!!historyJob} onClose={() => setHistoryJob(null)} job={historyJob} />
    </SettingsTabLayout>
  )
}
