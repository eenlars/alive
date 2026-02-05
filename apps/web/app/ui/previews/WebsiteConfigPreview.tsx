/**
 * Website Config Preview
 *
 * Preview for WebsiteConfig component.
 * Shows the interactive website configuration form.
 */

"use client"

import { RotateCcw } from "lucide-react"
import { useState } from "react"
import { WebsiteConfig, type WebsiteConfigData, type WebsiteConfigResult } from "@/components/ai/WebsiteConfig"
import { DOMAINS, TEMPLATES } from "@webalive/shared"

const SAMPLE_DATA: WebsiteConfigData = {
  templates: [...TEMPLATES],
  context: "Let's set up your new website!",
}

export function WebsiteConfigPreview() {
  const [result, setResult] = useState<WebsiteConfigResult | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [key, setKey] = useState(0)

  const handleComplete = (completedResult: WebsiteConfigResult) => {
    setResult(completedResult)
    setSkipped(false)
  }

  const handleSkip = () => {
    setSkipped(true)
    setResult(null)
  }

  const reset = () => {
    setResult(null)
    setSkipped(false)
    setKey(k => k + 1)
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">WebsiteConfig</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Multi-step form for configuring a new website. Collects slug, template, and optional description.
        </p>
      </div>

      <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
        {/* Component Preview */}
        <div className="flex-1 md:max-w-xl">
          {result || skipped ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl">
              <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-900 px-3 py-3">
                <span className="pl-1 font-normal text-zinc-900 dark:text-zinc-100 text-sm">
                  {skipped ? "Skipped" : "Configuration Submitted"}
                </span>
              </div>
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                {skipped ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">User chose to skip configuration.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Domain
                      </p>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-0.5">
                        https://{result?.slug}.{DOMAINS.WILDCARD}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Template
                      </p>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-0.5">{result?.templateId}</p>
                    </div>
                    {result?.siteIdeas && (
                      <div>
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                          Description
                        </p>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-0.5">{result?.siteIdeas}</p>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Show Again
                </button>
              </div>
            </div>
          ) : (
            <WebsiteConfig key={key} data={SAMPLE_DATA} onComplete={handleComplete} onSkip={handleSkip} />
          )}
        </div>

        {/* Controls */}
        <div className="w-full md:w-56 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">About</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This component guides users through creating a new website with a multi-step wizard interface.
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Steps</h3>
            <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <li>1. Choose subdomain slug</li>
              <li>2. Select template</li>
              <li>3. Describe site (optional)</li>
              <li>4. Confirm & create</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={reset}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
