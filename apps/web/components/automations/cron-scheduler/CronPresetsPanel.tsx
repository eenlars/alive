"use client"

import { Check } from "lucide-react"
import { CRON_PRESETS } from "./cron-presets"

interface CronPresetsPanelProps {
  selectedValue: string
  onSelect: (value: string) => void
  showDescription?: boolean
}

export function CronPresetsPanel({ selectedValue, onSelect, showDescription = true }: CronPresetsPanelProps) {
  return (
    <div className="space-y-1.5">
      {CRON_PRESETS.map(preset => {
        const isSelected = selectedValue === preset.value
        return (
          <button
            key={preset.value}
            type="button"
            onClick={() => onSelect(preset.value)}
            className={`w-full text-left px-2.5 py-2 rounded-lg transition-all flex items-start gap-2 ${
              isSelected
                ? "bg-black dark:bg-white text-white dark:text-black"
                : "bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white hover:bg-black/[0.07] dark:hover:bg-white/[0.09]"
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                isSelected ? "bg-current border-current" : "border-black/20 dark:border-white/20"
              }`}
            >
              {isSelected && <Check size={10} className="font-bold" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${isSelected ? "" : ""}`}>{preset.label}</p>
              {showDescription && (
                <p
                  className={`text-[11px] mt-0.5 ${isSelected ? "text-white/70 dark:text-black/70" : "text-black/50 dark:text-white/50"}`}
                >
                  {preset.description}
                </p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
