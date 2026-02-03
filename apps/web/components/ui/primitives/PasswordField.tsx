"use client"

import { motion } from "framer-motion"
import { Eye, EyeOff } from "lucide-react"
import type { FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form"
import { fieldVariants } from "@/lib/animations"

interface PasswordFieldProps<T extends FieldValues> {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  watchPassword: string
  isDeploying: boolean
  showPassword: boolean
  onTogglePassword: () => void
  label?: string
  helperText?: string
  fieldName?: Path<T>
}

export function PasswordField<T extends FieldValues>({
  register,
  errors,
  watchPassword,
  isDeploying,
  showPassword,
  onTogglePassword,
  label = "Account password",
  helperText = "6–16 characters. This creates your account. If you already have an account, log in first instead.",
  fieldName = "password" as Path<T>,
}: PasswordFieldProps<T>) {
  const fieldError = errors[fieldName]
  const errorMessage =
    fieldError && typeof fieldError === "object" && "message" in fieldError ? fieldError.message : undefined

  return (
    <motion.div variants={fieldVariants}>
      <label htmlFor={String(fieldName)} className="block text-base font-bold text-black dark:text-white mb-2">
        {label}
      </label>
      <p className="text-sm text-black/60 dark:text-white/60 mb-3 font-medium">{helperText}</p>
      <div className="relative">
        <motion.input
          whileFocus="focus"
          variants={fieldVariants}
          {...register(fieldName)}
          disabled={isDeploying}
          type={showPassword ? "text" : "password"}
          autoComplete="off"
          data-1p-ignore
          data-lpignore
          data-testid="password-input"
          placeholder="••••••••"
          className={`w-full px-4 py-3 rounded-lg border transition-all outline-none font-normal pr-12 placeholder:text-black/40 dark:placeholder:text-white/40 ${
            fieldError
              ? "border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-950/20 text-black dark:text-white focus:ring-2 focus:ring-red-500/20"
              : "border-black/20 dark:border-white/20 bg-white dark:bg-zinc-900 text-black dark:text-white hover:border-black/40 dark:hover:border-white/40 focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        />
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={onTogglePassword}
          disabled={isDeploying}
          className="absolute right-3 top-3 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
        >
          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </motion.button>
      </div>
      {watchPassword && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex gap-1">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full flex-1 ${
                watchPassword.length >= (i + 1) * (16 / 3) ? "bg-black dark:bg-white" : "bg-black/20 dark:bg-white/20"
              }`}
            />
          ))}
        </motion.div>
      )}
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
