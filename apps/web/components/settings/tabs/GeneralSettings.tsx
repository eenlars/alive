"use client"

import type { FlowgladContextValues } from "@flowglad/nextjs"
import { useBilling } from "@flowglad/nextjs"
import { Eye, EyeOff, LogOut, Moon, Sun } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react"
import { useAuth } from "@/features/deployment/hooks/useAuth"
import { getModelDisplayName } from "@/lib/models/claude-models"
import { useCredits, useCreditsError, useCreditsLoading, useUserActions } from "@/lib/providers/UserStoreProvider"
import { CLAUDE_MODELS, type ClaudeModel, DEFAULT_MODEL, useLLMStore } from "@/lib/stores/llmStore"
import { useCurrentWorkspace, useWorkspaceActions } from "@/lib/stores/workspaceStore"
import {
  dangerButton,
  infoCard,
  input,
  primaryButton,
  readOnlyField,
  secondaryButton,
  sectionDivider,
  select,
  selectionCardActive,
  selectionCardInactive,
  smallButton,
  text,
  warningCard,
} from "../styles"
import { SettingsTabLayout } from "./SettingsTabLayout"

function isValidModel(value: string): value is ClaudeModel {
  return Object.values(CLAUDE_MODELS).includes(value as ClaudeModel)
}

/** Error boundary that renders fallback instead of crashing the page */
class BillingErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[BillingErrorBoundary] Caught:", error.message, info.componentStack)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

/** Wrapper that calls useBilling inside an error boundary */
function BillingProvider({ children }: { children: (billing: FlowgladContextValues) => ReactNode }) {
  const billing = useBilling()
  return <>{children(billing)}</>
}

/** Safe wrapper: renders children with billing data, falls back to not-loaded on error */
function SafeBilling({ children }: { children: (billing: FlowgladContextValues) => ReactNode }) {
  return (
    <BillingErrorBoundary fallback={null}>
      <BillingProvider>{children}</BillingProvider>
    </BillingErrorBoundary>
  )
}

export function GeneralSettings() {
  // --- Profile state ---
  const { user } = useAuth()
  const router = useRouter()
  const { setCurrentWorkspace } = useWorkspaceActions()
  const { theme, setTheme } = useTheme()

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme)
  }

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) {
        console.error("Logout returned", res.status)
      }
      setCurrentWorkspace(null)
      router.push("/")
    } catch (error) {
      console.error("Logout failed:", error)
    }
  }

  // --- AI state ---
  const { apiKey, model, setApiKey, setModel, clearApiKey, error } = useLLMStore()
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [isSaved, setIsSaved] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)

  const credits = useCredits()
  const creditsLoading = useCreditsLoading()
  const creditsError = useCreditsError()
  const { fetchCredits } = useUserActions()

  const canSelectAnyModel = user?.canSelectAnyModel ?? false
  const enabledModels = user?.enabledModels ?? []
  const isModelAvailable = (modelId: string): boolean => {
    if (apiKey || canSelectAnyModel) return true
    if (enabledModels.length > 0) return enabledModels.includes(modelId)
    return modelId === DEFAULT_MODEL
  }

  const workspace = useCurrentWorkspace()

  useEffect(() => {
    setApiKeyInput(apiKey || "")
  }, [apiKey])

  useEffect(() => {
    if (workspace && !apiKey) {
      fetchCredits(workspace)
    }
  }, [fetchCredits, apiKey, workspace])

  // Reset model when current selection becomes unavailable
  useEffect(() => {
    if (!isModelAvailable(model)) {
      const fallback = enabledModels.length > 0 ? enabledModels[0] : DEFAULT_MODEL
      if (isValidModel(fallback)) {
        setModel(fallback)
      } else {
        setModel(DEFAULT_MODEL)
      }
    }
  }, [apiKey, canSelectAnyModel, enabledModels, model, setModel])

  const handleSaveApiKey = () => {
    const trimmedKey = apiKeyInput.trim()
    setApiKey(trimmedKey || null)
    if (!error) {
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  const handleClearApiKey = () => {
    clearApiKey()
    setApiKeyInput("")
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (isValidModel(value)) {
      setModel(value)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeyInput(e.target.value)
    if (error) {
      useLLMStore.getState().setError(null)
    }
  }

  const isKeyChanged = apiKeyInput !== (apiKey || "")

  return (
    <SettingsTabLayout title="General" description="Your account, appearance, and AI model settings">
      <div className="space-y-4 sm:space-y-6">
        {/* Email */}
        <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-75">
          <p className={`${text.label} mb-0.5`}>Email Address</p>
          <p className={`${text.muted} mb-2`}>
            The email you signed up with. This is used for login and notifications.
          </p>
          <div className={readOnlyField}>{user?.email || "\u2014"}</div>
        </div>

        {/* Theme */}
        <div className={`${sectionDivider} animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-175`}>
          <p className={`${text.label} mb-0.5`}>Theme</p>
          <p className={`${text.muted} mb-3`}>
            Controls how the interface looks. System follows your device's setting.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              className={theme === "light" ? selectionCardActive : selectionCardInactive}
            >
              <Sun size={20} strokeWidth={1.5} className="text-black/70 dark:text-white/70" />
              <span className={text.description}>Light</span>
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              className={theme === "dark" ? selectionCardActive : selectionCardInactive}
            >
              <Moon size={20} strokeWidth={1.5} className="text-black/70 dark:text-white/70" />
              <span className={text.description}>Dark</span>
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("system")}
              className={theme === "system" ? selectionCardActive : selectionCardInactive}
            >
              <div className="flex items-center gap-1.5">
                <Sun size={14} strokeWidth={1.5} className="text-black/70 dark:text-white/70" />
                <Moon size={14} strokeWidth={1.5} className="text-black/70 dark:text-white/70" />
              </div>
              <span className={text.description}>System</span>
            </button>
          </div>
        </div>

        {/* Credits - only when using workspace credits */}
        {!apiKey && (
          <SafeBilling>
            {billing => (
              <div className={`${sectionDivider} animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-50`}>
                {(() => {
                  const isLow = credits != null && credits < 5
                  const handleUpgrade = async () => {
                    if (!billing.loaded) return
                    setIsUpgrading(true)
                    try {
                      const products = billing.pricingModel?.products
                      const defaultProduct = products?.[0]
                      if (billing.createCheckoutSession && defaultProduct?.defaultPrice) {
                        const result = await billing.createCheckoutSession({
                          priceId: defaultProduct.defaultPrice.id,
                          successUrl: `${window.location.origin}/chat?upgraded=true`,
                          cancelUrl: window.location.href,
                          autoRedirect: true,
                        })
                        if (result && "url" in result && result.url) {
                          window.location.href = result.url
                        }
                      } else if (billing.billingPortalUrl) {
                        window.open(billing.billingPortalUrl, "_blank")
                      }
                    } catch (err) {
                      console.error("Upgrade failed:", err)
                    } finally {
                      setIsUpgrading(false)
                    }
                  }

                  return isLow ? (
                    <button
                      type="button"
                      onClick={handleUpgrade}
                      disabled={isUpgrading || !billing.loaded}
                      className={`w-full ${warningCard} hover:bg-amber-500/10 transition-colors disabled:opacity-40`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-left">
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                            Running low on credits
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                            {credits?.toFixed(2)} remaining
                          </p>
                        </div>
                        <span className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg">
                          {isUpgrading ? "..." : "Top up"}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between">
                      <h4 className={text.label}>Credits</h4>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold text-black/90 dark:text-white/90">
                          {creditsLoading
                            ? "..."
                            : creditsError
                              ? "\u2014"
                              : credits != null
                                ? credits.toFixed(2)
                                : "\u2014"}
                        </span>
                        <button
                          type="button"
                          onClick={handleUpgrade}
                          disabled={isUpgrading || !billing.loaded}
                          className={smallButton}
                        >
                          {isUpgrading ? "..." : "Get more"}
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </SafeBilling>
        )}

        {/* API Key */}
        <div className={`${sectionDivider} animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-100`}>
          <label htmlFor="anthropic-api-key" className={`block ${text.label} mb-0.5`}>
            Your API Key
            <span className={`ml-2 ${text.muted}`}>(optional)</span>
          </label>
          <p className={`${text.muted} mb-3`}>
            Bring your own Anthropic API key to use any model without credits. Get one at console.anthropic.com.
          </p>
          <div className="space-y-3">
            <div className="relative">
              <input
                id="anthropic-api-key"
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={handleInputChange}
                placeholder="sk-ant-..."
                className={`${input} pr-12 font-mono`}
                aria-label="Anthropic API Key"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 transition-colors"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
              </button>
            </div>

            {error && (
              <div className={`flex items-center gap-2 ${text.error}`}>
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={!isKeyChanged}
                className={`flex-1 ${primaryButton}`}
              >
                {isSaved ? "Saved!" : "Save API Key"}
              </button>
              {apiKey && (
                <button type="button" onClick={handleClearApiKey} className={secondaryButton}>
                  Clear
                </button>
              )}
            </div>
            {apiKey && !error && (
              <div className={`flex items-center gap-2 ${text.success}`}>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                API key saved in browser
              </div>
            )}
          </div>
        </div>

        {/* Model Selection */}
        <div className={`${sectionDivider} animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-150`}>
          <label htmlFor="claude-model" className={`block ${text.label} mb-0.5`}>
            Model
          </label>
          <p className={`${text.muted} mb-3`}>
            {apiKey || canSelectAnyModel
              ? "Opus is the smartest but slowest. Sonnet balances speed and quality. Haiku is fastest for simple tasks."
              : `You're using ${getModelDisplayName(DEFAULT_MODEL)}. Add your own API key above to switch models.`}
          </p>
          <select
            id="claude-model"
            value={model}
            onChange={handleModelChange}
            disabled={!apiKey && !canSelectAnyModel}
            className={select}
            aria-label="Claude Model Selection"
          >
            {(() => {
              const allModels = Object.values(CLAUDE_MODELS) as ClaudeModel[]
              const available = allModels.filter(isModelAvailable)
              const options = available.length > 0 ? available : [DEFAULT_MODEL]
              return options.map(m => (
                <option key={m} value={m}>
                  {getModelDisplayName(m)}
                </option>
              ))
            })()}
          </select>
        </div>

        {/* Privacy notice */}
        <div className={`${infoCard} animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-200`}>
          <p className={`${text.description} leading-relaxed`}>
            Your API key is stored only in your browser (hidden from view). When you send messages, we use your key to
            call Anthropic&apos;s API&mdash;but we never save it on our servers.
          </p>
        </div>

        {/* Logout */}
        <div className={`${sectionDivider} animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-200`}>
          <p className={`${text.muted} mb-3`}>Signs you out of this session. Your data and websites are kept safe.</p>
          <button type="button" onClick={handleLogout} className={`${dangerButton} gap-2`} data-testid="logout-button">
            <LogOut size={16} strokeWidth={1.75} />
            Log out
          </button>
        </div>
      </div>
    </SettingsTabLayout>
  )
}
