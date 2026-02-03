"use client"

import { create } from "zustand"

/**
 * Auth Modal Store - Global state for authentication modal
 *
 * This store controls the AuthModal component, allowing it to be opened
 * from anywhere in the app (deploy flow, protected routes, etc.)
 *
 * ## Usage
 *
 * ```tsx
 * // Open modal (email-first flow)
 * const { open } = useAuthModalActions()
 * open({ onSuccess: () => router.push('/chat') })
 *
 * // Open with pre-filled email
 * open({ email: 'user@example.com', onSuccess: handleAuth })
 *
 * // Force login mode (skip email check)
 * open({ mode: 'login', email: 'user@example.com' })
 *
 * // In a component
 * const isOpen = useAuthModalIsOpen()
 * const mode = useAuthModalMode()
 * ```
 */

export type AuthModalMode =
  | "initial" // Email input only (email-first flow)
  | "login" // Email exists → show password for login
  | "signup" // Email is new → show password + optional name for signup

export interface AuthModalConfig {
  /** Pre-fill email field */
  email?: string
  /** Force a specific mode (skip email check) */
  mode?: AuthModalMode
  /** Callback when authentication succeeds */
  onSuccess?: (user: { id: string; email: string }) => void
  /** Callback when modal is closed without completing auth */
  onClose?: () => void
  /** Custom title for the modal */
  title?: string
  /** Custom description */
  description?: string
}

interface AuthModalState {
  isOpen: boolean
  mode: AuthModalMode
  email: string
  title: string | null
  description: string | null
  onSuccess: ((user: { id: string; email: string }) => void) | null
  onClose: (() => void) | null
}

interface AuthModalActions {
  actions: {
    /**
     * Open the auth modal
     * @param config - Optional configuration
     */
    open: (config?: AuthModalConfig) => void

    /**
     * Close the modal and reset state
     */
    close: () => void

    /**
     * Update the current mode (used by AuthModal internally)
     */
    setMode: (mode: AuthModalMode) => void

    /**
     * Update email (used by AuthModal internally)
     */
    setEmail: (email: string) => void

    /**
     * Call success callback and close modal
     */
    handleSuccess: (user: { id: string; email: string }) => void
  }
}

type AuthModalStore = AuthModalState & AuthModalActions

const initialState: AuthModalState = {
  isOpen: false,
  mode: "initial",
  email: "",
  title: null,
  description: null,
  onSuccess: null,
  onClose: null,
}

const useAuthModalStoreBase = create<AuthModalStore>()((set, get) => {
  const actions: AuthModalActions["actions"] = {
    open: (config?: AuthModalConfig) => {
      set({
        isOpen: true,
        mode: config?.mode || "initial",
        email: config?.email || "",
        title: config?.title || null,
        description: config?.description || null,
        onSuccess: config?.onSuccess || null,
        onClose: config?.onClose || null,
      })
    },

    close: () => {
      const { onClose } = get()
      if (onClose) {
        onClose()
      }
      set(initialState)
    },

    setMode: (mode: AuthModalMode) => {
      set({ mode })
    },

    setEmail: (email: string) => {
      set({ email })
    },

    handleSuccess: (user: { id: string; email: string }) => {
      const { onSuccess } = get()
      if (onSuccess) {
        onSuccess(user)
      }
      set(initialState)
    },
  }

  return {
    ...initialState,
    actions,
  }
})

// Atomic selectors
export const useAuthModalIsOpen = () => useAuthModalStoreBase(state => state.isOpen)
export const useAuthModalMode = () => useAuthModalStoreBase(state => state.mode)
export const useAuthModalEmail = () => useAuthModalStoreBase(state => state.email)
export const useAuthModalTitle = () => useAuthModalStoreBase(state => state.title)
export const useAuthModalDescription = () => useAuthModalStoreBase(state => state.description)

// Actions hook - stable reference
export const useAuthModalActions = () => useAuthModalStoreBase(state => state.actions)

// Direct store access for non-React contexts
export const authModalStore = {
  getState: () => useAuthModalStoreBase.getState(),
  open: (config?: AuthModalConfig) => useAuthModalStoreBase.getState().actions.open(config),
  close: () => useAuthModalStoreBase.getState().actions.close(),
}
