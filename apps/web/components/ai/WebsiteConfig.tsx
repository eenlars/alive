/**
 * Website Configuration Component
 *
 * Interactive form for configuring a new website deployment.
 * Allows users to set slug, choose template, and optionally describe site ideas.
 *
 * Best practices applied (per MCP Apps & UX research):
 * - Inline validation on blur (not on keystroke) to avoid frustration
 * - Clear, actionable error messages close to the field
 * - Progress indicator showing current position
 * - Keyboard navigation (Enter to proceed)
 * - Data preserved when navigating back
 * - Max 5 fields per step to prevent overwhelm
 * - Double-click on template advances automatically
 */

"use client"

import { Briefcase, Calendar, Check, ChevronRight, Globe, Image, Rocket, Sparkles } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

export interface TemplateOption {
  id: string
  name: string
  description: string
  icon: "blank" | "gallery" | "event" | "saas" | "business"
}

export interface WebsiteConfigData {
  templates: TemplateOption[]
  defaultSlug?: string
  context?: string
}

export interface WebsiteConfigResult {
  slug: string
  templateId: string
  siteIdeas: string
}

interface WebsiteConfigProps {
  data: WebsiteConfigData
  onComplete: (result: WebsiteConfigResult) => void
  onSkip?: () => void
}

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  blank: Sparkles,
  gallery: Image,
  event: Calendar,
  saas: Rocket,
  business: Briefcase,
}

function getTemplateIcon(icon: string) {
  return TEMPLATE_ICONS[icon] || Globe
}

export function WebsiteConfig({ data, onComplete, onSkip }: WebsiteConfigProps) {
  const [step, setStep] = useState<"slug" | "template" | "ideas" | "confirm">("slug")
  const [slug, setSlug] = useState(data.defaultSlug || "")
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [siteIdeas, setSiteIdeas] = useState("")
  const [slugError, setSlugError] = useState<string | null>(null)
  const [slugTouched, setSlugTouched] = useState(false) // Track if field was touched for blur validation

  const slugInputRef = useRef<HTMLInputElement>(null)
  const ideasInputRef = useRef<HTMLTextAreaElement>(null)

  // Focus slug input on mount
  useEffect(() => {
    slugInputRef.current?.focus()
  }, [])

  // Focus ideas input when step changes
  useEffect(() => {
    if (step === "ideas") {
      ideasInputRef.current?.focus()
    }
  }, [step])

  const validateSlug = useCallback((value: string): string | null => {
    if (value.length === 0) return null // Don't show error for empty (will be caught on submit)
    if (value.length < 3) return "Need at least 3 characters"
    if (value.length > 20) return "Maximum 20 characters"
    if (!/^[a-z0-9]/.test(value)) return "Start with a letter or number"
    if (!/[a-z0-9]$/.test(value)) return "End with a letter or number"
    if (/--/.test(value)) return "No consecutive hyphens allowed"
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) && value.length > 2) {
      return "Only lowercase letters, numbers, and hyphens"
    }
    return null
  }, [])

  // Update slug without validating on every keystroke (per UX best practice)
  const handleSlugChange = useCallback(
    (value: string) => {
      const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "")
      setSlug(cleaned)
      // Only show error if previously validated (blur occurred)
      if (slugTouched && cleaned.length >= 3) {
        setSlugError(validateSlug(cleaned))
      } else if (cleaned.length >= 3 && !validateSlug(cleaned)) {
        // Show success indicator even before blur if valid
        setSlugError(null)
      }
    },
    [slugTouched, validateSlug],
  )

  // Validate on blur (per UX best practice - don't interrupt user while typing)
  const handleSlugBlur = useCallback(() => {
    setSlugTouched(true)
    if (slug.length > 0) {
      setSlugError(validateSlug(slug))
    }
  }, [slug, validateSlug])

  const handleNext = useCallback(() => {
    if (step === "slug") {
      setSlugTouched(true)
      const error = validateSlug(slug)
      if (error || slug.length === 0) {
        setSlugError(error || "Please enter a name for your website")
        slugInputRef.current?.focus()
        return
      }
      setStep("template")
    } else if (step === "template") {
      if (!selectedTemplate) return
      setStep("ideas")
    } else if (step === "ideas") {
      setStep("confirm")
    }
  }, [step, slug, selectedTemplate, validateSlug])

  // Double-click on template to select and advance (UX convenience)
  const handleTemplateDoubleClick = useCallback((templateId: string) => {
    setSelectedTemplate(templateId)
    // Small delay so user sees the selection before advancing
    setTimeout(() => setStep("ideas"), 150)
  }, [])

  const handleBack = useCallback(() => {
    if (step === "template") setStep("slug")
    else if (step === "ideas") setStep("template")
    else if (step === "confirm") setStep("ideas")
  }, [step])

  const handleSubmit = useCallback(() => {
    if (!selectedTemplate) return
    onComplete({
      slug,
      templateId: selectedTemplate,
      siteIdeas,
    })
  }, [slug, selectedTemplate, siteIdeas, onComplete])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (step === "confirm") {
          handleSubmit()
        } else {
          handleNext()
        }
      }
    },
    [step, handleNext, handleSubmit],
  )

  // Step indicator
  const steps = ["slug", "template", "ideas", "confirm"] as const
  const currentStepIndex = steps.indexOf(step)

  const selectedTemplateData = data.templates.find(t => t.id === selectedTemplate)

  // Step labels for header
  const stepLabels: Record<typeof step, string> = {
    slug: "Choose name",
    template: "Select template",
    ideas: "Describe your site",
    confirm: "Confirm & create",
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl">
      {/* Header with step indicator */}
      <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-900 px-3 py-3 gap-1">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-zinc-500 dark:text-zinc-400" />
          <span className="min-w-0 pl-1 font-normal text-zinc-900 dark:text-zinc-100 text-sm">New Website</span>
          <ChevronRight size={14} className="text-zinc-400 dark:text-zinc-500" />
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{stepLabels[step]}</span>
        </div>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {currentStepIndex + 1}/{steps.length}
        </span>
      </div>

      {/* Content */}
      <div className="flex h-full w-full flex-col border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex-1 overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
          {/* Step: Slug */}
          {step === "slug" && (
            <div className="h-full duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 outline-none">
                {data.context && <p className="text-sm text-zinc-500 dark:text-zinc-400">{data.context}</p>}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="slug-input" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Choose a name for your website
                  </label>
                  <div className="flex items-center gap-0">
                    <input
                      ref={slugInputRef}
                      id="slug-input"
                      type="text"
                      value={slug}
                      onChange={e => handleSlugChange(e.target.value)}
                      onBlur={handleSlugBlur}
                      onKeyDown={handleKeyDown}
                      placeholder="my-site"
                      aria-invalid={!!slugError}
                      aria-describedby={
                        slugError ? "slug-error" : slug.length >= 3 && !slugError ? "slug-success" : undefined
                      }
                      className={`flex w-full rounded-l-lg border border-r-0 bg-transparent px-3 py-2 text-sm transition-colors duration-150 ease-in-out placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:outline-none text-zinc-900 dark:text-zinc-100 ${
                        slugError
                          ? "border-red-300 dark:border-red-700 focus-visible:border-red-400 dark:focus-visible:border-red-600"
                          : slug.length >= 3 && !validateSlug(slug)
                            ? "border-emerald-300 dark:border-emerald-700 focus-visible:border-emerald-400 dark:focus-visible:border-emerald-600"
                            : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 focus-visible:border-zinc-400 dark:focus-visible:border-zinc-500"
                      }`}
                      maxLength={20}
                    />
                    <span
                      className={`flex items-center rounded-r-lg border bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 ${
                        slugError
                          ? "border-red-300 dark:border-red-700"
                          : slug.length >= 3 && !validateSlug(slug)
                            ? "border-emerald-300 dark:border-emerald-700"
                            : "border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      .alive.best
                    </span>
                  </div>
                  {slugError && (
                    <p
                      id="slug-error"
                      className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1"
                      role="alert"
                    >
                      {slugError}
                    </p>
                  )}
                  {!slugError && slug.length >= 3 && !validateSlug(slug) && (
                    <p
                      id="slug-success"
                      className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                    >
                      <Check size={12} />
                      https://{slug}.alive.best
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step: Template */}
          {step === "template" && (
            <div className="h-full duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="flex h-full flex-col gap-2 overflow-y-auto p-3 outline-none">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 px-1">Choose a template</p>
                <div className="flex flex-col gap-0.5">
                  {data.templates.map(template => {
                    const isSelected = selectedTemplate === template.id
                    const Icon = getTemplateIcon(template.icon)
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedTemplate(template.id)}
                        onDoubleClick={() => handleTemplateDoubleClick(template.id)}
                        className={`group flex cursor-pointer items-start gap-2.5 rounded-lg py-2 px-2 transition-colors text-left ${
                          isSelected ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        }`}
                      >
                        <div className="flex h-5 items-center">
                          <div
                            className={`size-2.5 border rounded-full transition-colors ${
                              isSelected
                                ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100"
                                : "border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-950"
                            }`}
                          />
                        </div>
                        <div className="flex items-start gap-2 flex-1">
                          <Icon
                            size={16}
                            className={`mt-0.5 flex-shrink-0 ${
                              isSelected ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-500"
                            }`}
                          />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <p className="text-sm font-medium leading-5 text-zinc-900 dark:text-zinc-100">
                              {template.name}
                            </p>
                            <p className="text-sm leading-5 text-zinc-500 dark:text-zinc-400">{template.description}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step: Site Ideas */}
          {step === "ideas" && (
            <div className="h-full duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 outline-none">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ideas-input" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    What's your website about? <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <textarea
                    ref={ideasInputRef}
                    id="ideas-input"
                    value={siteIdeas}
                    onChange={e => setSiteIdeas(e.target.value)}
                    placeholder="A bakery website with menu, location, and contact info..."
                    rows={3}
                    className="flex w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm transition-colors duration-150 ease-in-out placeholder:text-zinc-400 dark:placeholder:text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-600 focus-visible:border-zinc-400 dark:focus-visible:border-zinc-500 focus-visible:outline-none text-zinc-900 dark:text-zinc-100 resize-none"
                  />
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    This helps us customize the initial design and content.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step: Confirm */}
          {step === "confirm" && (
            <div className="h-full duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 outline-none">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Ready to create your website:</p>
                <div className="space-y-2">
                  <div className="flex flex-col gap-0.5 px-2 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                      Domain
                    </p>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">https://{slug}.alive.best</p>
                  </div>
                  <div className="flex flex-col gap-0.5 px-2 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                      Template
                    </p>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedTemplateData?.name || selectedTemplate}
                    </p>
                  </div>
                  {siteIdeas && (
                    <div className="flex flex-col gap-0.5 px-2 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                        Description
                      </p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">{siteIdeas}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex h-12 items-center justify-between px-3 py-2">
          {/* Left Button */}
          {step === "slug" ? (
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md gap-1.5 h-7 px-4 py-2 text-zinc-700 dark:text-zinc-300"
            >
              Skip
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md gap-1.5 h-7 px-4 py-2 text-zinc-700 dark:text-zinc-300"
            >
              Back
            </button>
          )}

          {/* Progress Indicator - shows current position and completed steps */}
          <div
            className="flex items-center gap-1"
            role="progressbar"
            aria-valuenow={currentStepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
          >
            {steps.map((s, index) => {
              const isActive = currentStepIndex === index
              const isCompleted = index < currentStepIndex
              return (
                <div
                  key={s}
                  className={`flex items-center justify-center rounded-full transition-all ${
                    isActive ? "h-4 w-7" : "size-4"
                  }`}
                  title={`Step ${index + 1}${isActive ? " (current)" : isCompleted ? " (completed)" : ""}`}
                >
                  <div
                    className={`rounded-full transition-all ${
                      isActive
                        ? "h-2 w-5 bg-zinc-900 dark:bg-zinc-100"
                        : isCompleted
                          ? "size-2 bg-emerald-500 dark:bg-emerald-400"
                          : "size-2 bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  />
                </div>
              )
            })}
          </div>

          {/* Right Button */}
          {step === "confirm" ? (
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-md gap-1.5 h-7 px-4 py-2"
            >
              Create
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={
                (step === "slug" && (slug.length < 3 || !!slugError)) || (step === "template" && !selectedTemplate)
              }
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-md gap-1.5 h-7 px-4 py-2 text-zinc-700 dark:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
