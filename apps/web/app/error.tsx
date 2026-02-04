"use client"

import { motion } from "framer-motion"
import { AlertCircle, Home, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { captureException } from "@/components/providers/PostHogProvider"

// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js error boundary requires Error type
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()

  useEffect(() => {
    console.error("Root error boundary caught:", error)
    captureException(error, {
      error_source: "root_error_boundary",
      digest: error.digest,
    })
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-lg w-full"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center mb-8"
        >
          <div className="w-20 h-20 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-black/60 dark:text-white/60" />
          </div>
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl font-normal tracking-tight text-black dark:text-white mb-3">
            Something unexpected happened
          </h1>
          <p className="text-base text-black/60 dark:text-white/60 font-normal leading-relaxed">
            We've logged the issue and your data is safe. Try refreshing or head back to continue working.
          </p>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 h-12 px-6 bg-black dark:bg-white text-white dark:text-black text-[15px] font-medium rounded-lg hover:bg-black/80 dark:hover:bg-white/80 transition-all duration-200 ease-out active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center justify-center gap-2 h-12 px-6 bg-black/5 dark:bg-white/5 text-black dark:text-white text-[15px] font-medium rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-200 ease-out active:scale-[0.98]"
          >
            <Home className="w-4 h-4" />
            Go home
          </button>
        </motion.div>

        {/* Development error details */}
        {process.env.NODE_ENV === "development" && (
          <motion.details
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10"
          >
            <summary className="text-xs text-black/60 dark:text-white/60 cursor-pointer hover:text-black dark:hover:text-white font-medium">
              Error details (development only)
            </summary>
            <pre className="mt-3 text-xs bg-white dark:bg-black/20 p-3 rounded border border-black/10 dark:border-white/10 overflow-auto max-h-60 text-black dark:text-white font-mono">
              {error.message}
              {"\n\n"}
              {error.stack}
            </pre>
          </motion.details>
        )}
      </motion.div>
    </div>
  )
}
