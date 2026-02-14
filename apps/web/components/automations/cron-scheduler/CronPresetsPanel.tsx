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
    <div className="space-y-1">
      {CRON_PRESETS.map(preset => {
        const isSelected = selectedValue === preset.value
        return (
          <button
            key={preset.value}
            type="button"
            onClick={() => onSelect(preset.value)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3 ${
              isSelected ? "bg-black/[0.06] dark:bg-white/[0.08]" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                isSelected
                  ? "border-black dark:border-white bg-black dark:bg-white"
                  : "border-black/20 dark:border-white/20"
              }`}
            >
              {isSelected && <Check size={10} className="text-white dark:text-black" strokeWidth={3} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-black dark:text-white">{preset.label}</p>
              {showDescription && (
                <p className="text-[11px] text-black/40 dark:text-white/40 mt-0.5">{preset.description}</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
