"use client"

import { create } from "zustand"
import { resetPostHogIdentity } from "@/lib/posthog"

/**
 * Auth Store - Manages authentication state and session expiry
 *
 * This store is the single source of truth for auth status across the app.
 * It handles:
 * - Session expiry detection (401 errors)
 * - Preventing infinite modal loops (acknowledgment pattern)
 * - Clean redirect to login when needed
 *
 * ## Usage
 *
 * ```tsx
 * // In API calls or hooks
 * import { useAuthActions } from "@/lib/stores/authStore"
 *
 * const { handleSessionExpired } = useAuthActions()
 *
 * if (response.status === 401) {
 *   handleSessionExpired()
 *   return
 * }
 *
 * // In components
 * import { useAuthStatus, useIsSessionExpired } from "@/lib/stores/authStore"
 *
 * const isExpired = useIsSessionExpired()
 * if (isExpired) {
 *   return <SessionExpiredModal />
 * }
 * ```
 */

export type AuthStatus =
  | "unknown" // Initial state, not yet checked
  | "authenticated" // Valid session
  | "session_expired" // Session was valid but expired (401)
  | "unauthenticated" // No session at all

interface AuthState {
  status: AuthStatus
  sessionExpiredAt: number | null
  expiredReason: string | null
}

interface AuthActions {
  actions: {
    /**
     * Mark session as authenticated (successful API call)
     */
    setAuthenticated: () => void

    /**
     * Handle 401 error - marks session as expired
     * Call this from any API hook/function that gets a 401
     */
    handleSessionExpired: (reason?: string) => void

    /**
     * User acknowledges expiry and redirects to login
     * This is the ONLY way to clear session_expired state
     */
    redirectToLogin: () => void

    /**
     * Reset auth state (e.g., after successful login)
     */
    reset: () => void
  }
}

type AuthStore = AuthState & AuthActions

const useAuthStoreBase = create<AuthStore>()((set, _get) => {
  const actions: AuthActions["actions"] = {
    setAuthenticated: () => {
      set({
        status: "authenticated",
        sessionExpiredAt: null,
        expiredReason: null,
      })
    },

    handleSessionExpired: (reason?: string) => {
      set(state => {
        // Only transition to expired if not already expired
        // Prevents multiple 401s from resetting the timestamp
        if (state.status === "session_expired") {
          return state
        }

        console.warn("[AuthStore] Session expired:", reason || "401 Unauthorized")

        return {
          status: "session_expired",
          sessionExpiredAt: Date.now(),
          expiredReason: reason || "Your session has expired. Please log in again.",
        }
      })
    },

    redirectToLogin: () => {
      // Clear PostHog identity before redirect
      resetPostHogIdentity()

      // Clear state before redirect
      set({
        status: "unauthenticated",
        sessionExpiredAt: null,
        expiredReason: null,
      })

      // Redirect to login page
      if (typeof window !== "undefined") {
        window.location.href = "/?reason=session_expired"
      }
    },

    reset: () => {
      set({
        status: "unknown",
        sessionExpiredAt: null,
        expiredReason: null,
      })
    },
  }

  return {
    status: "unknown",
    sessionExpiredAt: null,
    expiredReason: null,
    actions,
  }
})

// Atomic selectors
export const useAuthStatus = () => useAuthStoreBase(state => state.status)
export const useIsSessionExpired = () => useAuthStoreBase(state => state.status === "session_expired")
export const useSessionExpiredReason = () => useAuthStoreBase(state => state.expiredReason)
export const useSessionExpiredAt = () => useAuthStoreBase(state => state.sessionExpiredAt)

// Actions hook - stable reference
export const useAuthActions = () => useAuthStoreBase(state => state.actions)

// Direct store access for non-React contexts (API utilities)
export const authStore = {
  getState: () => useAuthStoreBase.getState(),
  handleSessionExpired: (reason?: string) => useAuthStoreBase.getState().actions.handleSessionExpired(reason),
  setAuthenticated: () => useAuthStoreBase.getState().actions.setAuthenticated(),
}
