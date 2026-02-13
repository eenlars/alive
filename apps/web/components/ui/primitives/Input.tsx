"use client"

import { motion } from "framer-motion"
import type { ComponentPropsWithoutRef } from "react"
import { forwardRef } from "react"
import { fieldVariants } from "@/lib/animations"

export type InputState = "error" | "success" | "loading" | "default"

interface InputProps extends Omit<ComponentPropsWithoutRef<"input">, "className"> {
  label?: string
  helperText?: string
  errorMessage?: string
  successMessage?: string
  state?: InputState
  suffix?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, errorMessage, successMessage, state = "default", suffix, ...props }, ref) => {
    const getInputClasses = () => {
      const base =
        "w-full px-4 py-3 rounded-lg border transition-all outline-none font-normal disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-black/40 dark:placeholder:text-white/40"

      switch (state) {
        case "error":
          return `${base} border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-950/20 text-black dark:text-white focus:ring-2 focus:ring-red-500/20`
        case "success":
          return `${base} border-green-500 dark:border-green-500 bg-green-50 dark:bg-green-950/20 text-black dark:text-white focus:ring-2 focus:ring-green-500/20`
        case "loading":
          return `${base} border-black/20 dark:border-white/20 bg-white dark:bg-zinc-900 text-black dark:text-white`
        default:
          return `${base} border-black/20 dark:border-white/20 bg-white dark:bg-zinc-900 text-black dark:text-white hover:border-black/40 dark:hover:border-white/40 focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10`
      }
    }

    return (
      <motion.div variants={fieldVariants}>
        {label && (
          <label htmlFor={props.id} className="block text-sm font-medium text-black dark:text-white mb-2">
            {label}
          </label>
        )}

        {helperText && <p className="text-xs text-black/60 dark:text-white/60 mb-3">{helperText}</p>}

        <motion.div className="relative">
          <input ref={ref} className={getInputClasses()} {...props} />

          {suffix && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              {suffix}
            </motion.div>
          )}
        </motion.div>

        {state === "error" && errorMessage && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1.5 text-red-600 dark:text-red-400 text-xs font-medium"
          >
            {errorMessage}
          </motion.p>
        )}

        {state === "success" && successMessage && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1.5 text-green-600 dark:text-green-400 text-xs font-medium"
          >
            ✓ {successMessage}
          </motion.p>
        )}

        {state === "loading" && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1.5 text-black/60 dark:text-white/60 text-xs font-medium"
          >
            Checking...
          </motion.p>
        )}
      </motion.div>
    )
  },
)

Input.displayName = "Input"
