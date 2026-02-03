"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import { createUserStore, type UserState, type UserStore } from "@/lib/stores/userStore"

export type UserStoreApi = ReturnType<typeof createUserStore>

const UserStoreContext = createContext<UserStoreApi | undefined>(undefined)

export interface UserStoreProviderProps {
  children: ReactNode
  /** Initial state (SSR-safe) */
  initialState?: Partial<UserState>
}

export function UserStoreProvider({ children, initialState }: UserStoreProviderProps) {
  const storeRef = useRef<UserStoreApi | undefined>(undefined)

  if (!storeRef.current) {
    storeRef.current = createUserStore({
      ...initialState,
    } as UserState)
  }

  return <UserStoreContext.Provider value={storeRef.current}>{children}</UserStoreContext.Provider>
}

export function useUserStore<T>(selector: (store: UserStore) => T): T {
  const ctx = useContext(UserStoreContext)
  if (!ctx) throw new Error("useUserStore must be used within UserStoreProvider")
  return useStore(ctx, selector)
}

// ============================================================================
// Atomic selector hooks (follow Zustand best practices)
// ============================================================================

/** Credits balance (user-facing value) */
export const useCredits = () => useUserStore(s => s.credits)

/** Tokens balance (backend value) */
export const useTokens = () => useUserStore(s => s.tokens)

/** Credits loading state */
export const useCreditsLoading = () => useUserStore(s => s.creditsLoading)

/** Credits error */
export const useCreditsError = () => useUserStore(s => s.creditsError)

/** Email address */
export const useEmail = () => useUserStore(s => s.email)

/** Phone number */
export const usePhoneNumber = () => useUserStore(s => s.phoneNumber)

/** All actions (stable reference - won't cause re-renders) */
export const useUserActions = () => useUserStore(s => s.actions)
