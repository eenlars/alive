"use client"

import { motion } from "framer-motion"
import { AlertCircle, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { QUERY_KEYS } from "@/lib/url/queryState"

type StatusType = "success" | "error" | "loading"

import type { SiteLimitDetails } from "@/features/deployment/types/deploy-subdomain"

interface DeploymentStatusProps {
  status: StatusType | null
  domain?: string | null
  error?: string | null
  errorCode?: string | null
  errorDetails?: string[] | null
  details?: SiteLimitDetails | string | null
  chatUrl?: string | null
}

function isSiteLimitDetails(details: SiteLimitDetails | string | null | undefined): details is SiteLimitDetails {
  return typeof details === "object" && details !== null
}

export function DeploymentStatus({ status, domain, error, errorCode, errorDetails, details }: DeploymentStatusProps) {
  const [countdown, setCountdown] = useState(30)
  const [_copied, setCopied] = useState(false)

  // Countdown timer for loading state
  useEffect(() => {
    if (status === "loading") {
      setCountdown(30) // Reset to 30 when loading starts
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [status])

  if (!status) return null

  if (status === "success") {
    const copyLink = () => {
      navigator.clipboard.writeText(`https://${domain}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        data-testid="deployment-status-success"
        className="w-full max-w-2xl mx-auto px-6 py-12"
      >
        {/* Success Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 mb-4">
            <svg
              className="w-8 h-8 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-medium text-black dark:text-white mb-2">Your website is ready!</h1>
          <p className="text-base text-black/60 dark:text-white/60">Let's get you started in two simple steps</p>
        </motion.div>

        {/* Step 1: Website is Live */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex items-start gap-4 mb-6">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center text-sm font-medium">
              1
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-medium text-black dark:text-white mb-2">Your website is live</h2>
              <p className="text-base text-black/60 dark:text-white/60 mb-4">
                Your website is already online and accessible to anyone on the internet
              </p>

              {/* Domain Display */}
              <div className="bg-black/[0.02] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <svg
                      className="w-5 h-5 text-black/40 dark:text-white/40 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                      />
                    </svg>
                    <code className="text-sm font-mono text-black dark:text-white truncate">{domain}</code>
                  </div>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white border border-black/10 dark:border-white/10 rounded-md hover:bg-black/[0.02] dark:hover:bg-white/5 transition-colors"
                  >
                    {_copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* View Website Button */}
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 bg-white dark:bg-zinc-800 text-black dark:text-white text-sm font-medium border border-black/20 dark:border-white/20 rounded-lg hover:bg-black/[0.02] dark:hover:bg-zinc-700 transition-all duration-200 active:scale-[0.98]"
              >
                <span>View Your Live Website</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </div>
        </motion.div>

        {/* Divider */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="relative mb-12"
        >
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-black/10 dark:border-white/10" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-4 text-sm text-black/40 dark:text-white/40 bg-white dark:bg-zinc-900">Next step</span>
          </div>
        </motion.div>

        {/* Step 2: Edit with AI Chat */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex items-start gap-4 mb-8">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center text-sm font-medium">
              2
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-medium text-black dark:text-white mb-2">Build your website with AI</h2>
              <p className="text-base text-black/60 dark:text-white/60 mb-6">
                Use our chat interface, just like ChatGPT, to customize your website. Tell the AI what you want to
                change, add, or remove—changes happen in real-time.
              </p>

              {/* Example Prompts */}
              <div className="space-y-3 mb-6">
                <p className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">Try saying things like:</p>
                {[
                  "Change the heading to 'Welcome to my business'",
                  "Add a contact form with email and message fields",
                  "Make the background gradient from blue to purple",
                ].map((example, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
                    className="flex items-start gap-3 p-3 bg-black/[0.02] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg"
                  >
                    <svg
                      className="w-4 h-4 text-black/40 dark:text-white/40 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                    <span className="text-sm text-black/70 dark:text-white/70">{example}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Start Building CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="flex flex-col items-center gap-4"
        >
          <a
            href={`/chat?${QUERY_KEYS.workspace}=${encodeURIComponent(domain || "")}`}
            className="inline-flex items-center justify-center gap-2 h-12 px-8 bg-black dark:bg-white text-white dark:text-black text-[15px] font-medium rounded-full hover:bg-black/90 dark:hover:bg-white/90 transition-all duration-200 ease-out active:scale-[0.98] shadow-sm"
          >
            <span>Start Building</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
          <p className="text-xs text-black/40 dark:text-white/40">You can always come back to edit your site later</p>
        </motion.div>
      </motion.div>
    )
  }

  if (status === "error") {
    // Special friendly message for site limit exceeded
    if (errorCode === "SITE_LIMIT_EXCEEDED") {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          data-testid="deployment-status-error"
          className="w-full max-w-md mx-auto px-0"
        >
          <div className="p-5 rounded-xl bg-amber-50/80 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-800/60">
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="h-5 w-5 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-amber-900 dark:text-amber-100 mb-2">You've reached your site limit</h3>
                <p className="text-amber-800 dark:text-amber-200 text-sm leading-relaxed">
                  Hey, we've seen you have {isSiteLimitDetails(details) ? details.currentCount : "a few"} websites now.
                  That's awesome!
                </p>
                <p className="text-amber-800 dark:text-amber-200 text-sm leading-relaxed mt-2">
                  If you'd like to create more, you can get an additional website for just 5 euro. Drop us a message at{" "}
                  <a href="mailto:team@example.com" className="font-medium underline hover:no-underline">
                    team@example.com
                  </a>{" "}
                  and we'll sort it out for you.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )
    }

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        data-testid="deployment-status-error"
        className="w-full max-w-md mx-auto px-0"
      >
        <div className="p-4 rounded-lg bg-red-50/50 dark:bg-red-950/50 border border-red-200/50 dark:border-red-800/50">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-red-900 dark:text-red-100 mb-2">Deployment Failed</h3>
              <p className="text-red-700 dark:text-red-300 text-sm font-normal leading-relaxed">{error}</p>
              {errorDetails && errorDetails.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-medium text-red-700 dark:text-red-300 text-sm hover:text-red-800 dark:hover:text-red-200 mt-3">
                    Error Details
                  </summary>
                  <pre className="mt-2 text-xs bg-red-100 dark:bg-red-900/50 p-2 rounded border border-red-200 dark:border-red-800 overflow-auto max-h-32 whitespace-pre-wrap break-words text-red-900 dark:text-red-100">
                    {errorDetails.join("\n")}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  // Loading state - Clean and minimal
  const stages = ["Launching", "Deploying", "Setting up your site"]
  const currentStage = countdown > 20 ? 0 : countdown > 10 ? 1 : 2
  const progress = ((30 - countdown) / 30) * 100

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md flex flex-col items-center"
    >
      {/* Circular progress indicator */}
      <div className="relative mb-12">
        {/* Background ring */}
        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-black/5 dark:text-white/5"
          />
          {/* Progress ring */}
          <motion.circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={339.292} // 2πr
            initial={{ strokeDashoffset: 339.292 }}
            animate={{ strokeDashoffset: 339.292 - (339.292 * progress) / 100 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" />
              <stop offset="100%" stopColor="rgb(147, 51, 234)" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, ease: "linear", repeat: Infinity }}>
            <Loader2 className="w-7 h-7 text-black/20 dark:text-white/20" strokeWidth={1.5} />
          </motion.div>
        </div>
      </div>

      {/* Stage label with smooth transitions */}
      <motion.div
        key={currentStage}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6"
      >
        <h3 className="text-xl font-normal text-black dark:text-white text-center">{stages[currentStage]}</h3>
      </motion.div>

      {/* Time remaining */}
      {countdown > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-2"
        >
          {/* Countdown number */}
          <motion.div
            key={countdown}
            initial={{ scale: 1.05, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-4xl font-normal text-black dark:text-white tabular-nums">{countdown}</span>
          </motion.div>

          {/* Label */}
          <p className="text-sm font-normal text-black/50 dark:text-white/50">seconds remaining</p>
        </motion.div>
      )}
    </motion.div>
  )
}
