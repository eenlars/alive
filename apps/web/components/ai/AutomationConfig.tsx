/**
 * Automation Configuration Component
 *
 * Interactive form for creating a scheduled automation task.
 * Adapted from AutomationsSettings for use in chat context.
 *
 * Best practices applied:
 * - Inline validation on blur
 * - Clear, actionable error messages
 * - Progress indicator showing current position
 * - Keyboard navigation (Enter to proceed)
 * - Data preserved when navigating back
 */

"use client"

import { Calendar, Check, ChevronRight, Clock, Globe, Zap } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

// =============================================================================
// TYPES
// =============================================================================

export interface SiteOption {
  id: string
  hostname: string
}

export interface AutomationConfigData {
  sites: SiteOption[]
  defaultSiteId?: string
  context?: string
}

export interface AutomationConfigResult {
  siteId: string
  siteName: string
  name: string
  prompt: string
  scheduleType: "once" | "daily" | "weekly" | "monthly" | "custom"
  scheduleTime: string // HH:MM format
  scheduleDate?: string // YYYY-MM-DD for one-time
  cronExpression?: string // For custom
  timezone: string
}

interface AutomationConfigProps {
  data: AutomationConfigData
  onComplete: (result: AutomationConfigResult) => void
  onSkip?: () => void
}

// =============================================================================
// CONSTANTS
// =============================================================================

const REPEAT_OPTIONS = [
  { label: "No repeat", value: "once", description: "Run once at a specific time" },
  { label: "Daily", value: "daily", description: "Every day at the same time" },
  { label: "Weekly", value: "weekly", description: "Every week on the same day" },
  { label: "Monthly", value: "monthly", description: "Every month on the same date" },
  { label: "Custom", value: "custom", description: "Use a cron expression" },
] as const

const TIMEZONES = [
  { label: "Amsterdam (CET)", value: "Europe/Amsterdam" },
  { label: "London (GMT)", value: "Europe/London" },
  { label: "New York (EST)", value: "America/New_York" },
  { label: "Los Angeles (PST)", value: "America/Los_Angeles" },
  { label: "UTC", value: "UTC" },
]

type RepeatValue = (typeof REPEAT_OPTIONS)[number]["value"]

// =============================================================================
// COMPONENT
// =============================================================================

export function AutomationConfig({ data, onComplete, onSkip }: AutomationConfigProps) {
  const [step, setStep] = useState<"basics" | "schedule" | "confirm">("basics")

  // Basic fields
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [siteId, setSiteId] = useState(data.defaultSiteId || "")
  const [siteSearch, setSiteSearch] = useState("")
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false)

  // Schedule fields
  const [scheduleType, setScheduleType] = useState<RepeatValue>("daily")
  const [scheduleDate, setScheduleDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split("T")[0]
  })
  const [scheduleTime, setScheduleTime] = useState("09:00")
  const [cronExpression, setCronExpression] = useState("")
  const [timezone, setTimezone] = useState("Europe/Amsterdam")

  // Validation
  const [nameError, setNameError] = useState<string | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [cronError, setCronError] = useState<string | null>(null)

  const nameInputRef = useRef<HTMLInputElement>(null)
  const promptInputRef = useRef<HTMLTextAreaElement>(null)

  // Initialize site search from defaultSiteId
  useEffect(() => {
    if (data.defaultSiteId) {
      const site = data.sites.find(s => s.id === data.defaultSiteId)
      if (site) {
        setSiteSearch(site.hostname)
      }
    }
  }, [data.defaultSiteId, data.sites])

  // Focus first input on mount
  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  const filteredSites = data.sites.filter(s => s.hostname.toLowerCase().includes(siteSearch.toLowerCase()))

  const validateName = useCallback((value: string): string | null => {
    if (!value.trim()) return "Please enter a name"
    if (value.length < 3) return "Name must be at least 3 characters"
    if (value.length > 100) return "Name must be less than 100 characters"
    return null
  }, [])

  const validatePrompt = useCallback((value: string): string | null => {
    if (!value.trim()) return "Please enter a prompt"
    if (value.length < 10) return "Prompt must be at least 10 characters"
    if (value.length > 5000) return "Prompt must be less than 5000 characters"
    return null
  }, [])

  const validateCron = useCallback((value: string): string | null => {
    if (!value.trim()) return "Please enter a cron expression"
    const parts = value.trim().split(/\s+/)
    if (parts.length !== 5) return "Cron expression must have 5 parts (min hour day month weekday)"
    return null
  }, [])

  const handleNext = useCallback(() => {
    if (step === "basics") {
      const nameErr = validateName(name)
      const promptErr = validatePrompt(prompt)

      if (nameErr) {
        setNameError(nameErr)
        nameInputRef.current?.focus()
        return
      }
      if (promptErr) {
        setPromptError(promptErr)
        promptInputRef.current?.focus()
        return
      }
      if (!siteId) {
        // Auto-select first site if only one
        if (data.sites.length === 1) {
          setSiteId(data.sites[0].id)
          setSiteSearch(data.sites[0].hostname)
        } else {
          return // Can't proceed without site
        }
      }
      setStep("schedule")
    } else if (step === "schedule") {
      if (scheduleType === "custom") {
        const cronErr = validateCron(cronExpression)
        if (cronErr) {
          setCronError(cronErr)
          return
        }
      }
      setStep("confirm")
    }
  }, [step, name, prompt, siteId, scheduleType, cronExpression, validateName, validatePrompt, validateCron, data.sites])

  const handleBack = useCallback(() => {
    if (step === "schedule") setStep("basics")
    else if (step === "confirm") setStep("schedule")
  }, [step])

  const handleSubmit = useCallback(() => {
    const site = data.sites.find(s => s.id === siteId)
    if (!site) return

    onComplete({
      siteId,
      siteName: site.hostname,
      name,
      prompt,
      scheduleType,
      scheduleTime,
      scheduleDate: scheduleType === "once" ? scheduleDate : undefined,
      cronExpression: scheduleType === "custom" ? cronExpression : undefined,
      timezone,
    })
  }, [siteId, name, prompt, scheduleType, scheduleTime, scheduleDate, cronExpression, timezone, data.sites, onComplete])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (step === "confirm") {
          handleSubmit()
        } else {
          handleNext()
        }
      }
    },
    [step, handleNext, handleSubmit],
  )

  // Step indicator
  const steps = ["basics", "schedule", "confirm"] as const
  const currentStepIndex = steps.indexOf(step)

  const stepLabels: Record<typeof step, string> = {
    basics: "Task details",
    schedule: "Schedule",
    confirm: "Confirm",
  }

  const selectedSite = data.sites.find(s => s.id === siteId)

  const canProceedBasics = name.trim().length >= 3 && prompt.trim().length >= 10 && siteId
  const canProceedSchedule = scheduleType !== "custom" || cronExpression.trim().length > 0

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl">
      {/* Header with step indicator */}
      <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-900 px-3 py-3 gap-1">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-zinc-500 dark:text-zinc-400" />
          <span className="min-w-0 pl-1 font-normal text-zinc-900 dark:text-zinc-100 text-sm">New Automation</span>
          <ChevronRight size={14} className="text-zinc-400 dark:text-zinc-500" />
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{stepLabels[step]}</span>
        </div>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {currentStepIndex + 1}/{steps.length}
        </span>
      </div>

      {/* Content */}
      <div className="flex h-full w-full flex-col border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex-1 overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
          {/* Step: Basics */}
          {step === "basics" && (
            <div className="h-full duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 outline-none">
                {data.context && <p className="text-sm text-zinc-500 dark:text-zinc-400">{data.context}</p>}

                {/* Name field */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="automation-name" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Task name
                  </label>
                  <input
                    ref={nameInputRef}
                    id="automation-name"
                    type="text"
                    value={name}
                    onChange={e => {
                      setName(e.target.value)
                      if (nameError) setNameError(null)
                    }}
                    onBlur={() => {
                      if (name.trim()) setNameError(validateName(name))
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Daily news summary"
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? "name-error" : undefined}
                    className={`w-full rounded-lg border bg-transparent px-3 py-2 text-sm transition-colors duration-150 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:outline-none text-zinc-900 dark:text-zinc-100 ${
                      nameError
                        ? "border-red-300 dark:border-red-700 focus-visible:border-red-400"
                        : name.length >= 3
                          ? "border-emerald-300 dark:border-emerald-700"
                          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                    }`}
                    maxLength={100}
                  />
                  {nameError && (
                    <p id="name-error" className="text-xs text-red-500 dark:text-red-400" role="alert">
                      {nameError}
                    </p>
                  )}
                </div>

                {/* Prompt field */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="automation-prompt" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    What should Claude do?
                  </label>
                  <textarea
                    ref={promptInputRef}
                    id="automation-prompt"
                    value={prompt}
                    onChange={e => {
                      setPrompt(e.target.value)
                      if (promptError) setPromptError(null)
                    }}
                    onBlur={() => {
                      if (prompt.trim()) setPromptError(validatePrompt(prompt))
                    }}
                    placeholder="Search for yesterday's AI news and send me a brief summary..."
                    rows={3}
                    aria-invalid={!!promptError}
                    aria-describedby={promptError ? "prompt-error" : undefined}
                    className={`w-full rounded-lg border bg-transparent px-3 py-2 text-sm transition-colors duration-150 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:outline-none text-zinc-900 dark:text-zinc-100 resize-none ${
                      promptError
                        ? "border-red-300 dark:border-red-700 focus-visible:border-red-400"
                        : prompt.length >= 10
                          ? "border-emerald-300 dark:border-emerald-700"
                          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                    }`}
                    maxLength={5000}
                  />
                  {promptError && (
                    <p id="prompt-error" className="text-xs text-red-500 dark:text-red-400" role="alert">
                      {promptError}
                    </p>
                  )}
                </div>

                {/* Site selector */}
                {data.sites.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="automation-site" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      Website
                    </label>
                    <div className="relative">
                      <input
                        id="automation-site"
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
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:outline-none hover:border-zinc-300 dark:hover:border-zinc-600"
                      />
                      {siteDropdownOpen && filteredSites.length > 0 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1.5 max-h-48 overflow-auto rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-lg">
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
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${
                                siteId === site.id ? "bg-zinc-100 dark:bg-zinc-800" : ""
                              }`}
                            >
                              {site.hostname}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Single site display */}
                {data.sites.length === 1 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <Globe size={14} className="text-zinc-400" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">{data.sites[0].hostname}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step: Schedule */}
          {step === "schedule" && (
            <div className="h-full duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="flex h-full flex-col gap-0 overflow-y-auto outline-none">
                {/* Section 1: Schedule Type */}
                <div className="flex flex-col gap-4 px-4 pt-4 pb-6 border-b border-black/[0.08] dark:border-white/[0.08]">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-black dark:text-white">When should it run?</h3>
                    <p className="text-xs text-black/50 dark:text-white/50">Choose how often this automation repeats</p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {REPEAT_OPTIONS.map(option => {
                      const isSelected = scheduleType === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setScheduleType(option.value)}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-all duration-150 text-left ${
                            isSelected
                              ? "bg-blue-500/10 dark:bg-blue-500/10 border border-blue-500/30 dark:border-blue-500/30"
                              : "bg-black/[0.02] dark:bg-white/[0.02] border border-transparent hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex h-5 w-5 items-center justify-center pt-0.5 flex-shrink-0">
                            <div
                              className={`size-4 rounded-full border-2 transition-all ${
                                isSelected
                                  ? "border-blue-600 dark:border-blue-400 bg-blue-600 dark:bg-blue-400"
                                  : "border-black/30 dark:border-white/30 bg-white dark:bg-black"
                              }`}
                            />
                          </div>
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <p className="text-sm font-medium text-black dark:text-white">{option.label}</p>
                            <p className="text-xs text-black/50 dark:text-white/50">{option.description}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Section 2: Time & Date Inputs */}
                <div
                  className={`flex flex-col gap-4 px-4 py-6 ${scheduleType === "custom" ? "border-b border-black/[0.08] dark:border-white/[0.08]" : ""}`}
                >
                  {scheduleType !== "custom" && (
                    <>
                      <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-semibold text-black dark:text-white">Schedule details</h3>
                        <p className="text-xs text-black/50 dark:text-white/50">Set the time and other specifics</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <label
                            htmlFor="schedule-time"
                            className="text-xs font-semibold text-black dark:text-white uppercase tracking-wider opacity-70"
                          >
                            Time
                          </label>
                          <div className="relative">
                            <Clock
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 pointer-events-none"
                            />
                            <input
                              id="schedule-time"
                              type="time"
                              value={scheduleTime}
                              onChange={e => setScheduleTime(e.target.value)}
                              className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] pl-10 pr-3 py-2.5 text-sm text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/30 transition-all hover:border-black/[0.12] dark:hover:border-white/[0.12]"
                            />
                          </div>
                        </div>

                        {scheduleType === "once" && (
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="schedule-date"
                              className="text-xs font-semibold text-black dark:text-white uppercase tracking-wider opacity-70"
                            >
                              Date
                            </label>
                            <div className="relative">
                              <Calendar
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 pointer-events-none"
                              />
                              <input
                                id="schedule-date"
                                type="date"
                                value={scheduleDate}
                                onChange={e => setScheduleDate(e.target.value)}
                                className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] pl-10 pr-3 py-2.5 text-sm text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/30 transition-all hover:border-black/[0.12] dark:hover:border-white/[0.12]"
                              />
                            </div>
                          </div>
                        )}

                        {scheduleType !== "once" && (
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="schedule-timezone"
                              className="text-xs font-semibold text-black dark:text-white uppercase tracking-wider opacity-70"
                            >
                              Timezone
                            </label>
                            <select
                              id="schedule-timezone"
                              value={timezone}
                              onChange={e => setTimezone(e.target.value)}
                              className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/30 transition-all hover:border-black/[0.12] dark:hover:border-white/[0.12] cursor-pointer"
                            >
                              {TIMEZONES.map(tz => (
                                <option key={tz.value} value={tz.value}>
                                  {tz.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Custom cron */}
                  {scheduleType === "custom" && (
                    <>
                      <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-semibold text-black dark:text-white">Custom schedule</h3>
                        <p className="text-xs text-black/50 dark:text-white/50">
                          Enter a cron expression for advanced scheduling
                        </p>
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                          <label
                            htmlFor="cron-expression"
                            className="text-xs font-semibold text-black dark:text-white uppercase tracking-wider opacity-70"
                          >
                            Cron expression
                          </label>
                          <input
                            id="cron-expression"
                            type="text"
                            value={cronExpression}
                            onChange={e => {
                              setCronExpression(e.target.value)
                              if (cronError) setCronError(null)
                            }}
                            onBlur={() => {
                              if (cronExpression.trim()) setCronError(validateCron(cronExpression))
                            }}
                            placeholder="0 9 * * 1-5"
                            aria-invalid={!!cronError}
                            className={`w-full rounded-xl border bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2.5 text-sm font-mono placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none transition-all text-black dark:text-white ${
                              cronError
                                ? "border-red-300 dark:border-red-700 focus:ring-1 focus:ring-red-500/50"
                                : "border-black/[0.08] dark:border-white/[0.08] focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/30 hover:border-black/[0.12] dark:hover:border-white/[0.12]"
                            }`}
                          />
                        </div>

                        {cronError && (
                          <p
                            className="text-xs text-red-500 dark:text-red-400 bg-red-500/5 dark:bg-red-500/5 border border-red-200/30 dark:border-red-700/30 rounded-lg px-3 py-2"
                            role="alert"
                          >
                            {cronError}
                          </p>
                        )}

                        <div className="bg-blue-500/5 dark:bg-blue-500/5 border border-blue-200/30 dark:border-blue-700/30 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-black/60 dark:text-white/60 leading-relaxed">
                            <span className="font-semibold">Format:</span> minute hour day month weekday
                            <br />
                            <span className="font-mono text-black/50 dark:text-white/50">0 9 * * 1-5</span> = weekdays
                            at 9am
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-2">
                        <label
                          htmlFor="cron-timezone"
                          className="text-xs font-semibold text-black dark:text-white uppercase tracking-wider opacity-70"
                        >
                          Timezone
                        </label>
                        <select
                          id="cron-timezone"
                          value={timezone}
                          onChange={e => setTimezone(e.target.value)}
                          className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/30 transition-all hover:border-black/[0.12] dark:hover:border-white/[0.12] cursor-pointer"
                        >
                          {TIMEZONES.map(tz => (
                            <option key={tz.value} value={tz.value}>
                              {tz.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step: Confirm */}
          {step === "confirm" && (
            <div className="h-full duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 outline-none">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Ready to create your automation:</p>
                <div className="space-y-2">
                  <div className="flex flex-col gap-0.5 px-2 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Task</p>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{name}</p>
                  </div>

                  <div className="flex flex-col gap-0.5 px-2 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                      Website
                    </p>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedSite?.hostname || data.sites[0]?.hostname}
                    </p>
                  </div>

                  <div className="flex flex-col gap-0.5 px-2 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                      Schedule
                    </p>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {scheduleType === "once" && `${scheduleDate} at ${scheduleTime}`}
                      {scheduleType === "daily" && `Daily at ${scheduleTime}`}
                      {scheduleType === "weekly" && `Weekly at ${scheduleTime}`}
                      {scheduleType === "monthly" && `Monthly at ${scheduleTime}`}
                      {scheduleType === "custom" && `Cron: ${cronExpression}`}
                      {scheduleType !== "once" && ` (${timezone.split("/")[1] || timezone})`}
                    </p>
                  </div>

                  <div className="flex flex-col gap-0.5 px-2 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                      Prompt
                    </p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3">{prompt}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex h-12 items-center justify-between px-3 py-2">
          {/* Left Button */}
          {step === "basics" ? (
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md gap-1.5 h-7 px-4 py-2 text-zinc-700 dark:text-zinc-300"
            >
              Skip
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md gap-1.5 h-7 px-4 py-2 text-zinc-700 dark:text-zinc-300"
            >
              Back
            </button>
          )}

          {/* Progress Indicator */}
          <div
            className="flex items-center gap-1"
            role="progressbar"
            aria-valuenow={currentStepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
          >
            {steps.map((s, index) => {
              const isActive = currentStepIndex === index
              const isCompleted = index < currentStepIndex
              return (
                <div
                  key={s}
                  className={`flex items-center justify-center rounded-full transition-all ${
                    isActive ? "h-4 w-7" : "size-4"
                  }`}
                  title={`Step ${index + 1}${isActive ? " (current)" : isCompleted ? " (completed)" : ""}`}
                >
                  <div
                    className={`rounded-full transition-all ${
                      isActive
                        ? "h-2 w-5 bg-zinc-900 dark:bg-zinc-100"
                        : isCompleted
                          ? "size-2 bg-emerald-500 dark:bg-emerald-400"
                          : "size-2 bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  />
                </div>
              )
            })}
          </div>

          {/* Right Button */}
          {step === "confirm" ? (
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-md gap-1.5 h-7 px-4 py-2"
            >
              <Check size={14} />
              Create
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={(step === "basics" && !canProceedBasics) || (step === "schedule" && !canProceedSchedule)}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md gap-1.5 h-7 px-4 py-2 text-zinc-700 dark:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
