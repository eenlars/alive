"use client"

import { useMemo, useRef, useCallback } from "react"
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
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        {FIELDS.map((field, i) => (
          <div key={field.key} className="flex-1 min-w-0">
            <label
              htmlFor={`cron-${field.key}`}
              className="block text-[10px] font-medium text-black/50 dark:text-white/50 text-center mb-1"
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
                !value.trim() || isValid
                  ? "border-black/[0.06] dark:border-white/[0.06] focus:ring-black/[0.12] dark:focus:ring-white/[0.12]"
                  : "border-red-200 dark:border-red-800 focus:ring-red-300/50 dark:focus:ring-red-700/50"
              }`}
            />
            <p className="text-[9px] text-black/30 dark:text-white/30 text-center mt-0.5">{field.hint}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-black/35 dark:text-white/35 text-center">
        Use <span className="font-mono">*</span> for "every", <span className="font-mono">*/5</span> for "every 5th",{" "}
        <span className="font-mono">1-5</span> for ranges
      </p>
    </div>
  )
}
