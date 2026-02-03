"use client"

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

interface ModeOptionProps {
  icon: LucideIcon
  title: string
  description: string
  time: string
  onClick: () => void
  badge?: string
  disabled?: boolean
  testId?: string
}

export function ModeOption({
  icon: Icon,
  title,
  description,
  time,
  onClick,
  badge,
  disabled = false,
  testId,
}: ModeOptionProps) {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.01 } : {}}
      whileTap={!disabled ? { scale: 0.99 } : {}}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`w-full p-6 rounded-2xl border transition-all text-left group relative ${
        disabled
          ? "border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 cursor-not-allowed opacity-60"
          : badge
            ? "border-black/20 dark:border-white/20 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/5 hover:border-black/30 dark:hover:border-white/30"
            : "border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      }`}
    >
      {badge && (
        <div className="absolute -top-2.5 left-4 px-3 py-1 bg-black dark:bg-white text-white dark:text-black text-sm font-bold rounded-full shadow-sm">
          {badge}
        </div>
      )}
      <div className="flex items-start gap-4">
        <div
          className={`p-2.5 rounded-lg transition-colors ${
            disabled
              ? "bg-black/5 dark:bg-white/5"
              : badge
                ? "bg-black/10 dark:bg-white/10 group-hover:bg-black/15 dark:group-hover:bg-white/15"
                : "bg-black/5 dark:bg-white/5 group-hover:bg-black/10 dark:group-hover:bg-white/10"
          }`}
        >
          <Icon
            className={`h-5 w-5 ${disabled ? "text-black/40 dark:text-white/40" : "text-black/70 dark:text-white/70"}`}
          />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-black dark:text-white text-lg mb-2">{title}</h3>
          <p className="text-black/70 dark:text-white/70 text-base font-medium leading-relaxed">{description}</p>
        </div>
        {time && (
          <div className="text-right flex flex-col gap-1">
            <div className="text-sm text-black/50 dark:text-white/50 font-semibold">{time}</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Free</div>
          </div>
        )}
      </div>
    </motion.button>
  )
}
