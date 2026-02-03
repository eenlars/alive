"use client"

import { motion } from "framer-motion"
import type { FieldErrors, UseFormRegister } from "react-hook-form"
import { fieldVariants } from "@/lib/animations"
import type { DeploySubdomainForm } from "../types/deploy-subdomain"

interface SiteIdeasTextareaProps {
  register: UseFormRegister<DeploySubdomainForm>
  errors: FieldErrors<DeploySubdomainForm>
  watchIdeas: string
  isDeploying: boolean
}

export function SiteIdeasTextarea({ register, errors, watchIdeas, isDeploying }: SiteIdeasTextareaProps) {
  const charCount = watchIdeas?.length || 0
  const isLengthValid = charCount >= 10 && charCount <= 5000

  return (
    <motion.div variants={fieldVariants}>
      <label htmlFor="siteIdeas" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
        What do you want to build?
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Describe your website ideas. Claude will use this to get started.
      </p>

      <motion.div className="relative">
        <motion.textarea
          whileFocus="focus"
          variants={fieldVariants}
          {...register("siteIdeas")}
          disabled={isDeploying}
          placeholder="e.g., Build a dark-themed portfolio website with a smooth scroll animation and a contact form..."
          rows={4}
          data-1p-ignore
          data-lpignore
          className={`w-full px-4 py-3 rounded-lg border-2 transition-colors outline-none font-medium resize-none ${
            errors.siteIdeas
              ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-gray-900 dark:text-white"
              : isLengthValid
                ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-gray-900 dark:text-white"
                : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:bg-blue-50 dark:focus:bg-blue-950/30"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-3 right-4 text-xs text-gray-500 dark:text-gray-400"
        >
          <span
            className={
              charCount < 10
                ? "text-orange-600 dark:text-orange-400"
                : charCount > 5000
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
            }
          >
            {charCount}
          </span>
          <span className="text-gray-400 dark:text-gray-500"> / 5000</span>
        </motion.div>
      </motion.div>

      {errors.siteIdeas && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-red-600 dark:text-red-400 text-xs font-medium"
        >
          {errors.siteIdeas.message}
        </motion.p>
      )}

      {charCount > 0 && charCount < 10 && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-orange-600 dark:text-orange-400 text-xs font-medium"
        >
          Need at least 10 characters
        </motion.p>
      )}

      {charCount > 5000 && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-red-600 dark:text-red-400 text-xs font-medium"
        >
          Maximum 5000 characters
        </motion.p>
      )}
    </motion.div>
  )
}
