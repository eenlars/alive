"use client"

import type { ClaudeModel } from "@webalive/shared"
import { useEffect, useState } from "react"
import { isScheduleTrigger, type TriggerType } from "@/lib/api/schemas"
import type { AutomationJob, Site } from "@/lib/hooks/useSettingsQueries"
import { GeneralTab } from "./tabs/GeneralTab"
import { PromptTab } from "./tabs/PromptTab"
import { ToolsTab } from "./tabs/ToolsTab"
import { TriggerTab } from "./tabs/TriggerTab"
import { type AutomationFormData, EDIT_TABS, type EditTab } from "./types"

export type { AutomationFormData } from "./types"

interface AutomationSidePanelProps {
  isOpen: boolean
  onClose: () => void
  sites: Site[]
  editingJob: AutomationJob | null
  onSave: (data: AutomationFormData) => Promise<void>
  saving: boolean
}

export function AutomationSidePanel({ isOpen, onClose, sites, editingJob, onSave, saving }: AutomationSidePanelProps) {
  const isEditing = !!editingJob
  const triggerType: TriggerType = editingJob?.trigger_type ?? "cron"
  const hasSchedule = isScheduleTrigger(triggerType)

  // Tab
  const [activeTab, setActiveTab] = useState<EditTab>("general")

  // General
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [siteId, setSiteId] = useState("")
  const [siteSearch, setSiteSearch] = useState("")
  const [model, setModel] = useState("")
  const [timeoutSeconds, setTimeoutSeconds] = useState("")

  // Trigger
  const [isOneTime, setIsOneTime] = useState(false)
  const [cronSchedule, setCronSchedule] = useState("0 9 * * 1-5")
  const [oneTimeDate, setOneTimeDate] = useState("")
  const [oneTimeTime, setOneTimeTime] = useState("09:00")
  const [timezone, setTimezone] = useState("Europe/Amsterdam")

  // Tools
  const [skills, setSkills] = useState<string[]>([])

  // ── Init form when panel opens ──
  useEffect(() => {
    if (!isOpen) return
    setActiveTab("general")

    if (editingJob) {
      setTitle(editingJob.name)
      setPrompt(editingJob.action_prompt || "")
      setSiteId(editingJob.site_id)
      setSiteSearch(sites.find(s => s.id === editingJob.site_id)?.hostname || "")
      setTimezone(editingJob.cron_timezone || "Europe/Amsterdam")
      setTimeoutSeconds(editingJob.action_timeout_seconds ? String(editingJob.action_timeout_seconds) : "")
      setModel(editingJob.action_model || "")
      setSkills(editingJob.skills ?? [])

      if (editingJob.trigger_type === "one-time" && editingJob.run_at) {
        setIsOneTime(true)
        const d = new Date(editingJob.run_at)
        setOneTimeDate(d.toISOString().split("T")[0])
        setOneTimeTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)
        setCronSchedule("")
      } else {
        setIsOneTime(false)
        setCronSchedule(editingJob.cron_schedule || "0 9 * * 1-5")
        setOneTimeDate("")
        setOneTimeTime("09:00")
      }
    } else {
      setTitle("")
      setPrompt("")
      setSiteId("")
      setSiteSearch("")
      setIsOneTime(false)
      setCronSchedule("0 9 * * 1-5")
      setOneTimeDate("")
      setOneTimeTime("09:00")
      setTimezone("Europe/Amsterdam")
      setTimeoutSeconds("")
      setModel("")
      setSkills([])
    }
  }, [isOpen, editingJob, sites])

  // ── Validation ──
  const effectiveIsOneTime = isEditing ? triggerType === "one-time" : isOneTime
  const scheduleValid = hasSchedule ? (effectiveIsOneTime ? oneTimeDate && oneTimeTime : cronSchedule.trim()) : true
  const isValid = title.trim() && prompt.trim() && siteId && scheduleValid

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const effectiveTrigger: TriggerType = editingJob ? triggerType : isOneTime ? "one-time" : "cron"
    const isOneTimeSubmit = editingJob ? triggerType === "one-time" : isOneTime

    await onSave({
      site_id: siteId,
      name: title,
      description: "",
      trigger_type: effectiveTrigger,
      cron_schedule: hasSchedule && !isOneTimeSubmit ? cronSchedule : "",
      cron_timezone: hasSchedule ? timezone : "",
      run_at: hasSchedule && isOneTimeSubmit ? new Date(`${oneTimeDate}T${oneTimeTime}`).toISOString() : "",
      action_type: "prompt",
      action_prompt: prompt,
      action_source: "",
      action_target_page: "",
      action_timeout_seconds: timeoutSeconds ? Number(timeoutSeconds) : null,
      action_model: (model || null) as ClaudeModel | null,
      skills,
      is_active: true,
    })
  }

  return (
    <div className="w-full h-full bg-white dark:bg-neutral-950 overflow-hidden flex flex-col">
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        {/* Tab bar */}
        <div className="px-4 pt-3 pb-0 shrink-0">
          <div className="flex items-center gap-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg p-0.5">
            {EDIT_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm"
                    : "text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className={`flex-1 min-h-0 ${activeTab === "prompt" ? "flex flex-col" : "overflow-y-auto"}`}>
          <div className={`px-4 py-4 ${activeTab === "prompt" ? "flex-1 min-h-0 flex flex-col" : ""}`}>
            {activeTab === "general" && (
              <GeneralTab
                title={title}
                onTitleChange={setTitle}
                siteId={siteId}
                siteSearch={siteSearch}
                onSiteSelect={(id, hostname) => {
                  setSiteId(id)
                  setSiteSearch(hostname)
                }}
                onSiteSearchChange={setSiteSearch}
                sites={sites}
                model={model}
                onModelChange={setModel}
                timeoutSeconds={timeoutSeconds}
                onTimeoutChange={setTimeoutSeconds}
              />
            )}

            {activeTab === "prompt" && <PromptTab prompt={prompt} onPromptChange={setPrompt} />}

            {activeTab === "trigger" && (
              <TriggerTab
                hasSchedule={hasSchedule}
                schedule={
                  hasSchedule
                    ? {
                        isEditing,
                        isOneTime,
                        onOneTimeChange: setIsOneTime,
                        cronSchedule,
                        onCronChange: setCronSchedule,
                        oneTimeDate,
                        onOneTimeDateChange: setOneTimeDate,
                        oneTimeTime,
                        onOneTimeTimeChange: setOneTimeTime,
                        timezone,
                        onTimezoneChange: setTimezone,
                        effectiveIsOneTime,
                      }
                    : undefined
                }
                event={!hasSchedule && editingJob ? { triggerType, editingJob } : undefined}
              />
            )}

            {activeTab === "tools" && <ToolsTab skills={skills} onSkillsChange={setSkills} />}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-black/[0.04] dark:border-white/[0.04] bg-white dark:bg-neutral-950 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg text-xs font-medium text-black/70 dark:text-white/70 border border-black/[0.08] dark:border-white/[0.08] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !isValid}
            className="h-9 px-5 rounded-lg text-xs font-medium bg-black dark:bg-white text-white dark:text-black hover:brightness-[0.85] active:brightness-75 disabled:opacity-30 disabled:hover:brightness-100 transition-all"
          >
            {saving ? "Saving..." : isEditing ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  )
}
