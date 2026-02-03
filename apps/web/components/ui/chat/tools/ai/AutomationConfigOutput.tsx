/**
 * Automation Config Output
 *
 * Renders the ask_automation_config tool result as an interactive form.
 * When the user submits, their configuration is sent back to Claude for creation.
 */

"use client"

import { useCallback, useState } from "react"
import {
  AutomationConfig,
  type AutomationConfigData,
  type AutomationConfigResult,
} from "@/components/ai/AutomationConfig"
import type { ToolResultRendererProps } from "@/lib/tools/tool-registry"

/**
 * Expected data format from the ask_automation_config tool
 */
interface AutomationConfigToolData {
  type: "automation_config"
  sites: Array<{
    id: string
    hostname: string
  }>
  defaultSiteId?: string
  context?: string
}

/**
 * Type guard to validate the tool output
 */
export function validateAutomationConfig(data: unknown): data is AutomationConfigToolData {
  if (!data || typeof data !== "object") return false
  const d = data as Record<string, unknown>

  if (d.type !== "automation_config") return false
  if (!Array.isArray(d.sites)) return false
  if (d.sites.length === 0) return false

  for (const s of d.sites) {
    if (typeof s !== "object" || !s) return false
    const site = s as Record<string, unknown>
    if (typeof site.id !== "string") return false
    if (typeof site.hostname !== "string") return false
  }

  return true
}

/**
 * Format the result for submission to Claude
 */
function formatResultForSubmission(result: AutomationConfigResult): string {
  const lines: string[] = ["Here's my automation configuration:", ""]
  lines.push(`**Task name:** ${result.name}`)
  lines.push(`**Website:** ${result.siteName}`)

  // Format schedule
  let scheduleDesc = ""
  switch (result.scheduleType) {
    case "once":
      scheduleDesc = `Once on ${result.scheduleDate} at ${result.scheduleTime}`
      break
    case "daily":
      scheduleDesc = `Daily at ${result.scheduleTime} (${result.timezone})`
      break
    case "weekly":
      scheduleDesc = `Weekly at ${result.scheduleTime} (${result.timezone})`
      break
    case "monthly":
      scheduleDesc = `Monthly at ${result.scheduleTime} (${result.timezone})`
      break
    case "custom":
      scheduleDesc = `Cron: ${result.cronExpression} (${result.timezone})`
      break
  }
  lines.push(`**Schedule:** ${scheduleDesc}`)
  lines.push(`**Prompt:** ${result.prompt}`)
  lines.push("")
  lines.push("Please create this automation now.")
  return lines.join("\n")
}

interface AutomationConfigOutputProps extends ToolResultRendererProps<AutomationConfigToolData> {
  onSubmitAnswer?: (message: string) => void
}

export function AutomationConfigOutput({ data, onSubmitAnswer }: AutomationConfigOutputProps) {
  const [submitted, setSubmitted] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [submittedResult, setSubmittedResult] = useState<AutomationConfigResult | null>(null)

  const configData: AutomationConfigData = {
    sites: data.sites,
    defaultSiteId: data.defaultSiteId,
    context: data.context,
  }

  const handleComplete = useCallback(
    (result: AutomationConfigResult) => {
      setSubmittedResult(result)
      setSubmitted(true)

      const message = formatResultForSubmission(result)
      onSubmitAnswer?.(message)
    },
    [onSubmitAnswer],
  )

  const handleSkip = useCallback(() => {
    setSkipped(true)
    onSubmitAnswer?.("I'd like to skip creating an automation for now.")
  }, [onSubmitAnswer])

  // Show completion state
  if (submitted || skipped) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
        <p className="text-xs text-black/50 dark:text-white/50">{skipped ? "Skipped" : "Configuration submitted"}</p>
        {submittedResult && !skipped && (
          <div className="mt-2 space-y-1">
            <div className="text-xs">
              <span className="text-black/40 dark:text-white/40">Task: </span>
              <span className="text-black/70 dark:text-white/70">{submittedResult.name}</span>
            </div>
            <div className="text-xs">
              <span className="text-black/40 dark:text-white/40">Website: </span>
              <span className="text-black/70 dark:text-white/70">{submittedResult.siteName}</span>
            </div>
            <div className="text-xs">
              <span className="text-black/40 dark:text-white/40">Schedule: </span>
              <span className="text-black/70 dark:text-white/70">
                {submittedResult.scheduleType === "once"
                  ? `${submittedResult.scheduleDate} at ${submittedResult.scheduleTime}`
                  : submittedResult.scheduleType === "custom"
                    ? submittedResult.cronExpression
                    : `${submittedResult.scheduleType} at ${submittedResult.scheduleTime}`}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2">
      <AutomationConfig data={configData} onComplete={handleComplete} onSkip={handleSkip} />
    </div>
  )
}
