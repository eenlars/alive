"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { CLAUDE_MODELS, type ClaudeModel, DEFAULT_MODEL, isValidClaudeModel } from "@/lib/models/claude-models"

export { CLAUDE_MODELS, DEFAULT_MODEL, type ClaudeModel }

interface LLMState {
  model: ClaudeModel
}

// Actions interface - grouped under stable object (Guide §14.3)
interface LLMActions {
  actions: {
    setModel: (model: ClaudeModel) => void
  }
}

export type LLMStore = LLMState & LLMActions

const useLLMStoreBase = create<LLMStore>()(
  persist(
    set => {
      const actions = {
        setModel: (model: ClaudeModel) => {
          set({ model })
        },
      }

      return {
        model: DEFAULT_MODEL, // Default model for credit users
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
      // onRehydrateStorage: validate persisted model after hydration.
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

        // Atomic state update via setState (not mutation)
        useLLMStoreBase.setState({ model })
        console.log("[LLMStore] Hydration complete")
      },
    },
  ),
)

// Export base store for HydrationManager (needs access to persist.rehydrate())
export { useLLMStoreBase }

// Atomic selector: model selection (Guide §14.1)
export const useModel = () => useLLMStoreBase(state => state.model)

// Actions hook - stable reference (Guide §14.3)
export const useLLMActions = () => useLLMStoreBase(state => state.actions)

// Combined hook for components that need multiple values
// Returns flattened object with state + actions for convenience
export const useLLMStore = () => {
  const model = useLLMStoreBase(state => state.model)
  const actions = useLLMStoreBase(state => state.actions)

  return {
    model,
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
