"use client"

import { useQuery } from "@tanstack/react-query"
import { CLAUDE_MODELS, type ClaudeModel, getModelDisplayName } from "@webalive/shared"
import { ChevronDown, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { isScheduleTrigger, type TriggerType } from "@/lib/api/schemas"
import type { AutomationJob, Site } from "@/lib/hooks/useSettingsQueries"
import { CronScheduler } from "./cron-scheduler"

type SkillItem = {
  id: string
  displayName: string
  description: string
}

/** Model options derived from the shared CLAUDE_MODELS constant */
const MODEL_OPTIONS: { label: string; value: ClaudeModel }[] = Object.values(CLAUDE_MODELS).map(id => ({
  label: getModelDisplayName(id),
  value: id,
}))

export type AutomationFormData = {
  site_id: string
  name: string
  description: string
  trigger_type: TriggerType
  /** Only set when trigger_type is "cron" */
  cron_schedule: string
  /** Only set when trigger_type is "cron" or "one-time" */
  cron_timezone: string
  /** Only set when trigger_type is "one-time" */
  run_at: string
  action_type: "prompt" | "sync" | "publish"
  action_prompt: string
  action_source: string
  action_target_page: string
  action_timeout_seconds: number | null
  action_model: ClaudeModel | null
  skills: string[]
  is_active: boolean
}

const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "Amsterdam (CET)", value: "Europe/Amsterdam" },
  { label: "London (GMT)", value: "Europe/London" },
  { label: "New York (EST)", value: "America/New_York" },
  { label: "Los Angeles (PST)", value: "America/Los_Angeles" },
]

interface AutomationSidePanelProps {
  isOpen: boolean
  onClose: () => void
  sites: Site[]
  editingJob: AutomationJob | null
  onSave: (data: AutomationFormData) => Promise<void>
  saving: boolean
}

type EditTab = "general" | "trigger" | "tools"

export function AutomationSidePanel({ isOpen, onClose, sites, editingJob, onSave, saving }: AutomationSidePanelProps) {
  const isEditing = !!editingJob

  // The trigger type is fixed once set — editing preserves the original, new jobs default to "cron"
  const triggerType: TriggerType = (editingJob?.trigger_type as TriggerType) ?? "cron"
  const hasSchedule = isScheduleTrigger(triggerType)

  // Inner tab state
  const [activeTab, setActiveTab] = useState<EditTab>("general")

  // Form state
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [siteId, setSiteId] = useState("")
  const [siteSearch, setSiteSearch] = useState("")
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false)

  // Schedule state (only relevant when hasSchedule)
  const [isOneTime, setIsOneTime] = useState(false)
  const [cronSchedule, setCronSchedule] = useState("0 9 * * 1-5")
  const [oneTimeDate, setOneTimeDate] = useState("")
  const [oneTimeTime, setOneTimeTime] = useState("09:00")

  const [timezone, setTimezone] = useState("Europe/Amsterdam")
  const [timeoutSeconds, setTimeoutSeconds] = useState<string>("")
  const [model, setModel] = useState("")
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
      setActiveTab("general")
      if (editingJob) {
        setTitle(editingJob.name)
        setPrompt(editingJob.action_prompt || "")
        setSiteId(editingJob.site_id)
        const site = sites.find(s => s.id === editingJob.site_id)
        setSiteSearch(site?.hostname || "")
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
        } else if (editingJob.cron_schedule) {
          setIsOneTime(false)
          setCronSchedule(editingJob.cron_schedule)
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
      setSiteDropdownOpen(false)
      setSkillsDropdownOpen(false)
    }
  }, [isOpen, editingJob, sites])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // For new jobs: derive trigger from the one-time toggle. For existing: preserve original.
    const effectiveTrigger: TriggerType = editingJob ? triggerType : isOneTime ? "one-time" : "cron"
    const effectiveIsOneTime = editingJob ? triggerType === "one-time" : isOneTime

    const formData: AutomationFormData = {
      site_id: siteId,
      name: title,
      description: "",
      trigger_type: effectiveTrigger,
      // Schedule fields: only populated for schedule triggers
      cron_schedule: hasSchedule && !effectiveIsOneTime ? cronSchedule : "",
      cron_timezone: hasSchedule ? timezone : "",
      run_at: hasSchedule && effectiveIsOneTime ? new Date(`${oneTimeDate}T${oneTimeTime}`).toISOString() : "",
      action_type: "prompt",
      action_prompt: prompt,
      action_source: "",
      action_target_page: "",
      action_timeout_seconds: timeoutSeconds ? Number(timeoutSeconds) : null,
      action_model: (model || null) as ClaudeModel | null,
      skills,
      is_active: true,
    }

    await onSave(formData)
  }

  // Validation: schedule triggers need schedule data, event triggers don't
  const effectiveIsOneTime = isEditing ? triggerType === "one-time" : isOneTime
  const scheduleValid = hasSchedule ? (effectiveIsOneTime ? oneTimeDate && oneTimeTime : cronSchedule.trim()) : true
  const isValid = title.trim() && prompt.trim() && siteId && scheduleValid

  const panelRef = useRef<HTMLDivElement>(null)

  const EDIT_TABS: { id: EditTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "trigger", label: "Trigger" },
    { id: "tools", label: "Tools" },
  ]

  return (
    <div ref={panelRef} className="w-full h-full bg-white dark:bg-neutral-950 overflow-hidden flex flex-col">
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        {/* Inner tab bar */}
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

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-4 space-y-3">
            {/* === General Tab === */}
            {activeTab === "general" && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="auto-title" className="text-xs font-medium text-black dark:text-white">
                    Title
                  </label>
                  <input
                    id="auto-title"
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Summary of AI news"
                    autoComplete="off"
                    className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="auto-prompt" className="text-xs font-medium text-black dark:text-white">
                    Prompt
                  </label>
                  <textarea
                    id="auto-prompt"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Search for yesterday's most impactful AI news and send me a brief summary."
                    className="w-full h-24 px-3 py-2 rounded-lg text-sm leading-relaxed bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"
                    maxLength={5000}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="auto-site" className="text-xs font-medium text-black dark:text-white">
                    Website
                  </label>
                  <div className="relative">
                    <input
                      id="auto-site"
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
                      className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"
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

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="auto-model" className="text-xs font-medium text-black/60 dark:text-white/60">
                      Model
                    </label>
                    <select
                      id="auto-model"
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 12px center",
                        paddingRight: "36px",
                      }}
                    >
                      <option value="">Default</option>
                      {MODEL_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="auto-timeout" className="text-xs font-medium text-black/60 dark:text-white/60">
                      Timeout (s)
                    </label>
                    <input
                      id="auto-timeout"
                      type="number"
                      min={10}
                      max={3600}
                      value={timeoutSeconds}
                      onChange={e => setTimeoutSeconds(e.target.value)}
                      placeholder="300"
                      className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            {/* === Trigger Tab === */}
            {activeTab === "trigger" &&
              (hasSchedule ? (
                <>
                  <CronScheduler
                    value={cronSchedule}
                    onChange={setCronSchedule}
                    showOneTime={true}
                    lockOneTimeToggle={isEditing}
                    isOneTime={isOneTime}
                    onOneTimeChange={setIsOneTime}
                    oneTimeDate={oneTimeDate}
                    oneTimeTime={oneTimeTime}
                    onOneTimeDateChange={setOneTimeDate}
                    onOneTimeTimeChange={setOneTimeTime}
                  />

                  {!effectiveIsOneTime && (
                    <div className="space-y-1.5">
                      <label htmlFor="auto-tz" className="text-xs font-medium text-black/60 dark:text-white/60">
                        Timezone
                      </label>
                      <select
                        id="auto-tz"
                        value={timezone}
                        onChange={e => setTimezone(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer appearance-none"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "right 12px center",
                          paddingRight: "36px",
                        }}
                      >
                        {TIMEZONES.map(tz => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              ) : editingJob ? (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-black dark:text-white">
                      {triggerType === "email" ? "Email trigger" : "Webhook trigger"}
                    </p>
                    {triggerType === "email" && editingJob.email_address && (
                      <p className="text-[11px] text-black/40 dark:text-white/40 mt-0.5 font-mono truncate">
                        {editingJob.email_address}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-black/40 dark:text-white/40">Trigger type is set when creating the agent.</p>
              ))}

            {/* === Tools & Skills Tab === */}
            {activeTab === "tools" && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-black dark:text-white block">Skills</div>
                <button
                  type="button"
                  onClick={() => setSkillsDropdownOpen(!skillsDropdownOpen)}
                  className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white flex items-center justify-between hover:bg-black/[0.07] dark:hover:bg-white/[0.09] transition-colors"
                >
                  <span className="text-black/50 dark:text-white/50">
                    {skills.length > 0 ? `${skills.length} selected` : "None"}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-black/40 dark:text-white/40 transition-transform ${
                      skillsDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {skillsDropdownOpen && availableSkills.length > 0 && (
                  <div className="max-h-48 overflow-auto rounded-xl bg-white dark:bg-neutral-900 border border-black/[0.08] dark:border-white/[0.08]">
                    {availableSkills.map((skill: SkillItem) => {
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
                          className="w-full px-3 py-2 text-left text-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors"
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
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
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm text-black dark:text-white">{skill.displayName}</span>
                            {skill.description && (
                              <p className="text-[11px] text-black/40 dark:text-white/40 truncate">
                                {skill.description}
                              </p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((skillId: string) => {
                      const skill = availableSkills.find((s: SkillItem) => s.id === skillId)
                      return (
                        <span
                          key={skillId}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-black/70 dark:text-white/70"
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
