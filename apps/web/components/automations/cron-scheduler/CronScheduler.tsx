"use client"

import { Clock } from "lucide-react"
import { useState, useEffect } from "react"
import { CronExpressionInput } from "./CronExpressionInput"
import { CronPresetsPanel } from "./CronPresetsPanel"
import { describeCron } from "./cron-parser"

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
      const PRESETS = ["*/5 * * * *", "0 * * * *", "0 9 * * *", "0 9 * * 1-5", "0 9 * * 0", "0 9 1 * *"]
      setMode(PRESETS.includes(value) ? "preset" : "custom")
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

  return (
    <div className="space-y-0">
      {/* Segmented control: Recurring / One-time */}
      {showOneTime && (
        <div className="px-4 pt-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <div className="flex rounded-lg bg-black/[0.05] dark:bg-white/[0.06] p-0.5">
            <button
              type="button"
              onClick={() => handleOneTimeToggle(false)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                !isOneTime
                  ? "bg-white dark:bg-white/[0.12] text-black dark:text-white shadow-sm"
                  : "text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
              }`}
            >
              Recurring
            </button>
            <button
              type="button"
              onClick={() => handleOneTimeToggle(true)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                isOneTime
                  ? "bg-white dark:bg-white/[0.12] text-black dark:text-white shadow-sm"
                  : "text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
              }`}
            >
              One-time
            </button>
          </div>
        </div>
      )}

      {/* One-time mode */}
      {isOneTime && showOneTime && (
        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="one-time-date" className="text-[11px] font-medium text-black dark:text-white block">
                Date
              </label>
              <input
                id="one-time-date"
                type="date"
                value={oneTimeDate || ""}
                onChange={e => onOneTimeDateChange?.(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg text-xs bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer transition-all"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="one-time-time" className="text-[11px] font-medium text-black dark:text-white block">
                Time
              </label>
              <input
                id="one-time-time"
                type="time"
                value={oneTimeTime || ""}
                onChange={e => onOneTimeTimeChange?.(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg text-xs bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] cursor-pointer transition-all"
              />
            </div>
          </div>
        </div>
      )}

      {/* Recurring mode */}
      {!isOneTime && (
        <>
          {/* Segmented control: Presets / Custom */}
          <div className="px-4 pt-3 pb-0">
            <div className="flex rounded-lg bg-black/[0.05] dark:bg-white/[0.06] p-0.5">
              <button
                type="button"
                onClick={() => setMode("preset")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  mode === "preset"
                    ? "bg-white dark:bg-white/[0.12] text-black dark:text-white shadow-sm"
                    : "text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
                }`}
              >
                Presets
              </button>
              <button
                type="button"
                onClick={() => setMode("custom")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  mode === "custom"
                    ? "bg-white dark:bg-white/[0.12] text-black dark:text-white shadow-sm"
                    : "text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70"
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          {/* Content area */}
          <div className="px-4 py-3 space-y-3">
            {mode === "preset" && (
              <CronPresetsPanel selectedValue={customCron} onSelect={handlePresetSelect} showDescription={true} />
            )}

            {mode === "custom" && (
              <>
                <CronExpressionInput value={customCron} onChange={handleCustomChange} showValidation={true} />

                {/* Live description - only in custom mode */}
                {customCron && (
                  <div className="px-3 py-2.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06]">
                    <div className="flex items-start gap-2">
                      <Clock size={14} className="text-black/50 dark:text-white/50 mt-1 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-black dark:text-white">{describeCron(customCron)}</p>
                        <p className="text-xs text-black/50 dark:text-white/50 mt-1 font-mono">{customCron}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
