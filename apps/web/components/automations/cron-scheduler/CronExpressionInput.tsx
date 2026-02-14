"use client"

import { useCallback, useMemo, useRef } from "react"
import { parseCronExpression } from "./cron-parser"

interface CronExpressionInputProps {
  value: string
  onChange: (value: string) => void
}

const FIELDS = [
  { key: "min", label: "Minute", placeholder: "*", hint: "0–59" },
  { key: "hr", label: "Hour", placeholder: "*", hint: "0–23" },
  { key: "day", label: "Day", placeholder: "*", hint: "1–31" },
  { key: "mon", label: "Month", placeholder: "*", hint: "1–12" },
  { key: "wk", label: "Weekday", placeholder: "*", hint: "0=Sun" },
] as const

function splitCron(expression: string): string[] {
  const parts = expression.trim().split(/\s+/)
  return Array.from({ length: 5 }, (_, i) => parts[i] || "*")
}

export function CronExpressionInput({ value, onChange }: CronExpressionInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const parts = useMemo(() => splitCron(value), [value])

  const isValid = useMemo(() => {
    if (!value.trim()) return true
    return parseCronExpression(value) !== null
  }, [value])

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

    if (e.key === " " || (e.key === "ArrowRight" && input.selectionStart === input.value.length)) {
      e.preventDefault()
      inputRefs.current[index + 1]?.focus()
      inputRefs.current[index + 1]?.select()
    }

    if (e.key === "ArrowLeft" && input.selectionStart === 0) {
      e.preventDefault()
      inputRefs.current[index - 1]?.focus()
      inputRefs.current[index - 1]?.select()
    }

    if (e.key === "Backspace" && input.value === "" && index > 0) {
      e.preventDefault()
      inputRefs.current[index - 1]?.focus()
      inputRefs.current[index - 1]?.select()
    }
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {FIELDS.map((field, i) => (
          <div key={field.key} className="flex-1 min-w-0 space-y-1">
            <label
              htmlFor={`cron-${field.key}`}
              className="block text-[10px] font-medium text-black/40 dark:text-white/40 text-center"
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
              className={`w-full h-9 px-1 rounded-lg text-xs font-mono text-center bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/20 dark:placeholder:text-white/20 border-0 transition-all focus:outline-none focus:ring-1 ${
                !value.trim() || isValid
                  ? "focus:ring-black/[0.12] dark:focus:ring-white/[0.12]"
                  : "ring-1 ring-red-300/50 dark:ring-red-700/50 focus:ring-red-300 dark:focus:ring-red-700"
              }`}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-black/30 dark:text-white/30 text-center">
        <span className="font-mono">*</span> every &middot; <span className="font-mono">*/5</span> every 5th &middot;{" "}
        <span className="font-mono">1-5</span> ranges
      </p>
    </div>
  )
}
