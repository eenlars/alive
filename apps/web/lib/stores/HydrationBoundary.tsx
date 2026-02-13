"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"

// Import store registrations - this triggers registration of all stores
import "./store-registrations"

// Import hydration functions from registry
import { type E2EReadiness, hydrateAll, isAllHydrated } from "./hydration-registry"
import { syncFromServer as syncWorkspacePreferences } from "./workspacePreferencesSync"

// Re-export the E2EReadiness type for external use
export type { E2EReadiness }

// For backwards compatibility - export the old name
export type E2EMetrics = E2EReadiness

// Global hydration state - shared across all components
let _appHydrated = false
const hydrationListeners = new Set<() => void>()

function setAppHydrated(value: boolean): void {
  _appHydrated = value
  // Notify all listeners
  Array.from(hydrationListeners).forEach(listener => {
    listener()
  })
}

/**
 * Hook to check if all persisted stores have hydrated.
 * Uses useSyncExternalStore for tear-safe concurrent rendering.
 *
 * @returns true when all persisted stores have completed hydration
 */
export function useAppHydrated(): boolean {
  return useSyncExternalStore(
    callback => {
      hydrationListeners.add(callback)
      return () => hydrationListeners.delete(callback)
    },
    () => _appHydrated,
    () => false, // Server always returns false
  )
}

/**
 * HydrationManager - Coordinates hydration of ALL persisted stores
 *
 * Place this component once in the root layout. It:
 * 1. Calls persist.rehydrate() for every registered store
 * 2. Waits for all stores to finish hydrating
 * 3. Sets global _appHydrated flag + window.__E2E_APP_READY__ for E2E
 * 4. Records timing metrics for E2E debugging
 *
 * Why coordinated hydration:
 * - All stores hydrate together (no partial state)
 * - Single synchronization point for tests
 * - No per-component "mounted" hacks needed
 * - Eliminates race conditions between stores
 *
 * Store registration:
 * - Stores register themselves via registerStore() in store-registrations.ts
 * - No hardcoded list - just import store-registrations to trigger registration
 * - Priority levels control hydration order (lower = first)
 *
 * @see docs/architecture/e2e-hydration-architecture.md
 */
export function HydrationManager(): null {
  const hasStarted = useRef(false)

  useEffect(() => {
    // Only run once, even in StrictMode
    if (hasStarted.current) return
    hasStarted.current = true

    // Check if already hydrated (e.g., hot reload)
    if (isAllHydrated()) {
      console.log("[HydrationManager] Already hydrated, skipping")
      setAppHydrated(true)
      return
    }

    // Delegate to hydration registry
    hydrateAll().then(async () => {
      // Sync workspace preferences from server (cross-device sync)
      // This runs after localStorage hydration so we can merge properly
      try {
        await syncWorkspacePreferences()
      } catch (error) {
        console.error("[HydrationManager] Failed to sync workspace preferences:", error)
      }
      setAppHydrated(true)
    })
  }, [])

  return null
}
