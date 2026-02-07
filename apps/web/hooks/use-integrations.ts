/**
 * React hook for fetching and managing available integrations
 * Uses TanStack Query for caching and deduplication
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { type ApiError, delly, getty, postty } from "@/lib/api/api-client"
import type { Res } from "@/lib/api/schemas"
import { validateRequest } from "@/lib/api/schemas"
import { clientLogger } from "@/lib/client-error-logger"
import {
  isOAuthCallbackMessage,
  OAUTH_POPUP_HEIGHT,
  OAUTH_POPUP_POLL_INTERVAL,
  OAUTH_POPUP_WIDTH,
  OAUTH_STORAGE_KEY,
} from "@/lib/oauth/popup-constants"
import { queryKeys } from "@/lib/tanstack"

type AvailableIntegration = Res<"integrations/available">["integrations"][number]
type IntegrationsResponse = Res<"integrations/available">

interface UseIntegrationsResult {
  integrations: AvailableIntegration[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch available integrations for the current user
 * Now uses TanStack Query for caching (5 min stale time)
 */
export function useIntegrations(): UseIntegrationsResult {
  const query = useQuery<IntegrationsResponse, ApiError>({
    queryKey: queryKeys.integrations.list(),
    queryFn: () => getty("integrations/available"),
    staleTime: 5 * 60 * 1000, // 5 min - integrations don't change often
  })

  return {
    integrations: query.data?.integrations ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: async () => {
      await query.refetch()
    },
  }
}

/**
 * Hook to check connection status for a specific integration
 */
export function useIntegrationStatus(providerKey: string): {
  isConnected: boolean
  loading: boolean
} {
  const { integrations, loading } = useIntegrations()

  const integration = integrations.find(i => i.provider_key === providerKey)

  return {
    isConnected: integration?.is_connected || false,
    loading,
  }
}

/**
 * Opens OAuth flow in a popup window.
 * Falls back to redirect if popup is blocked.
 * Uses storage event listener as fallback when window.opener is lost during cross-origin OAuth redirect.
 */
function openOAuthPopup(provider: string): Promise<{ success: boolean; error?: string }> {
  return new Promise(resolve => {
    // Clear any stale localStorage value before starting
    try {
      localStorage.removeItem(OAUTH_STORAGE_KEY)
    } catch {
      // Ignore localStorage errors
    }

    const left = window.screenX + (window.outerWidth - OAUTH_POPUP_WIDTH) / 2
    const top = window.screenY + (window.outerHeight - OAUTH_POPUP_HEIGHT) / 2

    const popup = window.open(
      `/api/auth/${provider}`,
      `oauth_${provider}`,
      `width=${OAUTH_POPUP_WIDTH},height=${OAUTH_POPUP_HEIGHT},left=${left},top=${top},popup=yes`,
    )

    if (!popup) {
      // Popup blocked - fall back to redirect
      window.location.href = `/api/auth/${provider}`
      return
    }

    let resolved = false

    const cleanup = () => {
      resolved = true
      window.removeEventListener("message", handleMessage)
      window.removeEventListener("storage", handleStorageEvent)
      clearInterval(pollTimer)
      try {
        localStorage.removeItem(OAUTH_STORAGE_KEY)
      } catch {
        // Ignore
      }
    }

    const handleResult = (data: { status: string; message?: string }, source: string) => {
      console.log(`[openOAuthPopup] OAuth callback via ${source}, status:`, data.status)
      cleanup()
      popup.close()
      resolve({ success: data.status === "success", error: data.message })
    }

    // Primary: postMessage from popup
    const handleMessage = (event: MessageEvent) => {
      if (resolved) return
      if (event.origin !== window.location.origin) return
      if (isOAuthCallbackMessage(event.data) && event.data.integration === provider) {
        handleResult(event.data, "postMessage")
      }
    }

    // Fallback: storage event (fires when localStorage changes from another window)
    const handleStorageEvent = (event: StorageEvent) => {
      if (resolved) return
      if (event.key !== OAUTH_STORAGE_KEY || !event.newValue) return
      try {
        const data = JSON.parse(event.newValue)
        if (isOAuthCallbackMessage(data) && data.integration === provider) {
          handleResult(data, "storage event")
        }
      } catch {
        // Ignore parse errors
      }
    }

    window.addEventListener("message", handleMessage)
    window.addEventListener("storage", handleStorageEvent)

    // Poll only to detect if popup was closed manually (storage event doesn't fire for this)
    const pollTimer = setInterval(() => {
      if (resolved) return
      if (popup.closed) {
        // Check localStorage one more time (storage event might not fire if popup closed too fast)
        try {
          const stored = localStorage.getItem(OAUTH_STORAGE_KEY)
          if (stored) {
            const data = JSON.parse(stored)
            if (isOAuthCallbackMessage(data) && data.integration === provider) {
              handleResult(data, "localStorage (on close)")
              return
            }
          }
        } catch {
          // Ignore
        }
        console.log("[openOAuthPopup] Popup closed without result")
        cleanup()
        resolve({ success: false, error: "Authorization cancelled" })
      }
    }, OAUTH_POPUP_POLL_INTERVAL)
  })
}

/**
 * Hook to connect to an integration via popup OAuth flow
 * Automatically invalidates integrations cache on success
 */
export function useConnectIntegration(providerKey: string) {
  const queryClient = useQueryClient()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async (): Promise<boolean> => {
    setConnecting(true)
    setError(null)

    try {
      console.log(`[useConnectIntegration] Starting OAuth for ${providerKey}`)
      const result = await openOAuthPopup(providerKey)
      console.log("[useConnectIntegration] OAuth result:", result)

      if (result.success) {
        // Invalidate integrations cache to refresh the list
        queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all })
      } else if (result.error && result.error !== "Authorization cancelled") {
        setError(result.error)
        clientLogger.oauth(`OAuth connection failed for ${providerKey}`, {
          provider: providerKey,
          errorMessage: result.error,
        })
      }
      return result.success
    } catch (err) {
      console.error("[useConnectIntegration] Error:", err)
      const errorMsg = "Failed to open authorization window"
      setError(errorMsg)
      clientLogger.oauth(`OAuth popup failed for ${providerKey}`, {
        provider: providerKey,
        errorMessage: errorMsg,
        error: err,
      })
      return false
    } finally {
      setConnecting(false)
    }
  }, [providerKey, queryClient])

  return {
    connect,
    connecting,
    error,
  }
}

/**
 * Hook to disconnect from an integration
 * Uses TanStack mutation with automatic cache invalidation
 */
export function useDisconnectIntegration(providerKey: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation<Res<"integrations/disconnect">, ApiError, void>({
    mutationFn: () => delly("integrations/disconnect", undefined, `/api/integrations/${providerKey}`),
    onSuccess: () => {
      // Invalidate integrations cache to refresh
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all })
    },
    onError: err => {
      clientLogger.integration(`Disconnect failed for ${providerKey}`, {
        provider: providerKey,
        errorMessage: err.message,
      })
    },
  })

  return {
    disconnect: mutation.mutateAsync,
    disconnecting: mutation.isPending,
    error: mutation.error?.message ?? null,
  }
}

/**
 * Hook to connect to an integration using a Personal Access Token (PAT)
 * Uses TanStack mutation with automatic cache invalidation
 */
export function useConnectWithPat(providerKey: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation<Res<"integrations/connect">, ApiError, string>({
    mutationFn: async (token: string) => {
      const validated = validateRequest("integrations/connect", { token })
      return postty("integrations/connect", validated, undefined, `/api/integrations/${providerKey}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all })
    },
    onError: err => {
      clientLogger.integration(`PAT connection failed for ${providerKey}`, {
        provider: providerKey,
        errorMessage: err.message,
      })
    },
  })

  const connectWithPat = useCallback(
    async (token: string): Promise<{ success: boolean; username?: string }> => {
      try {
        const result = await mutation.mutateAsync(token)
        return { success: true, username: result.username }
      } catch {
        return { success: false }
      }
    },
    [mutation],
  )

  return {
    connectWithPat,
    connecting: mutation.isPending,
    error: mutation.error?.message ?? null,
    clearError: useCallback(() => mutation.reset(), [mutation]),
  }
}
