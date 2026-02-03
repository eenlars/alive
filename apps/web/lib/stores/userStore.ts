import { createJSONStorage, persist } from "zustand/middleware"
import { createStore } from "zustand/vanilla"
import type { TokensAPIResponse } from "@/lib/api/types"

/**
 * User Store - Centralized user data (credits, email, workspace)
 *
 * Uses vanilla store pattern for SSR-safety with Provider initialization
 * Persists email & phone to localStorage for user convenience
 */

export interface UserState {
  // Credits & tokens
  credits: number | null
  tokens: number | null
  creditsLoading: boolean
  creditsError: string | null
  creditsFetchedWorkspace: string | null // Track workspace to avoid re-fetching unnecessarily

  // Account info
  email: string
  phoneNumber: string
}

export interface UserActions {
  // Credits
  setCredits: (credits: number, tokens: number) => void
  setCreditsLoading: (loading: boolean) => void
  setCreditsError: (error: string | null) => void
  fetchCredits: (workspace: string) => Promise<void>

  // Account
  setEmail: (email: string) => void
  setPhoneNumber: (phoneNumber: string) => void
  clearAccount: () => void

  // Reset
  reset: () => void
}

export type UserStore = UserState & { actions: UserActions }

export const defaultInitState: UserState = {
  credits: null,
  tokens: null,
  creditsLoading: false,
  creditsError: null,
  creditsFetchedWorkspace: null,
  email: "",
  phoneNumber: "",
}

export const createUserStore = (initState: UserState = defaultInitState) => {
  return createStore<UserStore>()(
    persist(
      (set, get) => ({
        ...initState,
        actions: {
          // Credits
          setCredits: (credits: number, tokens: number) => {
            set({ credits, tokens, creditsError: null })
          },

          setCreditsLoading: (loading: boolean) => {
            set({ creditsLoading: loading })
          },

          setCreditsError: (error: string | null) => {
            set({ creditsError: error, creditsLoading: false })
          },

          fetchCredits: async (workspace: string) => {
            const state = get()

            // Skip if already loading
            if (state.creditsLoading) return

            // Skip if already fetched for this workspace (no need to refetch same workspace)
            // unless there's an error (user wants to retry)
            if (state.creditsFetchedWorkspace === workspace && !state.creditsError) return

            set({ creditsLoading: true, creditsError: null })

            try {
              const response = await fetch("/api/tokens", {
                credentials: "include",
                headers: {
                  "X-Workspace": workspace,
                },
              })

              const data = (await response.json()) as TokensAPIResponse

              if (!data.ok) {
                throw new Error(data.error)
              }

              set({
                credits: data.credits,
                tokens: data.tokens,
                creditsLoading: false,
                creditsError: null,
                creditsFetchedWorkspace: workspace,
              })
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Failed to fetch credits"
              set({
                creditsError: errorMessage,
                creditsLoading: false,
                creditsFetchedWorkspace: workspace,
              })
              console.error("[UserStore] Failed to fetch credits:", error)
            }
          },

          // Account
          setEmail: (email: string) => {
            set({ email: email.trim() })
          },

          setPhoneNumber: (phoneNumber: string) => {
            set({ phoneNumber: phoneNumber.trim() })
          },

          clearAccount: () => {
            set({ email: "", phoneNumber: "" })
          },

          // Reset
          reset: () => {
            set(defaultInitState)
          },
        },
      }),
      {
        name: "user-store",
        storage: createJSONStorage(() => {
          // Client-only: localStorage
          if (typeof window === "undefined") return undefined as any
          return localStorage
        }),
        // Only persist email & phone (not credits/tokens - those come from API)
        partialize: state => ({
          email: state.email,
          phoneNumber: state.phoneNumber,
        }),
      },
    ),
  )
}
