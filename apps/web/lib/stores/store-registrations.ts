/**
 * Store Registrations - Centralized registration of all persisted stores
 *
 * This file imports all stores and registers them with the hydration registry.
 * Import this file once at app initialization to register all stores.
 *
 * Why a separate file:
 * - Avoids circular imports (stores don't import registry, this file does both)
 * - Single place to manage store registration order/priority
 * - Easy to see all persisted stores at a glance
 *
 * Priority levels:
 * - 10-19: Core stores (workspace, session) - must hydrate first
 * - 20-49: Data stores (messages, tabs, llm)
 * - 50-99: UI preference stores (debug, feature flags, goal)
 * - 100+: Low priority (deploy, onboarding)
 */

import { useDebugStoreBase } from "./debug-store"
import { useDeployStore } from "./deployStore"
import { useFeatureFlagStoreBase } from "./featureFlagStore"
import { useGoalStore } from "./goalStore"
import { registerStore } from "./hydration-registry"
import { useLLMStoreBase } from "./llmStore"
import { useOnboardingStore } from "./onboardingStore"
// Split tab stores for parallel browser tab isolation
import { useTabDataStore } from "./tabDataStore"
import { useTabViewStore } from "./tabViewStore"
// Import all stores that need coordinated hydration
// These imports are type-only initially, we access .persist at runtime
import { useWorkspaceStoreBase } from "./workspaceStore"

/**
 * Register all persisted stores.
 * Called once when this module is imported.
 */
function registerAllStores(): void {
  // Helper to ensure rehydrate always returns a Promise
  // (persist.rehydrate returns void | Promise<void> depending on state)
  const wrapRehydrate = (fn: () => void | Promise<void>): (() => Promise<void>) => {
    return async () => {
      await fn()
    }
  }

  // Core stores (highest priority - other stores may depend on these)
  registerStore({
    name: "workspace",
    rehydrate: wrapRehydrate(() => useWorkspaceStoreBase.persist.rehydrate()),
    hasHydrated: () => useWorkspaceStoreBase.persist.hasHydrated(),
    priority: 10,
  })

  // Data stores (medium-high priority)
  // messageStore removed - messages now stored in Dexie (IndexedDB) via dexieMessageStore

  // Tab stores are split for parallel browser tab isolation:
  // - tabData (localStorage): shared tab history across browser tabs
  // - tabView (sessionStorage): per-browser-tab UI state (active selection)
  registerStore({
    name: "tabData",
    rehydrate: wrapRehydrate(() => useTabDataStore.persist.rehydrate()),
    hasHydrated: () => useTabDataStore.persist.hasHydrated(),
    priority: 24, // Slightly before tabView since view depends on data
  })

  registerStore({
    name: "tabView",
    rehydrate: wrapRehydrate(() => useTabViewStore.persist.rehydrate()),
    hasHydrated: () => useTabViewStore.persist.hasHydrated(),
    priority: 25,
  })

  registerStore({
    name: "llm",
    rehydrate: wrapRehydrate(() => useLLMStoreBase.persist.rehydrate()),
    hasHydrated: () => useLLMStoreBase.persist.hasHydrated(),
    priority: 30,
  })

  // UI preference stores (medium priority)
  registerStore({
    name: "debug",
    rehydrate: wrapRehydrate(() => useDebugStoreBase.persist.rehydrate()),
    hasHydrated: () => useDebugStoreBase.persist.hasHydrated(),
    priority: 50,
  })

  registerStore({
    name: "featureFlag",
    rehydrate: wrapRehydrate(() => useFeatureFlagStoreBase.persist.rehydrate()),
    hasHydrated: () => useFeatureFlagStoreBase.persist.hasHydrated(),
    priority: 55,
  })

  registerStore({
    name: "goal",
    rehydrate: wrapRehydrate(() => useGoalStore.persist.rehydrate()),
    hasHydrated: () => useGoalStore.persist.hasHydrated(),
    priority: 60,
  })

  // Low priority stores (deploy, onboarding - not needed for chat)
  registerStore({
    name: "deploy",
    rehydrate: wrapRehydrate(() => useDeployStore.persist.rehydrate()),
    hasHydrated: () => useDeployStore.persist.hasHydrated(),
    priority: 100,
  })

  registerStore({
    name: "onboarding",
    rehydrate: wrapRehydrate(() => useOnboardingStore.persist.rehydrate()),
    hasHydrated: () => useOnboardingStore.persist.hasHydrated(),
    priority: 105,
  })

  console.log("[StoreRegistrations] All 9 stores registered for coordinated hydration")
}

// Auto-register when this module is imported
registerAllStores()

// Export for explicit initialization if needed
export { registerAllStores }
