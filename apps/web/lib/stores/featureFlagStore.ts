"use client"

import { FEATURE_FLAGS, type FeatureFlagKey } from "@webalive/shared"
import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * Feature flag overrides stored per-user in localStorage.
 * undefined = use global default from FEATURE_FLAGS
 */
type FeatureFlagOverrides = Partial<Record<FeatureFlagKey, boolean>>

interface FeatureFlagState {
  overrides: FeatureFlagOverrides
}

interface FeatureFlagActions {
  actions: {
    /** Set an override for a flag. Pass null to reset to default. */
    setOverride: (flag: FeatureFlagKey, value: boolean | null) => void
    /** Clear all overrides, reset to defaults */
    clearAllOverrides: () => void
  }
}

export type FeatureFlagStore = FeatureFlagState & FeatureFlagActions

/**
 * Feature Flag Store
 *
 * Stores per-user overrides for feature flags.
 * Admin users can toggle flags in Settings > Flags tab.
 *
 * Resolution: user override > global default
 *
 * skipHydration: true - Prevents automatic hydration on store creation.
 * Hydration is coordinated by HydrationManager to ensure all stores
 * hydrate together, eliminating race conditions in E2E tests.
 */
export const useFeatureFlagStoreBase = create<FeatureFlagStore>()(
  persist(
    set => {
      const actions = {
        setOverride: (flag: FeatureFlagKey, value: boolean | null) =>
          set(state => {
            const newOverrides = { ...state.overrides }
            if (value === null) {
              // Reset to default by removing the override
              delete newOverrides[flag]
            } else {
              newOverrides[flag] = value
            }
            return { overrides: newOverrides }
          }),
        clearAllOverrides: () => set({ overrides: {} }),
      }
      return {
        overrides: {},
        actions,
      }
    },
    {
      name: "feature-flag-overrides-v1",
      partialize: state => ({ overrides: state.overrides }),
      skipHydration: true,
    },
  ),
)

// Actions hook - stable reference
export const useFeatureFlagActions = () => useFeatureFlagStoreBase(state => state.actions)

// Get all overrides (for admin UI)
export const useFeatureFlagOverrides = () => useFeatureFlagStoreBase(state => state.overrides)

/**
 * Get effective value of a feature flag.
 * Resolves: user override > global default
 */
export function useFeatureFlag(flag: FeatureFlagKey): boolean {
  const overrides = useFeatureFlagStoreBase(state => state.overrides)
  const override = overrides[flag]

  // If override exists, use it; otherwise use global default
  if (override !== undefined) {
    return override
  }

  return FEATURE_FLAGS[flag].defaultValue
}

/**
 * Check if a flag has a user override (vs using default)
 */
export function useHasOverride(flag: FeatureFlagKey): boolean {
  const overrides = useFeatureFlagStoreBase(state => state.overrides)
  return overrides[flag] !== undefined
}

/**
 * Get all feature flag keys
 */
export function getFeatureFlagKeys(): FeatureFlagKey[] {
  return Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]
}
