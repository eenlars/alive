/**
 * Add Website Modal
 *
 * Interactive form for creating a new website deployment.
 * Reuses the WebsiteConfig component from the MCP tool.
 *
 * Parameters match the MCP tool `ask_website_config`:
 * - slug: subdomain name (e.g., "my-bakery" -> my-bakery.sonno.tech)
 * - templateId: which template to use
 * - siteIdeas: optional description
 */

"use client"

import { X } from "lucide-react"
import { useState } from "react"
import { TEMPLATES } from "@webalive/shared"
import { useDomainConfig } from "@/lib/providers/DomainConfigProvider"
import { WebsiteConfig, type WebsiteConfigResult } from "@/components/ai/WebsiteConfig"

interface AddWebsiteModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function AddWebsiteModal({ onClose, onSuccess }: AddWebsiteModalProps) {
  const { wildcard } = useDomainConfig()
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<{ domain: string } | null>(null)

  const handleComplete = async (result: WebsiteConfigResult) => {
    setError("")
    setDeploying(true)

    try {
      const domain = `${result.slug}.${wildcard}`

      const response = await fetch("/api/deploy-subdomain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          templateId: result.templateId,
          siteIdeas: result.siteIdeas,
        }),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        setError(data.error || "Failed to create website")
        setDeploying(false)
        return
      }

      setSuccess({ domain })
      // Call onSuccess after a short delay so user sees the success state
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1500)
    } catch {
      setError("Failed to create website. Please try again.")
      setDeploying(false)
    }
  }

  const handleSkip = () => {
    onClose()
  }

  // Show success state
  if (success) {
    return (
      <div
        className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 max-w-xl w-full shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
          role="document"
        >
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-emerald-600 dark:text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-black dark:text-white mb-2">Website Created!</h3>
            <p className="text-sm text-black/60 dark:text-white/60">
              Your site is live at{" "}
              <a
                href={`https://${success.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {success.domain}
              </a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show deploying state
  if (deploying) {
    return (
      <div
        className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 max-w-xl w-full shadow-xl"
          onClick={e => e.stopPropagation()}
          role="document"
        >
          <div className="text-center py-8">
            <div className="w-12 h-12 border-2 border-black/20 dark:border-white/20 border-t-black dark:border-t-white rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-medium text-black dark:text-white mb-2">Creating your website...</h3>
            <p className="text-sm text-black/60 dark:text-white/60">This may take a few seconds</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-website-title"
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-2xl max-w-xl w-full shadow-xl animate-in fade-in-0 zoom-in-95 duration-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h3 id="add-website-title" className="text-base font-medium text-black dark:text-white">
            Create New Website
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X size={18} className="text-black/60 dark:text-white/60" />
          </button>
        </div>

        {/* Content - reuse WebsiteConfig component */}
        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <WebsiteConfig
            data={{
              templates: TEMPLATES as Array<{
                id: string
                name: string
                description: string
                icon: "blank" | "gallery" | "event" | "saas" | "business"
              }>,
            }}
            onComplete={handleComplete}
            onSkip={handleSkip}
          />
        </div>
      </div>
    </div>
  )
}
