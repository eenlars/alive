/**
 * Website Config Output
 *
 * Renders the ask_website_config tool result as an interactive form.
 * When the user submits, their configuration is sent back to Claude for deployment.
 */

"use client"

import { useCallback, useState } from "react"
import { WebsiteConfig, type WebsiteConfigData, type WebsiteConfigResult } from "@/components/ai/WebsiteConfig"
import { useDomainConfig } from "@/lib/providers/DomainConfigProvider"
import type { ToolResultRendererProps } from "@/lib/tools/tool-registry"

/**
 * Expected data format from the ask_website_config tool
 */
interface WebsiteConfigToolData {
  type: "website_config"
  templates: Array<{
    id: string
    name: string
    description: string
    icon: "blank" | "gallery" | "event" | "saas" | "business"
  }>
  defaultSlug?: string
  context?: string
}

/**
 * Type guard to validate the tool output
 */
export function validateWebsiteConfig(data: unknown): data is WebsiteConfigToolData {
  if (!data || typeof data !== "object") return false
  const d = data as Record<string, unknown>

  if (d.type !== "website_config") return false
  if (!Array.isArray(d.templates)) return false
  if (d.templates.length === 0) return false

  for (const t of d.templates) {
    if (typeof t !== "object" || !t) return false
    const template = t as Record<string, unknown>
    if (typeof template.id !== "string") return false
    if (typeof template.name !== "string") return false
    if (typeof template.description !== "string") return false
  }

  return true
}

/**
 * Format the result for submission to Claude
 */
function formatResultForSubmission(result: WebsiteConfigResult, wildcardDomain: string): string {
  const lines: string[] = ["Here's my website configuration:", ""]
  lines.push(`**Domain:** ${result.slug}.${wildcardDomain}`)
  lines.push(`**Template:** ${result.templateId}`)
  if (result.siteIdeas) {
    lines.push(`**Description:** ${result.siteIdeas}`)
  }
  lines.push("")
  lines.push("Please create this website now.")
  return lines.join("\n")
}

interface WebsiteConfigOutputProps extends ToolResultRendererProps<WebsiteConfigToolData> {
  onSubmitAnswer?: (message: string) => void
}

export function WebsiteConfigOutput({ data, onSubmitAnswer }: WebsiteConfigOutputProps) {
  const { wildcard } = useDomainConfig()
  const [submitted, setSubmitted] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [submittedResult, setSubmittedResult] = useState<WebsiteConfigResult | null>(null)

  const configData: WebsiteConfigData = {
    templates: data.templates,
    defaultSlug: data.defaultSlug,
    context: data.context,
  }

  const handleComplete = useCallback(
    (result: WebsiteConfigResult) => {
      setSubmittedResult(result)
      setSubmitted(true)

      const message = formatResultForSubmission(result, wildcard)
      onSubmitAnswer?.(message)
    },
    [onSubmitAnswer],
  )

  const handleSkip = useCallback(() => {
    setSkipped(true)
    onSubmitAnswer?.("I'd like to skip creating a website for now.")
  }, [onSubmitAnswer])

  // Show completion state
  if (submitted || skipped) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
        <p className="text-xs text-black/50 dark:text-white/50">{skipped ? "Skipped" : "Configuration submitted"}</p>
        {submittedResult && !skipped && (
          <div className="mt-2 space-y-1">
            <div className="text-xs">
              <span className="text-black/40 dark:text-white/40">Domain: </span>
              <span className="text-black/70 dark:text-white/70">
                {submittedResult.slug}.{wildcard}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-black/40 dark:text-white/40">Template: </span>
              <span className="text-black/70 dark:text-white/70">{submittedResult.templateId}</span>
            </div>
            {submittedResult.siteIdeas && (
              <div className="text-xs">
                <span className="text-black/40 dark:text-white/40">Ideas: </span>
                <span className="text-black/70 dark:text-white/70 line-clamp-1">{submittedResult.siteIdeas}</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2">
      <WebsiteConfig data={configData} onComplete={handleComplete} onSkip={handleSkip} />
    </div>
  )
}
