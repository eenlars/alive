"use client"

import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import type { FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form"
import { checkSlugAvailability } from "@/features/deployment/lib/slug-api"
import { isValidSlug } from "@/features/deployment/lib/slug-utils"
import { fieldVariants } from "@/lib/animations"
import { useDomainConfig } from "@/lib/providers/DomainConfigProvider"

// Generic interface that works with any form containing a 'slug' field
interface SlugInputProps<T extends FieldValues & { slug: string }> {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  watchSlug: string
  isDeploying: boolean
}

export function SlugInput<T extends FieldValues & { slug: string }>({
  register,
  errors,
  watchSlug,
  isDeploying,
}: SlugInputProps<T>) {
  const { wildcard } = useDomainConfig()
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const isFormatValid = watchSlug && isValidSlug(watchSlug)

  // Auto-focus on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Check availability when slug changes
  useEffect(() => {
    if (!isFormatValid) {
      setIsAvailable(null)
      return
    }

    setIsChecking(true)
    const timer = setTimeout(async () => {
      const result = await checkSlugAvailability(watchSlug)
      setIsAvailable(result.available)
      setIsChecking(false)
    }, 1000) // Debounce 1 second

    return () => clearTimeout(timer)
  }, [watchSlug, isFormatValid])

  return (
    <motion.div variants={fieldVariants}>
      <label htmlFor="slug" className="block text-base font-bold text-gray-900 dark:text-white mb-2">
        Choose your site name
      </label>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Pick your unique name.</p>
        {watchSlug && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-xs text-gray-500 dark:text-gray-400 font-semibold"
          >
            {watchSlug.length}/20
          </motion.span>
        )}
      </div>

      <motion.div className="relative">
        <motion.input
          whileFocus="focus"
          variants={fieldVariants}
          {...register("slug" as Path<T>, {
            setValueAs: value => value.toLowerCase(),
          })}
          ref={e => {
            register("slug" as Path<T>).ref(e)
            inputRef.current = e
          }}
          disabled={isDeploying}
          type="text"
          placeholder="yourname"
          autoComplete="off"
          data-1p-ignore
          data-lpignore
          data-testid="slug-input"
          className={`w-full px-4 py-3 rounded-lg border-2 transition-colors outline-none font-bold text-lg pr-32 ${
            errors.slug
              ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-gray-900 dark:text-white"
              : isAvailable === true
                ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-gray-900 dark:text-white"
                : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white hover:border-gray-300 dark:hover:border-gray-600 focus:border-purple-500 dark:focus:border-purple-400 focus:bg-purple-50 dark:focus:bg-purple-950/30"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        />

        {watchSlug && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap"
          >
            <span className="text-gray-900 dark:text-white font-bold">{watchSlug}</span>
            <span className="text-gray-500 dark:text-gray-400 font-medium">.{wildcard}</span>
          </motion.div>
        )}
      </motion.div>

      {errors.slug && (
        <motion.p
          initial={{ opacity: 0, x: 0 }}
          animate={{
            opacity: 1,
            x: [0, -10, 10, -10, 10, 0],
          }}
          transition={{ duration: 0.5 }}
          className="mt-2 text-red-600 dark:text-red-400 text-sm font-bold"
        >
          {errors.slug.message as string}
        </motion.p>
      )}

      {isFormatValid && !errors.slug && isChecking && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-gray-600 dark:text-gray-400 text-sm font-semibold flex items-center gap-2"
        >
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="inline-block w-3 h-3 border-2 border-gray-400 dark:border-gray-500 border-t-transparent rounded-full"
          />
          Checking...
        </motion.p>
      )}

      {isFormatValid && !errors.slug && !isChecking && isAvailable === true && (
        <motion.p
          initial={{ opacity: 0, y: -5, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="mt-2 text-green-600 dark:text-green-400 text-sm font-bold"
        >
          Available! It's yours!
        </motion.p>
      )}

      {isFormatValid && !errors.slug && !isChecking && isAvailable === false && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-red-600 dark:text-red-400 text-sm font-bold"
        >
          ✗ Already taken
        </motion.p>
      )}
    </motion.div>
  )
}
