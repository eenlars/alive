/**
 * Hydration Registry - Central coordination for all persisted Zustand stores
 *
 * This module provides:
 * 1. A registration system for stores (no hardcoded lists)
 * 2. Promise-based readiness (not boolean flags)
 * 3. Per-store timing metrics for debugging
 *
 * Usage:
 * 1. Each store registers itself via registerStore()
 * 2. HydrationManager calls hydrateAll() once on mount
 * 3. Tests await window.__E2E__.appReady promise
 *
 * @see docs/architecture/e2e-hydration-architecture.md
 */

/**
 * Store descriptor for registration
 */
export interface StoreDescriptor {
  /** Unique name for logging/debugging */
  name: string
  /** Function to trigger rehydration */
  rehydrate: () => Promise<void>
  /** Check if store has completed hydration */
  hasHydrated: () => boolean
  /** Priority (lower = hydrates first). Default: 100 */
  priority?: number
}

/**
 * E2E Metrics exposed on window.__E2E__
 */
export interface E2EReadiness {
  /** Resolves when all stores are hydrated */
  appReady: Promise<void>
  /** Resolves when chat-specific invariants are satisfied */
  chatReady: Promise<void>
  /** Timing marks for debugging */
  marks: {
    hydrationStart?: number
    hydrationEnd?: number
    appReady?: number
    chatReady?: number
  }
  /** Per-store timing */
  stores: Record<
    string,
    {
      hydrationStart?: number
      hydrationEnd?: number
      durationMs?: number
      error?: string
    }
  >
  /** Total hydration duration */
  totalDurationMs?: number
}

// Global type declaration
declare global {
  interface Window {
    __APP_HYDRATED__?: boolean
    __E2E_APP_READY__?: boolean
    __E2E__?: E2EReadiness
    PLAYWRIGHT_TEST?: boolean
  }
}

// Registry state
const registeredStores = new Map<string, StoreDescriptor>()
let hydrationPromise: Promise<void> | null = null
let hydrationResolve: (() => void) | null = null
let chatReadyResolve: (() => void) | null = null
let isHydrated = false

/**
 * Register a persisted store for coordinated hydration.
 *
 * Call this at module load time (not in components).
 * Stores with lower priority hydrate first.
 *
 * @example
 * ```typescript
 * // In workspaceStore.ts
 * registerStore({
 *   name: 'workspace',
 *   rehydrate: () => useWorkspaceStoreBase.persist.rehydrate(),
 *   hasHydrated: () => useWorkspaceStoreBase.persist.hasHydrated(),
 *   priority: 10, // High priority - other stores may depend on it
 * })
 * ```
 */
export function registerStore(descriptor: StoreDescriptor): void {
  if (registeredStores.has(descriptor.name)) {
    console.warn(`[HydrationRegistry] Store "${descriptor.name}" already registered, skipping`)
    return
  }
  registeredStores.set(descriptor.name, {
    ...descriptor,
    priority: descriptor.priority ?? 100,
  })
}

/**
 * Get all registered stores sorted by priority
 */
export function getRegisteredStores(): StoreDescriptor[] {
  return Array.from(registeredStores.values()).sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
}

/**
 * Check if all stores have completed hydration
 */
export function isAllHydrated(): boolean {
  return isHydrated
}

/**
 * Get the app ready promise (for tests)
 */
export function getAppReadyPromise(): Promise<void> {
  if (!hydrationPromise) {
    // Create promise that will be resolved when hydration completes
    hydrationPromise = new Promise(resolve => {
      hydrationResolve = resolve
      // If already hydrated, resolve immediately
      if (isHydrated) {
        resolve()
      }
    })
  }
  return hydrationPromise
}

/**
 * Hydrate all registered stores in priority order.
 *
 * Called once by HydrationManager on mount.
 * Returns a promise that resolves when all stores are hydrated.
 */
export async function hydrateAll(): Promise<void> {
  const stores = getRegisteredStores()
  const isE2E = typeof window !== "undefined" && window.PLAYWRIGHT_TEST === true

  // Initialize E2E metrics
  const metrics: E2EReadiness = {
    appReady: getAppReadyPromise(),
    chatReady: new Promise(resolve => {
      chatReadyResolve = resolve
    }),
    marks: {},
    stores: {},
  }

  if (isE2E && typeof window !== "undefined") {
    window.__E2E__ = metrics
    metrics.marks.hydrationStart = performance.now()
  }

  // Hydrate all stores in parallel (they're independent after skipHydration)
  const results = await Promise.allSettled(
    stores.map(async store => {
      const storeMetrics: { hydrationStart: number; hydrationEnd: number; durationMs: number; error?: string } = {
        hydrationStart: 0,
        hydrationEnd: 0,
        durationMs: 0,
      }

      if (isE2E) {
        storeMetrics.hydrationStart = performance.now()
        metrics.stores[store.name] = storeMetrics
      }

      try {
        if (!store.hasHydrated()) {
          await store.rehydrate()
        }

        if (isE2E) {
          storeMetrics.hydrationEnd = performance.now()
          storeMetrics.durationMs = storeMetrics.hydrationEnd - storeMetrics.hydrationStart
        }

        return { name: store.name, success: true }
      } catch (error) {
        console.error(`[HydrationRegistry] Failed to hydrate ${store.name}:`, error)
        if (isE2E) {
          storeMetrics.error = String(error)
        }
        return { name: store.name, success: false, error }
      }
    }),
  )

  // Check for failures
  const failures = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success))
  if (failures.length > 0) {
    console.warn(`[HydrationRegistry] ${failures.length} stores failed to hydrate`)
  }

  // Mark hydration complete
  isHydrated = true

  if (isE2E && typeof window !== "undefined") {
    metrics.marks.hydrationEnd = performance.now()
    metrics.marks.appReady = performance.now()
    metrics.totalDurationMs = metrics.marks.hydrationEnd - (metrics.marks.hydrationStart || 0)
  }

  // Set legacy flags for backwards compatibility
  if (typeof window !== "undefined") {
    window.__APP_HYDRATED__ = true
    window.__E2E_APP_READY__ = true
    document.documentElement.dataset.e2eReady = "1"
  }

  // Resolve the app ready promise
  if (hydrationResolve) {
    hydrationResolve()
  }

  // Chat ready is satisfied when app is ready (could add more invariants here)
  if (chatReadyResolve) {
    if (isE2E && typeof window !== "undefined" && window.__E2E__) {
      window.__E2E__.marks.chatReady = performance.now()
    }
    chatReadyResolve()
  }
}

/**
 * Reset registry state (for testing)
 */
export function resetRegistry(): void {
  registeredStores.clear()
  hydrationPromise = null
  hydrationResolve = null
  chatReadyResolve = null
  isHydrated = false
}
