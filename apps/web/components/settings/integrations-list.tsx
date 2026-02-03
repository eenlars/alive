/**
 * Dynamic integrations list component
 *
 * Displays available integrations based on database visibility rules.
 * Uses popup-based OAuth flow to keep the user in the settings modal.
 */

"use client"

import { isValidOAuthMcpProviderKey, providerSupportsOAuth, providerSupportsPat } from "@webalive/shared"
import { AlertCircle, CheckCircle2, ExternalLink, Key, Loader2, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  useConnectIntegration,
  useConnectWithPat,
  useDisconnectIntegration,
  useIntegrations,
} from "@/hooks/use-integrations"
import { getIntegrationUI } from "@/lib/integrations/registry"

// Constants
const VISIBILITY_STATUS = {
  BETA: "beta",
} as const

const TOKEN_STATUS = {
  NEEDS_REAUTH: "needs_reauth",
} as const

/**
 * Pulsing status indicator dot
 */
function StatusIndicator({ color }: { color: "orange" | "emerald" }) {
  const colorClasses = {
    orange: {
      ping: "bg-orange-400",
      dot: "bg-orange-500",
    },
    emerald: {
      ping: "bg-emerald-400",
      dot: "bg-emerald-500",
    },
  }

  const classes = colorClasses[color]

  return (
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${classes.ping} opacity-75`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${classes.dot}`} />
    </span>
  )
}

/**
 * Early Access badge component
 */
function EarlyAccessBadge({ size = "default" }: { size?: "default" | "small" }) {
  const sizeClasses = size === "small" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[10px]"

  return (
    <span
      className={`${sizeClasses} font-medium bg-gradient-to-r from-purple-500/10 to-blue-500/10 text-purple-700 dark:text-purple-300 rounded${size === "small" ? "" : "-full"} border border-purple-200/50 dark:border-purple-700/30`}
    >
      Early Access
    </span>
  )
}

/**
 * Error alert component
 */
function ErrorAlert({ error, size = "default" }: { error: string; size?: "default" | "small" }) {
  const sizeClasses = {
    small: {
      container: "mb-3 px-3 py-2.5",
      icon: "h-3.5 w-3.5",
      text: "text-xs",
    },
    default: {
      container: "mb-4 px-4 py-3",
      icon: "h-4 w-4",
      text: "text-sm",
    },
  }

  const classes = sizeClasses[size]

  return (
    <div
      className={`${classes.container} rounded-lg bg-gradient-to-br from-orange-50 to-red-50/50 dark:from-orange-950/20 dark:to-red-950/10 border border-orange-200/50 dark:border-orange-800/30`}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className={`${classes.icon} text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5`} />
        <p className={`${classes.text} text-orange-900 dark:text-orange-300 leading-relaxed font-medium`}>{error}</p>
      </div>
    </div>
  )
}

/**
 * Get card container styles based on token status and connection state
 */
function getCardStyles(tokenStatus: string | undefined, isConnected: boolean, layout: "grid" | "list") {
  const baseStyles = "group relative rounded-xl border transition-all duration-300 overflow-hidden"
  const hoverEffect = layout === "grid" ? "hover:shadow-xl" : "hover:shadow-lg"

  if (tokenStatus === TOKEN_STATUS.NEEDS_REAUTH) {
    return `${baseStyles} ${hoverEffect} border-orange-500/30 dark:border-orange-400/30 bg-gradient-to-br from-orange-50/${layout === "list" ? "50" : "30"} ${layout === "list" ? "to-orange-50/30 dark:from-orange-950/10 dark:to-orange-950/5" : "to-white dark:from-orange-950/10 dark:to-zinc-900"} hover:border-orange-500/50 ${layout === "list" ? "dark:hover:border-orange-400/50 hover:shadow-orange-500/5" : "hover:shadow-orange-500/10"}`
  }

  if (isConnected) {
    return `${baseStyles} ${hoverEffect} border-emerald-500/20 dark:border-emerald-400/20 bg-gradient-to-br from-emerald-50/${layout === "list" ? "50" : "30"} ${layout === "list" ? "to-green-50/30 dark:from-emerald-950/10 dark:to-green-950/5" : "to-white dark:from-emerald-950/10 dark:to-zinc-900"} hover:border-emerald-500/40 ${layout === "list" ? "dark:hover:border-emerald-400/40 hover:shadow-emerald-500/5" : "hover:shadow-emerald-500/10"}`
  }

  return `${baseStyles} ${hoverEffect} border-black/10 dark:border-white/10 ${layout === "list" ? "bg-white dark:bg-zinc-900/50" : "bg-white dark:bg-zinc-900"} hover:border-black/20 dark:hover:border-white/20 ${layout === "list" ? "hover:shadow-black/5 dark:hover:shadow-white/5" : ""}`
}

interface IntegrationsListProps {
  layout?: "grid" | "list"
  filter?: string
}

export function IntegrationsList({ layout = "grid", filter }: IntegrationsListProps) {
  const { integrations, loading, error, refetch } = useIntegrations()

  // Auto-refresh when OAuth callback succeeds (for non-popup fallback)
  const urlSearchParams = typeof window !== "undefined" ? window.location.search : ""
  useEffect(() => {
    const params = new URLSearchParams(urlSearchParams)
    const integration = params.get("integration")
    const status = params.get("status")

    if (integration && status === "success") {
      // OAuth just succeeded - refetch to show "Connected" status immediately
      refetch()
      // Clean up URL params
      const url = new URL(window.location.href)
      url.searchParams.delete("integration")
      url.searchParams.delete("status")
      url.searchParams.delete("message")
      window.history.replaceState({}, "", url.toString())
    }
  }, [urlSearchParams, refetch])

  // Filter integrations if filter prop provided
  const filteredIntegrations = filter ? integrations.filter(i => i.provider_key === filter) : integrations

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading integrations...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        {/* Icon with subtle animation */}
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-orange-500/10 dark:bg-orange-400/10 rounded-full blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 dark:from-orange-400/20 dark:to-red-400/20 flex items-center justify-center border border-orange-200/50 dark:border-orange-700/30">
            <AlertCircle className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        {/* Heading */}
        <h3 className="text-xl font-semibold text-black dark:text-white mb-2">Connection Issue</h3>

        {/* Error message */}
        <p className="text-sm text-black/70 dark:text-white/70 max-w-md mb-1">
          We couldn't load your integrations right now.
        </p>

        {/* Technical details (collapsed by default feel) */}
        <details className="text-xs text-black/50 dark:text-white/50 max-w-md mb-8 cursor-pointer">
          <summary className="hover:text-black/70 dark:hover:text-white/70 transition-colors">
            Technical details
          </summary>
          <code className="block mt-2 p-2 bg-black/5 dark:bg-white/5 rounded text-left font-mono">{error}</code>
        </details>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={refetch}
            className="min-w-[140px] bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()} className="min-w-[140px]">
            Refresh Page
          </Button>
        </div>

        {/* Helpful hint */}
        <p className="text-xs text-black/40 dark:text-white/40 mt-8">
          If this persists, try refreshing the page or contact support
        </p>
      </div>
    )
  }

  if (filteredIntegrations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-black/40 dark:text-white/40" />
        </div>
        <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Integrations Available</h3>
        <p className="text-sm text-black/60 dark:text-white/60 max-w-md mb-6">
          You don't have access to any integrations yet. Integrations allow you to connect external services like
          Linear, GitHub, and more to enhance your workflow.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.open("mailto:support@example.com?subject=Request%20Integration%20Access", "_blank")
            }}
          >
            Request Access
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={layout === "grid" ? "grid gap-6 grid-cols-1 sm:grid-cols-2" : "space-y-3"}>
      {filteredIntegrations.map(integration => (
        <IntegrationCard key={integration.provider_key} integration={integration} onUpdate={refetch} layout={layout} />
      ))}
    </div>
  )
}

interface IntegrationCardProps {
  integration: {
    provider_key: string
    display_name: string
    logo_path: string | null
    is_connected: boolean
    visibility_status: string
    token_status?: "valid" | "expired" | "needs_reauth" | "not_connected"
    status_message?: string
  }
  onUpdate: () => void
  layout?: "grid" | "list"
}

/**
 * Helper function to render integration UI component when connected
 * Extracts the common logic for both list and grid layouts
 */
function renderIntegrationUI(integration: IntegrationCardProps["integration"], layout: "grid" | "list") {
  if (!integration.is_connected) return null

  const providerKey = integration.provider_key
  if (!isValidOAuthMcpProviderKey(providerKey)) return null

  const uiConfig = getIntegrationUI(providerKey)
  if (!uiConfig) return null

  const Component = uiConfig.component
  const limit = layout === "list" ? (uiConfig.compactLimit ?? 5) : (uiConfig.fullLimit ?? 8)
  const titleClass =
    layout === "list"
      ? "text-xs font-semibold text-black/70 dark:text-white/70 mb-3 uppercase tracking-wide"
      : "text-sm font-semibold text-black/70 dark:text-white/70 mb-4 uppercase tracking-wide"

  if (layout === "list") {
    return (
      <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5">
        <h5 className={titleClass}>{uiConfig.title}</h5>
        <Component compact={true} limit={limit} />
      </div>
    )
  }

  // Grid layout
  return (
    <div className="px-6 pb-6 pt-2">
      <div className="pt-4 border-t border-black/5 dark:border-white/5">
        <h5 className={titleClass}>{uiConfig.title}</h5>
        <Component compact={true} limit={limit} />
      </div>
    </div>
  )
}

/**
 * PAT Input Component for providers that support Personal Access Tokens
 */
function PatInput({
  providerKey,
  displayName,
  onSuccess,
  size = "default",
}: {
  providerKey: string
  displayName: string
  onSuccess: () => void
  size?: "default" | "small"
}) {
  const [token, setToken] = useState("")
  const [showInput, setShowInput] = useState(false)
  const { connectWithPat, connecting, error, clearError } = useConnectWithPat(providerKey)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return

    const result = await connectWithPat(token.trim())
    if (result.success) {
      toast.success(`Connected to ${displayName} as ${result.username}`, {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      })
      setToken("")
      setShowInput(false)
      onSuccess()
    }
  }

  const sizeClasses = size === "small" ? "text-xs" : "text-sm"
  const inputPadding = size === "small" ? "px-2 py-1.5" : "px-3 py-2"
  const buttonPadding = size === "small" ? "px-3 py-1.5" : "px-4 py-2"

  if (!showInput) {
    return (
      <button
        type="button"
        onClick={() => {
          setShowInput(true)
          clearError()
        }}
        className={`${buttonPadding} ${sizeClasses} font-medium rounded-md bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition-all duration-200 active:scale-95 flex items-center gap-1.5`}
      >
        <Key className="h-3.5 w-3.5" />
        Connect with Token
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="ghp_xxxx or github_pat_xxxx"
          className={`flex-1 ${inputPadding} ${sizeClasses} rounded-md border border-black/20 dark:border-white/20 bg-white dark:bg-zinc-900 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20`}
        />
        <button
          type="submit"
          disabled={connecting || !token.trim()}
          className={`${buttonPadding} ${sizeClasses} font-medium rounded-md bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowInput(false)
            setToken("")
            clearError()
          }}
          className={`${buttonPadding} ${sizeClasses} font-medium rounded-md border border-black/20 dark:border-white/20 text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200`}
        >
          Cancel
        </button>
      </div>
      {error && <p className={`${sizeClasses} text-red-600 dark:text-red-400`}>{error}</p>}
      <p className={`${sizeClasses} text-black/50 dark:text-white/50`}>
        <a
          href="https://github.com/settings/tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white underline underline-offset-2"
        >
          Create a token on GitHub
          <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </form>
  )
}

/**
 * Dual Connection Options Component
 * Shows both OAuth and PAT options equally for providers that support both
 */
function DualConnectionOptions({
  providerKey,
  displayName,
  onOAuthConnect,
  onSuccess,
  connecting,
  size = "default",
}: {
  providerKey: string
  displayName: string
  onOAuthConnect: () => void
  onSuccess: () => void
  connecting: boolean
  size?: "default" | "small"
}) {
  const [showPatInput, setShowPatInput] = useState(false)
  const { connectWithPat, connecting: patConnecting, error: patError, clearError } = useConnectWithPat(providerKey)
  const [token, setToken] = useState("")

  const handlePatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return

    const result = await connectWithPat(token.trim())
    if (result.success) {
      toast.success(`Connected to ${displayName} as ${result.username}`, {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      })
      setToken("")
      setShowPatInput(false)
      onSuccess()
    }
  }

  const sizeClasses = size === "small" ? "text-xs" : "text-sm"
  const buttonPadding = size === "small" ? "px-3 py-1.5" : "px-4 py-2"
  const inputPadding = size === "small" ? "px-2 py-1.5" : "px-3 py-2"

  if (showPatInput) {
    return (
      <form onSubmit={handlePatSubmit} className="space-y-2">
        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="ghp_xxxx or github_pat_xxxx"
            className={`flex-1 ${inputPadding} ${sizeClasses} rounded-md border border-black/20 dark:border-white/20 bg-white dark:bg-zinc-900 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20`}
          />
          <button
            type="submit"
            disabled={patConnecting || !token.trim()}
            className={`${buttonPadding} ${sizeClasses} font-medium rounded-md bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {patConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowPatInput(false)
              setToken("")
              clearError()
            }}
            className={`${buttonPadding} ${sizeClasses} font-medium rounded-md border border-black/20 dark:border-white/20 text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200`}
          >
            Cancel
          </button>
        </div>
        {patError && <p className={`${sizeClasses} text-red-600 dark:text-red-400`}>{patError}</p>}
        <p className={`${sizeClasses} text-black/50 dark:text-white/50`}>
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white underline underline-offset-2"
          >
            Create a token on GitHub
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </form>
    )
  }

  // Show both buttons
  return (
    <div className="flex flex-col gap-2">
      <div className={size === "small" ? "flex gap-2" : "flex flex-col gap-2"}>
        {/* OAuth Button */}
        <button
          type="button"
          onClick={onOAuthConnect}
          disabled={connecting}
          className={`${size === "small" ? "flex-1" : "w-full"} ${buttonPadding} ${sizeClasses} font-medium rounded-md bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-1.5`}
        >
          {connecting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <ExternalLink className="h-3.5 w-3.5" />
              Connect with OAuth
            </>
          )}
        </button>
        {/* PAT Button */}
        <button
          type="button"
          onClick={() => {
            setShowPatInput(true)
            clearError()
          }}
          className={`${size === "small" ? "flex-1" : "w-full"} ${buttonPadding} ${sizeClasses} font-medium rounded-md border border-black/20 dark:border-white/20 text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5`}
        >
          <Key className="h-3.5 w-3.5" />
          Use Token
        </button>
      </div>
    </div>
  )
}

function IntegrationCard({ integration, onUpdate, layout = "grid" }: IntegrationCardProps) {
  const { disconnect, disconnecting, error: disconnectError } = useDisconnectIntegration(integration.provider_key)
  const { connect, connecting, error: connectError } = useConnectIntegration(integration.provider_key)

  const error = disconnectError || connectError
  const supportsPat = providerSupportsPat(integration.provider_key)
  const supportsOAuth = providerSupportsOAuth(integration.provider_key)
  const supportsBoth = supportsPat && supportsOAuth

  const handleConnect = async () => {
    const success = await connect()
    if (success) {
      toast.success(`${integration.display_name} connected`, {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      })
      onUpdate() // Refresh to show connected status
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
    toast.success(`${integration.display_name} disconnected`)
    onUpdate() // Refresh the list
  }

  // Logo with polished styling
  const logoElement = integration.logo_path ? (
    <div className="relative group/logo">
      <div className="absolute inset-0 bg-gradient-to-br from-black/5 to-black/10 dark:from-white/5 dark:to-white/10 rounded-lg blur group-hover/logo:blur-md transition-all" />
      <img
        src={integration.logo_path}
        alt={`${integration.display_name} logo`}
        className="relative h-10 w-10 rounded-lg object-contain p-1 bg-white dark:bg-black/20 border border-black/5 dark:border-white/10 shadow-sm"
      />
    </div>
  ) : (
    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-black/5 to-black/10 dark:from-white/5 dark:to-white/10 flex items-center justify-center border border-black/5 dark:border-white/10 flex-shrink-0">
      <span className="text-sm font-semibold bg-gradient-to-br from-black/70 to-black/50 dark:from-white/70 dark:to-white/50 bg-clip-text text-transparent">
        {integration.display_name.slice(0, 2).toUpperCase()}
      </span>
    </div>
  )

  // Compact list layout for modal
  if (layout === "list") {
    return (
      <div className={getCardStyles(integration.token_status, integration.is_connected, layout)}>
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Logo */}
            <div className="relative">
              {logoElement}
              {integration.is_connected && (
                <div className="absolute -top-1 -right-1">
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500 rounded-full blur-sm animate-pulse" />
                    <div className="relative w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-zinc-900 shadow-sm" />
                  </div>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Title & Status */}
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-black dark:text-white truncate">
                  {integration.display_name}
                </h4>
                {/* Only show "Early Access" for beta - if you can see it, you have access */}
                {integration.visibility_status === VISIBILITY_STATUS.BETA && <EarlyAccessBadge size="small" />}
              </div>

              {/* Status text */}
              <p className="text-xs text-black/60 dark:text-white/60 mb-3">
                {integration.token_status === TOKEN_STATUS.NEEDS_REAUTH ? (
                  <span className="flex items-center gap-1.5 font-medium">
                    <StatusIndicator color="orange" />
                    <span className="text-orange-700 dark:text-orange-400">
                      {integration.status_message || "Reconnection required"}
                    </span>
                  </span>
                ) : integration.is_connected ? (
                  <span className="flex items-center gap-1.5 font-medium">
                    <StatusIndicator color="emerald" />
                    <span className="text-emerald-700 dark:text-emerald-400">Connected and active</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 bg-black/20 dark:bg-white/20 rounded-full" />
                    Ready to connect
                  </span>
                )}
              </p>

              {/* Error alert - polished */}
              {error && <ErrorAlert error={error} size="small" />}

              {/* Action button */}
              {integration.token_status === TOKEN_STATUS.NEEDS_REAUTH ? (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-orange-500 dark:bg-orange-600 text-white hover:bg-orange-600 dark:hover:bg-orange-500 transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {connecting ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Reconnecting...
                    </span>
                  ) : (
                    "Reconnect"
                  )}
                </button>
              ) : integration.is_connected ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-black/20 dark:border-white/20 text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {disconnecting ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Disconnecting...
                    </span>
                  ) : (
                    "Disconnect"
                  )}
                </button>
              ) : supportsBoth ? (
                <DualConnectionOptions
                  providerKey={integration.provider_key}
                  displayName={integration.display_name}
                  onOAuthConnect={handleConnect}
                  onSuccess={onUpdate}
                  connecting={connecting}
                  size="small"
                />
              ) : supportsPat ? (
                <PatInput
                  providerKey={integration.provider_key}
                  displayName={integration.display_name}
                  onSuccess={onUpdate}
                  size="small"
                />
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {connecting ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    "Connect"
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Show integration UI component when connected */}
          {renderIntegrationUI(integration, layout)}
        </div>
      </div>
    )
  }

  // Standard grid layout for full page
  return (
    <div className={getCardStyles(integration.token_status, integration.is_connected, layout)}>
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            {logoElement}
            <div>
              <h3 className="text-lg font-semibold text-black dark:text-white">{integration.display_name}</h3>
              <p className="text-sm text-black/50 dark:text-white/50 font-mono">{integration.provider_key}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {integration.token_status === TOKEN_STATUS.NEEDS_REAUTH ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 dark:bg-orange-400/10 border border-orange-500/20 dark:border-orange-400/20">
                <StatusIndicator color="orange" />
                <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Reconnect</span>
              </div>
            ) : integration.is_connected ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/20 dark:border-emerald-400/20">
                <StatusIndicator color="emerald" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                <span className="inline-block w-1.5 h-1.5 bg-black/20 dark:bg-white/20 rounded-full" />
                <span className="text-xs font-medium text-black/60 dark:text-white/60">Not Connected</span>
              </div>
            )}
            {integration.visibility_status === VISIBILITY_STATUS.BETA && <EarlyAccessBadge />}
          </div>
        </div>

        {/* Error - polished */}
        {error && <ErrorAlert error={error} />}

        {/* Description */}
        <p className="text-sm text-black/70 dark:text-white/70 leading-relaxed">
          {integration.token_status === TOKEN_STATUS.NEEDS_REAUTH
            ? integration.status_message || `Your ${integration.display_name} connection has expired. Please reconnect.`
            : integration.is_connected
              ? `Your ${integration.display_name} account is connected and ready to use.`
              : `Connect your ${integration.display_name} account to enable this integration.`}
        </p>
      </div>

      {/* Footer with action */}
      <div className="px-6 pb-6">
        {integration.token_status === TOKEN_STATUS.NEEDS_REAUTH ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:shadow-lg hover:shadow-orange-500/20 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          >
            {connecting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reconnecting...
              </span>
            ) : (
              `Reconnect ${integration.display_name}`
            )}
          </button>
        ) : integration.is_connected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border-2 border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          >
            {disconnecting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Disconnecting...
              </span>
            ) : (
              "Disconnect"
            )}
          </button>
        ) : supportsBoth ? (
          <DualConnectionOptions
            providerKey={integration.provider_key}
            displayName={integration.display_name}
            onOAuthConnect={handleConnect}
            onSuccess={onUpdate}
            connecting={connecting}
          />
        ) : supportsPat ? (
          <PatInput
            providerKey={integration.provider_key}
            displayName={integration.display_name}
            onSuccess={onUpdate}
          />
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-black to-black/90 dark:from-white dark:to-white/90 text-white dark:text-black hover:shadow-lg hover:shadow-black/20 dark:hover:shadow-white/20 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          >
            {connecting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </span>
            ) : (
              `Connect ${integration.display_name}`
            )}
          </button>
        )}
      </div>

      {/* Show integration UI component when connected */}
      {renderIntegrationUI(integration, layout)}
    </div>
  )
}

/**
 * Single integration status component
 * Useful for showing a specific integration's status
 */
export function IntegrationStatus({ providerKey }: { providerKey: string }) {
  const { integrations, loading } = useIntegrations()

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin" />
  }

  const integration = integrations.find(i => i.provider_key === providerKey)

  if (!integration) {
    return null // Integration not available for this user
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{integration.display_name}:</span>
      {integration.is_connected ? (
        <Badge variant="default" className="bg-green-500">
          Connected
        </Badge>
      ) : (
        <Badge variant="secondary">Not Connected</Badge>
      )}
    </div>
  )
}
