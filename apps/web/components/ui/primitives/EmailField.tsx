"use client"

import { motion } from "framer-motion"
import { Mail } from "lucide-react"
import { useState } from "react"
import type { FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form"
import { fieldVariants } from "@/lib/animations"

interface EmailFieldProps<T extends FieldValues> {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  isDeploying: boolean
  fieldName?: Path<T>
  disabled?: boolean
  helperText?: string
}

export function EmailField<T extends FieldValues>({
  register,
  errors,
  isDeploying,
  fieldName = "email" as Path<T>,
  disabled = false,
  helperText = "We'll use this to help you recover your site if needed.",
}: EmailFieldProps<T>) {
  const [isFocused, setIsFocused] = useState(false)
  const fieldError = errors[fieldName]
  const errorMessage =
    fieldError && typeof fieldError === "object" && "message" in fieldError ? fieldError.message : undefined

  const { ref, ...rest } = register(fieldName)
  const isDisabled = isDeploying || disabled

  return (
    <motion.div variants={fieldVariants}>
      <label htmlFor={String(fieldName)} className="block text-base font-bold text-black dark:text-white mb-2">
        Email address
      </label>
      <p className="text-sm text-black/60 dark:text-white/60 mb-3 font-medium">{helperText}</p>
      <div className="relative">
        <motion.input
          whileFocus="focus"
          variants={fieldVariants}
          {...rest}
          ref={ref}
          onFocus={() => {
            setIsFocused(true)
          }}
          onBlur={e => {
            setIsFocused(false)
            rest.onBlur(e)
          }}
          disabled={isDisabled}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          data-testid="email-input"
          className={`w-full px-4 py-3 rounded-lg border transition-all outline-none font-normal pl-11 placeholder:text-black/40 dark:placeholder:text-white/40 ${
            fieldError
              ? "border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-950/20 text-black dark:text-white focus:ring-2 focus:ring-red-500/20"
              : isDisabled
                ? "border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50 cursor-not-allowed"
                : "border-black/20 dark:border-white/20 bg-white dark:bg-zinc-900 text-black dark:text-white hover:border-black/40 dark:hover:border-white/40 focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        />
        <motion.div
          className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40"
          animate={{ scale: isFocused ? 1.01 : 1 }}
          transition={{ duration: 0.2 }}
        >
          <Mail className="h-5 w-5" />
        </motion.div>
      </div>
      {errorMessage && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-red-600 dark:text-red-400 text-sm font-bold"
        >
          {String(errorMessage)}
        </motion.p>
      )}
    </motion.div>
  )
}
