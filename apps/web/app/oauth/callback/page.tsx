/**
 * OAuth Callback Page
 *
 * Handles OAuth callback results:
 * - In popup: posts message to opener, then closes
 * - Not in popup: redirects to /chat with params (shows toast there)
 */

"use client"

import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"
import { clientLogger } from "@/lib/client-error-logger"
import {
  OAUTH_CALLBACK_MESSAGE_TYPE,
  OAUTH_POPUP_CLOSE_DELAY,
  OAUTH_STORAGE_KEY,
  type OAuthCallbackMessage,
} from "@/lib/oauth/popup-constants"

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function OAuthCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const integration = searchParams.get("integration") || ""
  const status = searchParams.get("status") as "success" | "error" | null
  const message = searchParams.get("message")

  useEffect(() => {
    const hasOpener = window.opener && !window.opener.closed
    console.log("[OAuthCallback] hasOpener:", hasOpener, "integration:", integration, "status:", status)

    // Log OAuth errors to centralized error system for debugging
    if (status === "error" && message) {
      clientLogger.oauth(`OAuth callback error for ${integration}`, {
        provider: integration,
        errorMessage: message,
        hasOpener,
      })
    }

    const callbackMessage: OAuthCallbackMessage = {
      type: OAUTH_CALLBACK_MESSAGE_TYPE,
      integration,
      status: status || "error",
      message: message || undefined,
    }

    // Always write to localStorage as fallback (window.opener can be lost during cross-origin redirects)
    try {
      localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(callbackMessage))
      console.log("[OAuthCallback] Wrote to localStorage as fallback")
    } catch {
      console.warn("[OAuthCallback] Could not write to localStorage")
    }

    if (hasOpener) {
      try {
        console.log("[OAuthCallback] Posting message to opener:", callbackMessage)
        window.opener.postMessage(callbackMessage, window.location.origin)
        console.log("[OAuthCallback] Message posted successfully")
      } catch (err) {
        console.error("[OAuthCallback] Failed to post message:", err)
        // Don't redirect - localStorage fallback will handle it
      }
      setTimeout(() => window.close(), OAUTH_POPUP_CLOSE_DELAY)
    } else {
      // No opener - either popup was opened with noopener or window.opener was lost
      // Give opener a chance to read from localStorage, then close
      console.log("[OAuthCallback] No opener detected, waiting for localStorage to be read")
      setTimeout(() => window.close(), OAUTH_POPUP_CLOSE_DELAY)
    }
  }, [integration, status, message, router])

  const providerName = integration ? capitalize(integration) : "Integration"

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]">
      <div className="text-center p-8 max-w-sm">
        <StatusIcon status={status} />
        <StatusText status={status} providerName={providerName} message={message} />
        {status && (
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-4 px-4 py-2 text-xs text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
          >
            Close window
          </button>
        )}
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: "success" | "error" | null }) {
  const baseClass = "w-16 h-16 rounded-full flex items-center justify-center"

  if (status === "success") {
    return (
      <div className={`${baseClass} bg-green-100 dark:bg-green-900/30 mb-4`}>
        <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
      </div>
    )
  }
  if (status === "error") {
    return (
      <div className={`${baseClass} bg-red-100 dark:bg-red-900/30 mb-4`}>
        <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
      </div>
    )
  }
  return (
    <div className={`${baseClass} bg-black/5 dark:bg-white/5 mb-4`}>
      <Loader2 className="w-8 h-8 text-black/60 dark:text-white/60 animate-spin" />
    </div>
  )
}

function StatusText({
  status,
  providerName,
  message,
}: {
  status: "success" | "error" | null
  providerName: string
  message: string | null
}) {
  if (status === "success") {
    return (
      <>
        <h1 className="text-lg font-semibold text-black dark:text-white mb-2">{providerName} Connected</h1>
        <p className="text-sm text-black/60 dark:text-white/60">This window will close automatically.</p>
      </>
    )
  }
  if (status === "error") {
    return (
      <>
        <h1 className="text-lg font-semibold text-black dark:text-white mb-2">Connection Failed</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {message || "Something went wrong. Please try again."}
        </p>
      </>
    )
  }
  return (
    <>
      <h1 className="text-lg font-semibold text-black dark:text-white mb-2">Processing...</h1>
      <p className="text-sm text-black/60 dark:text-white/60">Completing authorization...</p>
    </>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]">
          <Loader2 className="w-8 h-8 text-black/60 dark:text-white/60 animate-spin" />
        </div>
      }
    >
      <OAuthCallbackContent />
    </Suspense>
  )
}
