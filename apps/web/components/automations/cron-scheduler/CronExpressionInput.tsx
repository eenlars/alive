"use client"

import { AlertCircle, Check } from "lucide-react"
import { useMemo } from "react"
import { describeCron, parseCronExpression } from "./cron-parser"
import { matchPreset } from "./cron-presets"

interface CronExpressionInputProps {
  value: string
  onChange: (value: string) => void
  showValidation?: boolean
}

export function CronExpressionInput({ value, onChange, showValidation = true }: CronExpressionInputProps) {
  const validation = useMemo(() => {
    if (!value.trim()) return null

    const parsed = parseCronExpression(value)
    if (!parsed) {
      return {
        isValid: false,
        message: "Invalid cron expression (must be 5 space-separated fields)",
      }
    }

    return {
      isValid: true,
      message: describeCron(value),
    }
  }, [value])

  const isValid = validation?.isValid ?? true
  const preset = value ? matchPreset(value) : null

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <label htmlFor="cron-input" className="text-[13px] font-medium text-black dark:text-white block">
          Cron expression
        </label>
        <input
          id="cron-input"
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0 9 * * 1-5"
          className={`w-full h-9 px-4 rounded-xl text-sm font-mono bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border transition-all focus:outline-none ${
            !showValidation
              ? "border-0 focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08]"
              : isValid
                ? "border-green-200 dark:border-green-800 focus:ring-1 focus:ring-green-300/50 dark:focus:ring-green-700/50"
                : "border-red-200 dark:border-red-800 focus:ring-1 focus:ring-red-300/50 dark:focus:ring-red-700/50"
          }`}
        />
      </div>

      {showValidation && validation && (
        <div
          className={`px-3 py-2 rounded-lg text-sm flex items-start gap-2 ${
            isValid
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
          }`}
        >
          <div className="mt-0.5 shrink-0">{isValid ? <Check size={16} /> : <AlertCircle size={16} />}</div>
          <div className="flex-1">
            <p className="font-medium">{validation.message}</p>
            {preset && <p className="text-xs mt-1 opacity-75">Matches: {preset.label}</p>}
          </div>
        </div>
      )}

      <p className="text-[11px] text-black/40 dark:text-white/40 leading-relaxed">
        Format:{" "}
        <code className="font-mono bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
          minute hour day month weekday
        </code>
        <br />
        Example:{" "}
        <code className="font-mono bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">0 9 * * 1-5</code> =
        weekdays at 9:00 AM
      </p>
    </div>
  )
}
