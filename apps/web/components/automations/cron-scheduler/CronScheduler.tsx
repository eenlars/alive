"use client"

import { Clock } from "lucide-react"
import { useEffect, useState } from "react"
import { CronExpressionInput } from "./CronExpressionInput"
import { CronPresetsPanel } from "./CronPresetsPanel"
import { describeCron, parseCronExpression } from "./cron-parser"
import { CRON_PRESETS } from "./cron-presets"

interface CronSchedulerProps {
  value: string
  onChange: (cron: string) => void
  showOneTime?: boolean
  isOneTime?: boolean
  onOneTimeChange?: (isOneTime: boolean) => void
  oneTimeDate?: string
  oneTimeTime?: string
  onOneTimeDateChange?: (date: string) => void
  onOneTimeTimeChange?: (time: string) => void
}

export function CronScheduler({
  value,
  onChange,
  showOneTime = false,
  isOneTime: isOneTimeProp,
  onOneTimeChange,
  oneTimeDate,
  oneTimeTime,
  onOneTimeDateChange,
  onOneTimeTimeChange,
}: CronSchedulerProps) {
  const [mode, setMode] = useState<"preset" | "custom">("preset")
  const [customCron, setCustomCron] = useState(value)
  const [isOneTime, setIsOneTime] = useState(isOneTimeProp ?? false)

  // Sync isOneTime from parent
  useEffect(() => {
    if (isOneTimeProp !== undefined) {
      setIsOneTime(isOneTimeProp)
    }
  }, [isOneTimeProp])

  // Initialize based on value prop
  useEffect(() => {
    if (value) {
      setCustomCron(value)
      // Check if it matches any preset
      const presetValues = CRON_PRESETS.map(p => p.value)
      setMode(presetValues.includes(value) ? "preset" : "custom")
    }
  }, [value])

  const handlePresetSelect = (preset: string) => {
    setCustomCron(preset)
    onChange(preset)
    setMode("preset")
  }

  const handleCustomChange = (cron: string) => {
    setCustomCron(cron)
    onChange(cron)
    setMode("custom")
  }

  const handleOneTimeToggle = (enabled: boolean) => {
    setIsOneTime(enabled)
    onOneTimeChange?.(enabled)
  }

  const isValidCron = customCron ? parseCronExpression(customCron) !== null : false

  return (
    <div className="space-y-4">
      {/* Recurring / One-time toggle */}
      {showOneTime && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleOneTimeToggle(false)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              !isOneTime
                ? "bg-black dark:bg-white text-white dark:text-black"
                : "bg-black/[0.04] dark:bg-white/[0.06] text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
            }`}
          >
            Recurring
          </button>
          <button
            type="button"
            onClick={() => handleOneTimeToggle(true)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              isOneTime
                ? "bg-black dark:bg-white text-white dark:text-black"
                : "bg-black/[0.04] dark:bg-white/[0.06] text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
            }`}
          >
            One-time
          </button>
        </div>
      )}

      {/* One-time mode */}
      {isOneTime && showOneTime && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="one-time-date" className="text-xs font-medium text-black/60 dark:text-white/60 block">
              Date
            </label>
            <input
              id="one-time-date"
              type="date"
              value={oneTimeDate || ""}
              onChange={e => onOneTimeDateChange?.(e.target.value)}
              className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="one-time-time" className="text-xs font-medium text-black/60 dark:text-white/60 block">
              Time
            </label>
            <input
              id="one-time-time"
              type="time"
              value={oneTimeTime || ""}
              onChange={e => onOneTimeTimeChange?.(e.target.value)}
              className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer transition-all"
            />
          </div>
        </div>
      )}

      {/* Recurring mode */}
      {!isOneTime && (
        <>
          {/* Presets / Custom toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("preset")}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                mode === "preset"
                  ? "bg-black dark:bg-white text-white dark:text-black"
                  : "bg-black/[0.04] dark:bg-white/[0.06] text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
              }`}
            >
              Presets
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                mode === "custom"
                  ? "bg-black dark:bg-white text-white dark:text-black"
                  : "bg-black/[0.04] dark:bg-white/[0.06] text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
              }`}
            >
              Custom
            </button>
          </div>

          {mode === "preset" && (
            <CronPresetsPanel selectedValue={customCron} onSelect={handlePresetSelect} showDescription={true} />
          )}

          {mode === "custom" && (
            <div className="space-y-3">
              <CronExpressionInput value={customCron} onChange={handleCustomChange} />

              {customCron && isValidCron && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03]">
                  <Clock size={14} className="text-black/40 dark:text-white/40 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-black dark:text-white">{describeCron(customCron)}</p>
                    <p className="text-[11px] text-black/40 dark:text-white/40 mt-0.5 font-mono">{customCron}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
