"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import type { AppDatabase } from "@webalive/database"
import { motion } from "framer-motion"
import { LogIn } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useAuth } from "@/features/deployment/hooks/useAuth"
import { checkSlugAvailability } from "@/features/deployment/lib/slug-api"
import type { DeploySubdomainResponse } from "@/features/deployment/types/deploy-subdomain"
import { useDomainConfig } from "@/lib/providers/DomainConfigProvider"
import { useAuthModalActions } from "@/lib/stores/authModalStore"
import { useOnboardingStore } from "@/lib/stores/onboardingStore"
import { DeploymentStatus } from "./DeploymentStatus"
import { SlugInput } from "./SlugInput"
import { SubmitButton } from "./SubmitButton"

type Template = AppDatabase["app"]["Tables"]["templates"]["Row"]

// Simplified schema - authentication is handled separately via AuthModal
const deploySubdomainSchema = z.object({
  slug: z
    .string()
    .min(3, "Must be at least 3 characters")
    .max(20, "Must be 20 characters or less")
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and dashes"),
  siteIdeas: z.string().optional().default(""),
})

type DeploySubdomainForm = z.infer<typeof deploySubdomainSchema>

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export function SubdomainDeployForm() {
  const { wildcard } = useDomainConfig()
  const searchParams = useSearchParams()
  const [isDeploying, setIsDeploying] = useState(false)
  const [deploymentStatus, setDeploymentStatus] = useState<DeploySubdomainResponse | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  // Onboarding store - need early access for initial state
  const onboardingState = useOnboardingStore()

  // Skip template selection if user already picked one (persisted in store)
  const [showIdeaConfirmation, setShowIdeaConfirmation] = useState(() => !onboardingState.templateId)
  const [pendingSubmit, setPendingSubmit] = useState<DeploySubdomainForm | null>(null)
  const [iframeLoading, setIframeLoading] = useState(false)
  const [loadingDots, setLoadingDots] = useState("")
  const [templates, setTemplates] = useState<Template[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const isDev = process.env.NODE_ENV === "development"

  // Authentication state
  const { user, loading: authLoading, isAuthenticated, refetch: refetchAuth } = useAuth()

  // Auth modal
  const { open: openAuthModal } = useAuthModalActions()

  // Get values and actions from the store (store accessed early for initial state)
  const { siteIdea, templateId, setSiteIdea, setTemplateId } = onboardingState

  // Extract the 'q' search parameter for site ideas
  const siteIdeasFromUrl = searchParams.get("q") || ""

  // Fetch templates from API
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/templates")
        const data = await res.json()
        if (data.templates) {
          setTemplates(data.templates)
        }
      } catch (error) {
        console.error("Failed to fetch templates:", error)
      } finally {
        setTemplatesLoading(false)
      }
    }
    fetchTemplates()
  }, [])

  // Initialize from URL param if present
  useEffect(() => {
    if (siteIdeasFromUrl && !siteIdea) {
      setSiteIdea(siteIdeasFromUrl)
    }
  }, [siteIdeasFromUrl, siteIdea, setSiteIdea])

  // Skip template selection if store rehydrates with a selected template
  useEffect(() => {
    if (templateId && showIdeaConfirmation) {
      setShowIdeaConfirmation(false)
    }
  }, [templateId, showIdeaConfirmation])

  // Sync URL with current state (preserve existing params like 'mode')
  useEffect(() => {
    if (showIdeaConfirmation && (siteIdea || templateId)) {
      const params = new URLSearchParams(window.location.search)
      if (siteIdea) params.set("q", siteIdea)
      if (templateId) params.set("template", templateId)

      const newSearch = params.toString()
      const newUrl = newSearch ? `/deploy?${newSearch}` : "/deploy"
      if (window.location.search !== `?${newSearch}`) {
        window.history.replaceState({}, "", newUrl)
      }
    }
  }, [siteIdea, templateId, showIdeaConfirmation])

  // Loading dots animation (. .. ...)
  useEffect(() => {
    if (!iframeLoading) return
    const interval = setInterval(() => {
      setLoadingDots(prev => (prev.length >= 3 ? "" : `${prev}.`))
    }, 400)
    return () => clearInterval(interval)
  }, [iframeLoading])

  // Trigger loading when template changes
  useEffect(() => {
    const template = templates.find(t => t.template_id === templateId)
    if (template?.preview_url) {
      setIframeLoading(true)
    }
  }, [templateId, templates])

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid, touchedFields },
  } = useForm<DeploySubdomainForm>({
    resolver: async (data, context, options) => {
      // Only validate if user has interacted with form, otherwise return no errors
      const hasInteracted = Object.keys(touchedFields).length > 0 || data.slug

      if (!hasInteracted) {
        return { values: data, errors: {} }
      }

      return zodResolver(deploySubdomainSchema)(data, context, options)
    },
    mode: "onChange",
    defaultValues: {
      slug: "",
      siteIdeas: siteIdeasFromUrl,
    },
  })

  const watchSlug = watch("slug")

  const simulateSuccess = () => {
    setDeploymentStatus({
      ok: true,
      domain: `${watchSlug || "test"}.${wildcard}`,
      message: "Site deployed successfully",
    })
  }

  // Elapsed time + domain polling during deployment
  useEffect(() => {
    if (isDeploying && watchSlug) {
      setElapsedTime(0)
      const domain = `${watchSlug}.${wildcard}`
      let cancelled = false

      // Track elapsed time (sync callback, setInterval is fine here)
      const timeInterval = setInterval(() => {
        setElapsedTime(prev => prev + 1)
      }, 1000)

      // Sequential polling loop - awaits each fetch before starting next
      // This prevents race conditions when fetch takes longer than poll interval
      const pollDomain = async () => {
        while (!cancelled) {
          try {
            const response = await fetch(`https://${domain}`, {
              method: "GET",
              cache: "no-store",
            })

            if (response.ok && !cancelled) {
              clearInterval(timeInterval)
              setDeploymentStatus({
                ok: true,
                domain,
                message: "Site deployed successfully",
              })
              setIsDeploying(false)
              return // Exit loop on success
            }
          } catch (_error) {
            // Domain not ready yet, continue polling
          }

          // Wait before next attempt (only if not cancelled)
          if (!cancelled) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
      }

      pollDomain()

      return () => {
        cancelled = true
        clearInterval(timeInterval)
      }
    }
  }, [isDeploying, watchSlug])

  // Actual deployment function (called after auth is confirmed)
  const performDeployment = useCallback(
    async (data: DeploySubdomainForm) => {
      setIsDeploying(true)
      setDeploymentStatus(null)

      try {
        // Final availability check before deployment
        const availCheck = await checkSlugAvailability(data.slug)

        if (availCheck.error || availCheck.available === null) {
          setDeploymentStatus({
            ok: false,
            message: availCheck.error || "Failed to check availability",
            error: "AVAILABILITY_CHECK_FAILED",
          })
          setIsDeploying(false)
          return
        }

        if (!availCheck.available) {
          setDeploymentStatus({
            ok: false,
            message: "This subdomain is no longer available",
            error: "SLUG_TAKEN",
          })
          setIsDeploying(false)
          return
        }

        // Authenticated deployment - email comes from session
        const response = await fetch("/api/deploy-subdomain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            slug: data.slug.toLowerCase(),
            siteIdeas: siteIdea || data.siteIdeas,
            templateId: templateId || "blank",
          }),
        })

        const responseText = await response.text()
        const contentType = response.headers.get("content-type")

        if (!contentType || !contentType.includes("application/json")) {
          throw new Error(`Server error (${response.status}): ${responseText.substring(0, 200)}`)
        }

        const result: DeploySubdomainResponse = JSON.parse(responseText)
        setDeploymentStatus(result)
      } catch (error) {
        setDeploymentStatus({
          ok: false,
          message: "Failed to connect to deployment API",
          error: error instanceof Error ? error.message : "Unknown error",
        })
      } finally {
        setIsDeploying(false)
        setPendingSubmit(null)
      }
    },
    [siteIdea, templateId],
  )

  // Handle pending submit after auth success
  useEffect(() => {
    // Only trigger if we have pending data, user is authenticated, and not already deploying
    if (pendingSubmit && isAuthenticated && !authLoading && !isDeploying) {
      performDeployment(pendingSubmit)
    }
  }, [pendingSubmit, isAuthenticated, authLoading, isDeploying, performDeployment])

  const onSubmit = async (data: DeploySubdomainForm) => {
    // If not authenticated, open auth modal and save form data for later
    if (!isAuthenticated) {
      setPendingSubmit(data)
      openAuthModal({
        title: "Sign in to deploy",
        description: "Create an account or sign in to launch your site",
        onSuccess: () => {
          // Explicitly refetch auth state after successful login
          refetchAuth()
        },
        onClose: () => {
          // Clear pending submit if modal closed without completing auth
          setPendingSubmit(null)
        },
      })
      return
    }

    // Already authenticated, deploy directly
    await performDeployment(data)
  }

  // Show template selection page first (always)
  if (showIdeaConfirmation) {
    const selectedTemplate = templates.find(t => t.template_id === templateId)

    return (
      <motion.div className="w-full" variants={containerVariants} initial="hidden" animate="visible">
        <div className="w-full max-w-7xl mx-auto px-6">
          <motion.div variants={itemVariants} className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Pick a template</h2>
            <p className="text-gray-600 dark:text-gray-400">Choose a starting point for your site</p>
          </motion.div>

          <div className="flex flex-col xl:flex-row gap-8">
            {/* Left: Template cards in grid */}
            <motion.div variants={itemVariants} className="xl:w-1/2">
              {templatesLoading ? (
                <div className="flex items-center justify-center h-64">
                  <span className="text-2xl font-mono text-gray-400 dark:text-gray-500">{loadingDots || "."}</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-4">
                  {templates.map(template => {
                    const isSelected = templateId === template.template_id
                    return (
                      <button
                        key={template.template_id}
                        type="button"
                        onClick={() => setTemplateId(template.template_id)}
                        className={`group relative overflow-hidden rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? "border-blue-500 ring-2 ring-blue-500/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-blue-400"
                        }`}
                      >
                        {/* Large image preview */}
                        <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-zinc-800">
                          {template.image_url && (
                            <img
                              src={template.image_url}
                              alt={`${template.name} template`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          )}
                        </div>
                        {/* Template info */}
                        <div className="p-3 bg-white dark:bg-zinc-900">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-900 dark:text-white text-sm">{template.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {template.description}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 ml-2">
                                <svg
                                  className="w-3 h-3 text-white"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              <motion.div variants={itemVariants} className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowIdeaConfirmation(false)}
                  disabled={!templateId || templatesLoading}
                  className="w-full px-8 py-4 bg-black dark:bg-white text-white dark:text-black text-base font-medium rounded-full hover:bg-black/90 dark:hover:bg-white/90 transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedTemplate ? `Continue with ${selectedTemplate.name}` : "Select a template"}
                </button>
              </motion.div>
            </motion.div>

            {/* Right: Preview iframe */}
            <motion.div variants={itemVariants} className="xl:w-1/2">
              <div className="rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 overflow-hidden h-[500px] xl:h-[600px] relative">
                {selectedTemplate?.preview_url ? (
                  <>
                    {/* Loading overlay */}
                    {iframeLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-zinc-800 z-10">
                        <span className="text-2xl font-mono text-gray-400 dark:text-gray-500 w-8 text-left">
                          {loadingDots || "."}
                        </span>
                      </div>
                    )}
                    <iframe
                      src={selectedTemplate.preview_url}
                      title={`${selectedTemplate.name} preview`}
                      className="w-full h-full"
                      sandbox="allow-scripts allow-same-origin"
                      onLoad={() => setIframeLoading(false)}
                    />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-zinc-800">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-gray-400 dark:text-gray-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <p className="text-gray-500 dark:text-gray-400">Select a template to preview</p>
                    </div>
                  </div>
                )}
              </div>
              {selectedTemplate?.preview_url && (
                <div className="mt-2 text-center">
                  <a
                    href={selectedTemplate.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                  >
                    Open in new tab →
                  </a>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div className="w-full" variants={containerVariants} initial="hidden" animate="visible">
      {/* Form container - only constrains form, not success */}
      {!deploymentStatus || !deploymentStatus.ok ? (
        <div className="w-full max-w-md mx-auto">
          {/* Debug button (dev only) */}
          {isDev && (
            <button
              type="button"
              onClick={simulateSuccess}
              className="mb-4 text-xs text-black/30 hover:text-black/50 font-mono"
            >
              [dev] simulate success
            </button>
          )}

          {/* Auth status banner */}
          {isAuthenticated ? (
            <motion.div
              variants={itemVariants}
              className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/30 rounded-xl"
            >
              <p className="text-sm text-emerald-900 dark:text-emerald-100 font-medium">
                Signed in as <span className="font-bold">{user?.email}</span>
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                Your site will be linked to your account.
              </p>
            </motion.div>
          ) : (
            <motion.div
              variants={itemVariants}
              className="mb-6 p-4 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-black/80 dark:text-white/80 font-medium">Not signed in</p>
                  <p className="text-xs text-black/50 dark:text-white/50 mt-0.5">You'll sign in when you launch</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openAuthModal({
                      onSuccess: () => {
                        // Explicitly refetch auth state after successful login
                        refetchAuth()
                      },
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-black dark:text-white bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 rounded-lg transition-colors"
                >
                  <LogIn size={14} />
                  Sign in
                </button>
              </div>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <motion.div variants={itemVariants}>
              <SlugInput register={register} errors={errors} watchSlug={watchSlug} isDeploying={isDeploying} />
            </motion.div>

            {/* Show selected template */}
            {templateId && (
              <motion.div variants={itemVariants}>
                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-blue-900 dark:text-blue-100">
                      Template: <strong>{templates.find(t => t.template_id === templateId)?.name}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIdeaConfirmation(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 font-medium"
                  >
                    Change
                  </button>
                </div>
              </motion.div>
            )}

            <input type="hidden" {...register("siteIdeas")} />

            <motion.div variants={itemVariants}>
              <SubmitButton
                isDeploying={isDeploying}
                isValid={isValid && !errors.slug}
                label={isAuthenticated ? "Launch Site" : "Continue"}
                countdown={elapsedTime}
              />
            </motion.div>
          </form>
        </div>
      ) : null}

      {/* Status - full width, no constraints */}
      {deploymentStatus && (
        <div className="mt-8">
          <DeploymentStatus
            status={deploymentStatus.ok ? "success" : "error"}
            domain={deploymentStatus?.domain}
            error={deploymentStatus?.message}
            errorCode={deploymentStatus?.error}
            details={deploymentStatus?.details}
            chatUrl={deploymentStatus?.chatUrl}
          />
        </div>
      )}
    </motion.div>
  )
}
