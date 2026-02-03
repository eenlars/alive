"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { CLAUDE_MODELS, type ClaudeModel, DEFAULT_MODEL, isValidClaudeModel } from "@/lib/models/claude-models"
import { validateApiKey } from "@/lib/utils/api-key-validation"
import { secureStorage } from "@/lib/utils/secure-storage"

export { CLAUDE_MODELS, DEFAULT_MODEL, type ClaudeModel }

interface LLMState {
  apiKey: string | null
  model: ClaudeModel
  error: string | null
}

// Actions interface - grouped under stable object (Guide §14.3)
interface LLMActions {
  actions: {
    setApiKey: (key: string | null) => void
    setModel: (model: ClaudeModel) => void
    setError: (error: string | null) => void
    clearApiKey: () => void
  }
}

export type LLMStore = LLMState & LLMActions

const API_KEY_STORAGE_KEY = "llm-api-key-obf"

/**
 * Persist API key to secure storage
 * Separated from store for better testability
 */
function persistApiKey(key: string): void {
  secureStorage.setItem(API_KEY_STORAGE_KEY, key)
}

/**
 * Remove API key from secure storage
 */
function removeApiKey(): void {
  secureStorage.removeItem(API_KEY_STORAGE_KEY)
}

/**
 * Load API key from secure storage
 */
function loadApiKey(): string | null {
  return secureStorage.getItem(API_KEY_STORAGE_KEY)
}

const useLLMStoreBase = create<LLMStore>()(
  persist(
    set => {
      const actions = {
        setApiKey: (key: string | null) => {
          // Handle clearing
          if (!key) {
            try {
              removeApiKey()
              set({ apiKey: null, error: null })
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Failed to clear API key"
              set({ error: errorMessage })
            }
            return
          }

          // Validate key
          const validation = validateApiKey(key)
          if (!validation.valid) {
            set({ error: validation.error ?? "Invalid API key", apiKey: null })
            return
          }

          // Persist and update state
          try {
            persistApiKey(key)
            set({ apiKey: key, error: null })
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to save API key"
            set({ error: errorMessage })
          }
        },

        setModel: (model: ClaudeModel) => {
          set({ model, error: null })
        },

        setError: (error: string | null) => {
          set({ error })
        },

        clearApiKey: () => {
          try {
            removeApiKey()
            set({ apiKey: null, error: null })
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to clear API key"
            set({ error: errorMessage })
          }
        },
      }

      return {
        apiKey: null,
        model: DEFAULT_MODEL, // Default model for credit users
        error: null,
        actions,
      }
    },
    {
      name: "llm-config",
      /**
       * skipHydration: true - Prevents automatic hydration on store creation
       *
       * HydrationManager calls rehydrate() for all persisted stores together,
       * ensuring coordinated hydration and eliminating race conditions.
       *
       * @see HydrationBoundary.tsx
       */
      skipHydration: true,
      partialize: state => ({ model: state.model }),
      /**
       * onRehydrateStorage - Called after localStorage state is merged
       *
       * IMPORTANT: Do NOT mutate state directly here. Use setState() instead.
       * Direct mutation bypasses Zustand's update path and can fail silently.
       *
       * This callback runs post-hydration to:
       * 1. Validate persisted model (reset invalid to default)
       * 2. Load API key from secure storage (separate from persist storage)
       */
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error("[LLMStore] Hydration error:", error)
          return
        }

        // Use setState for post-hydration modifications (not direct mutation)
        const currentState = useLLMStoreBase.getState()

        // Validate persisted model and reset to default if invalid
        let model = currentState.model
        if (!isValidClaudeModel(model)) {
          console.warn(`[LLMStore] Invalid model "${model}", resetting to default`)
          model = DEFAULT_MODEL
        }

        // Load API key from secure storage
        // Note: Model enforcement is handled by the backend (unrestricted users can choose any model)
        let apiKey: string | null = null
        try {
          apiKey = loadApiKey()
        } catch (err) {
          console.error("[LLMStore] Failed to load API key:", err)
        }

        // Atomic state update via setState (not mutation)
        useLLMStoreBase.setState({ model, apiKey })
        console.log("[LLMStore] Hydration complete")
      },
    },
  ),
)

// Export base store for HydrationManager (needs access to persist.rehydrate())
export { useLLMStoreBase }

// Atomic selector: API key (Guide §14.1)
export const useApiKey = () => useLLMStoreBase(state => state.apiKey)

// Atomic selector: model selection (Guide §14.1)
export const useModel = () => useLLMStoreBase(state => state.model)

// Atomic selector: error state (Guide §14.1)
export const useLLMError = () => useLLMStoreBase(state => state.error)

// Actions hook - stable reference (Guide §14.3)
export const useLLMActions = () => useLLMStoreBase(state => state.actions)

// Combined hook for components that need multiple values
// Returns flattened object with state + actions for convenience
export const useLLMStore = () => {
  const apiKey = useLLMStoreBase(state => state.apiKey)
  const model = useLLMStoreBase(state => state.model)
  const error = useLLMStoreBase(state => state.error)
  const actions = useLLMStoreBase(state => state.actions)

  return {
    apiKey,
    model,
    error,
    ...actions,
  }
}

// Direct store access for getState() calls
useLLMStore.getState = () => {
  const state = useLLMStoreBase.getState()
  return {
    ...state,
    ...state.actions,
  }
}
