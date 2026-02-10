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
            className={`w-full text-left px-2.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              isSelected
                ? "bg-black/[0.08] dark:bg-white/[0.1] ring-1 ring-black/[0.08] dark:ring-white/[0.1]"
                : "bg-black/[0.03] dark:bg-white/[0.04] text-black dark:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.07]"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-black dark:text-white">{preset.label}</p>
              {showDescription && (
                <p className="text-[11px] mt-0.5 text-black/50 dark:text-white/50">{preset.description}</p>
              )}
            </div>
            {isSelected && <Check size={14} className="text-black/60 dark:text-white/60 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
