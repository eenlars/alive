/**
 * Automation Config Preview
 *
 * Preview for AutomationConfig component.
 * Shows the interactive automation configuration form.
 */

"use client"

import { RotateCcw } from "lucide-react"
import { useState } from "react"
import {
  AutomationConfig,
  type AutomationConfigData,
  type AutomationConfigResult,
} from "@/components/ai/AutomationConfig"

// Sample data for preview - these are fake examples
const SAMPLE_DATA: AutomationConfigData = {
  sites: [
    { id: "site-1", hostname: "my-bakery.example.com" },
    { id: "site-2", hostname: "portfolio.example.com" },
    { id: "site-3", hostname: "blog.example.com" },
  ],
  context: "Let's set up a scheduled task for your website!",
}

export function AutomationConfigPreview() {
  const [result, setResult] = useState<AutomationConfigResult | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [key, setKey] = useState(0)

  const handleComplete = (completedResult: AutomationConfigResult) => {
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

  const formatSchedule = (r: AutomationConfigResult): string => {
    switch (r.scheduleType) {
      case "once":
        return `Once on ${r.scheduleDate} at ${r.scheduleTime}`
      case "daily":
        return `Daily at ${r.scheduleTime}`
      case "weekly":
        return `Weekly at ${r.scheduleTime}`
      case "monthly":
        return `Monthly at ${r.scheduleTime}`
      case "custom":
        return `Cron: ${r.cronExpression}`
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">AutomationConfig</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Multi-step form for configuring a scheduled automation. Collects task name, prompt, website, and schedule.
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
                        Task Name
                      </p>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-0.5">{result?.name}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Website
                      </p>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-0.5">{result?.siteName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Schedule
                      </p>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-0.5">
                        {result && formatSchedule(result)}
                        {result && result.scheduleType !== "once" && ` (${result.timezone})`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Prompt
                      </p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-0.5 line-clamp-3">{result?.prompt}</p>
                    </div>
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
            <AutomationConfig key={key} data={SAMPLE_DATA} onComplete={handleComplete} onSkip={handleSkip} />
          )}
        </div>

        {/* Controls */}
        <div className="w-full md:w-56 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">About</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This component guides users through creating a scheduled automation with a multi-step wizard interface.
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Steps</h3>
            <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <li>1. Enter task name & prompt</li>
              <li>2. Select website</li>
              <li>3. Configure schedule</li>
              <li>4. Confirm & create</li>
            </ul>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Schedule Types
            </h3>
            <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <li>- Once (specific date/time)</li>
              <li>- Daily</li>
              <li>- Weekly</li>
              <li>- Monthly</li>
              <li>- Custom (cron expression)</li>
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
