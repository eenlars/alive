"use client"

import { AlertCircle, Check } from "lucide-react"
import { useMemo, useRef, useCallback } from "react"
import { describeCron, parseCronExpression } from "./cron-parser"
import { matchPreset } from "./cron-presets"

interface CronExpressionInputProps {
  value: string
  onChange: (value: string) => void
  showValidation?: boolean
}

const FIELDS = [
  { key: "min", label: "MIN", placeholder: "*", max: 59, hint: "0-59" },
  { key: "hr", label: "HR", placeholder: "*", max: 23, hint: "0-23" },
  { key: "day", label: "DAY", placeholder: "*", max: 31, hint: "1-31" },
  { key: "mon", label: "MON", placeholder: "*", max: 12, hint: "1-12" },
  { key: "wk", label: "WK", placeholder: "*", max: 7, hint: "0-7" },
] as const

function splitCron(expression: string): string[] {
  const parts = expression.trim().split(/\s+/)
  // Always return 5 parts, padding with "*" if needed
  return Array.from({ length: 5 }, (_, i) => parts[i] || "*")
}

export function CronExpressionInput({ value, onChange, showValidation = true }: CronExpressionInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const parts = useMemo(() => splitCron(value), [value])

  const validation = useMemo(() => {
    if (!value.trim()) return null

    const parsed = parseCronExpression(value)
    if (!parsed) {
      return {
        isValid: false,
        message: "Invalid cron expression",
      }
    }

    return {
      isValid: true,
      message: describeCron(value),
    }
  }, [value])

  const isValid = validation?.isValid ?? true
  const preset = value ? matchPreset(value) : null

  const handleFieldChange = useCallback(
    (index: number, fieldValue: string) => {
      const next = [...parts]
      next[index] = fieldValue || "*"
      onChange(next.join(" "))
    },
    [parts, onChange],
  )

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget

    // Tab/arrow to next field
    if (e.key === " " || (e.key === "ArrowRight" && input.selectionStart === input.value.length)) {
      e.preventDefault()
      inputRefs.current[index + 1]?.focus()
      inputRefs.current[index + 1]?.select()
    }

    // Arrow left to prev field
    if (e.key === "ArrowLeft" && input.selectionStart === 0) {
      e.preventDefault()
      inputRefs.current[index - 1]?.focus()
      inputRefs.current[index - 1]?.select()
    }

    // Backspace on empty field goes to previous
    if (e.key === "Backspace" && input.value === "" && index > 0) {
      e.preventDefault()
      inputRefs.current[index - 1]?.focus()
      inputRefs.current[index - 1]?.select()
    }
  }, [])

  return (
    <div className="space-y-2">
      {/* 5-field cron entry */}
      <div className="flex gap-1.5">
        {FIELDS.map((field, i) => (
          <div key={field.key} className="flex-1 min-w-0">
            <label
              htmlFor={`cron-${field.key}`}
              className="block text-[9px] font-medium text-black/40 dark:text-white/40 text-center mb-1 uppercase tracking-wider"
            >
              {field.label}
            </label>
            <input
              ref={el => {
                inputRefs.current[i] = el
              }}
              id={`cron-${field.key}`}
              type="text"
              inputMode="text"
              autoComplete="off"
              value={parts[i]}
              onChange={e => handleFieldChange(i, e.target.value.trim())}
              onKeyDown={e => handleKeyDown(i, e)}
              onFocus={e => e.target.select()}
              placeholder={field.placeholder}
              className={`w-full h-9 px-1 rounded-lg text-xs font-mono text-center bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/20 dark:placeholder:text-white/20 border transition-all focus:outline-none focus:ring-1 ${
                !showValidation || !value.trim()
                  ? "border-black/[0.06] dark:border-white/[0.06] focus:ring-black/[0.12] dark:focus:ring-white/[0.12]"
                  : isValid
                    ? "border-green-200 dark:border-green-800 focus:ring-green-300/50 dark:focus:ring-green-700/50"
                    : "border-red-200 dark:border-red-800 focus:ring-red-300/50 dark:focus:ring-red-700/50"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Validation feedback */}
      {showValidation && validation && (
        <div
          className={`px-2.5 py-1.5 rounded-lg text-xs flex items-start gap-1.5 ${
            isValid
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
          }`}
        >
          <div className="mt-0.5 shrink-0">{isValid ? <Check size={14} /> : <AlertCircle size={14} />}</div>
          <div className="flex-1">
            <p className="font-medium leading-tight">{validation.message}</p>
            {preset && <p className="text-[10px] mt-0.5 opacity-75">Matches: {preset.label}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
