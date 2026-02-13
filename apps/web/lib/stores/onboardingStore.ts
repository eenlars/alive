"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface OnboardingState {
  // User selections
  siteIdea: string
  templateId: string | null

  // Actions
  setSiteIdea: (idea: string) => void
  setTemplateId: (templateId: string | null) => void
  reset: () => void
}

const initialState: Pick<OnboardingState, "siteIdea" | "templateId"> = {
  siteIdea: "",
  templateId: null,
}

/**
 * Onboarding Store - User selections during site creation flow.
 *
 * skipHydration: true - Prevents automatic hydration on store creation.
 * Hydration is coordinated by HydrationManager to ensure all stores
 * hydrate together, eliminating race conditions in E2E tests.
 */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    set => ({
      ...initialState,

      setSiteIdea: (idea: string) => set({ siteIdea: idea }),
      setTemplateId: (templateId: string | null) => set({ templateId }),
      reset: () => set(initialState),
    }),
    {
      name: "onboarding-storage",
      skipHydration: true,
    },
  ),
)

// Atomic selector hooks
export const useSiteIdea = () => useOnboardingStore(state => state.siteIdea)
export const useTemplateId = () => useOnboardingStore(state => state.templateId)
export const useOnboardingActions = () =>
  useOnboardingStore(state => ({
    setSiteIdea: state.setSiteIdea,
    setTemplateId: state.setTemplateId,
    reset: state.reset,
  }))
