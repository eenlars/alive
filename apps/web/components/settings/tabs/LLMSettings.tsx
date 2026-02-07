"use client"

import { useBilling } from "@flowglad/nextjs"
import { Eye, EyeOff } from "lucide-react"
import { useEffect, useState } from "react"
import { useAuth } from "@/features/deployment/hooks/useAuth"
import { getModelDisplayName } from "@/lib/models/claude-models"
import { useCredits, useCreditsError, useCreditsLoading, useUserActions } from "@/lib/providers/UserStoreProvider"
import { CLAUDE_MODELS, type ClaudeModel, DEFAULT_MODEL, useLLMStore } from "@/lib/stores/llmStore"
import { useCurrentWorkspace } from "@/lib/stores/workspaceStore"
import { infoCard, input, primaryButton, secondaryButton, select, smallButton, text, warningCard } from "../styles"
import { SettingsTabLayout } from "./SettingsTabLayout"

function isValidModel(value: string): value is ClaudeModel {
  return Object.values(CLAUDE_MODELS).includes(value as ClaudeModel)
}

export function LLMSettings() {
  const { apiKey, model, setApiKey, setModel, clearApiKey, error } = useLLMStore()
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [isSaved, setIsSaved] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)

  // Credits state
  const credits = useCredits()
  const creditsLoading = useCreditsLoading()
  const creditsError = useCreditsError()
  const { fetchCredits } = useUserActions()

  // FlowGlad billing state
  const billing = useBilling()

  // Check if user can select any model (server-side flag based on UNRESTRICTED_MODEL_EMAILS env var)
  const { user: sessionUser } = useAuth()
  const canSelectAnyModel = sessionUser?.canSelectAnyModel ?? false

  // Get current workspace from store
  const workspace = useCurrentWorkspace()

  useEffect(() => {
    setApiKeyInput(apiKey || "")
  }, [apiKey])

  // Fetch credits when component mounts
  useEffect(() => {
    if (workspace && !apiKey) {
      fetchCredits(workspace)
    }
  }, [fetchCredits, apiKey, workspace])

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
    <SettingsTabLayout title="AI Model" description="Configure your AI settings">
      <div className="space-y-4 sm:space-y-6">
        {/* Credits Display - Only show when using workspace credits */}
        {!apiKey && (
          <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-50">
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
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Running low on credits</p>
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
                      {creditsLoading ? "..." : creditsError ? "—" : credits != null ? credits.toFixed(2) : "—"}
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

        <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-100">
          <label htmlFor="anthropic-api-key" className={`block ${text.label} mb-1`}>
            Your API Key
            <span className={`ml-2 ${text.muted}`}>(optional)</span>
          </label>
          <p className={`${text.description} mb-3`}>Use your own key to unlock all models</p>
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

        <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300 delay-150">
          <label htmlFor="claude-model" className={`block ${text.label} mb-1`}>
            Model
          </label>
          <p className={`${text.description} mb-3`}>
            {apiKey || canSelectAnyModel
              ? "Choose which Claude model to use"
              : `Currently using ${getModelDisplayName(DEFAULT_MODEL)}`}
          </p>
          <select
            id="claude-model"
            value={model}
            onChange={handleModelChange}
            disabled={!apiKey && !canSelectAnyModel}
            className={select}
            aria-label="Claude Model Selection"
          >
            <option value={CLAUDE_MODELS.OPUS_4_6}>Claude Opus 4.6</option>
            <option value={CLAUDE_MODELS.SONNET_4_5}>Claude Sonnet 4.5 (Recommended)</option>
            <option value={CLAUDE_MODELS.HAIKU_4_5}>Claude Haiku 4.5</option>
          </select>
        </div>

        <div className={`${infoCard} animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-200`}>
          <p className={`${text.description} leading-relaxed`}>
            Your API key is stored only in your browser (hidden from view). When you send messages, we use your key to
            call Anthropic&apos;s API—but we never save it on our servers.
          </p>
        </div>
      </div>
    </SettingsTabLayout>
  )
}
