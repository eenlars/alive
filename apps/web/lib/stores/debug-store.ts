"use client"

import { DOMAINS, SUPERADMIN } from "@webalive/shared"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useCurrentWorkspace } from "@/lib/stores/workspaceStore"

const isDev = process.env.NODE_ENV === "development"

// Check if running on dev/staging environment (client-side check)
function isDevOrStaging(): boolean {
  if (typeof window === "undefined") return false
  const hostname = window.location.hostname
  return (
    // Staging environments
    hostname === DOMAINS.STREAM_STAGING_HOST ||
    hostname.endsWith(DOMAINS.STAGING_SUFFIX) ||
    hostname.includes(".staging.") ||
    // Dev environments
    hostname === DOMAINS.STREAM_DEV_HOST ||
    hostname.endsWith(DOMAINS.DEV_SUFFIX) ||
    hostname.startsWith("dev.") ||
    // Localhost
    hostname === "localhost"
  )
}

// State interface
interface DebugState {
  isDebugView: boolean
  showSandbox: boolean
  isSandboxMinimized: boolean
  sandboxWidth: number | null // null = use default (half viewport)
}

// Actions interface - grouped under stable object (Guide §14.3)
interface DebugActions {
  actions: {
    toggleView: () => void
    toggleSandbox: () => void
    toggleSandboxMinimized: () => void
    setDebugView: (show: boolean) => void
    setSandbox: (show: boolean) => void
    setSandboxMinimized: (minimized: boolean) => void
    setSandboxWidth: (width: number) => void
  }
}

export type DebugStore = DebugState & DebugActions

/**
 * Persisted store for debug UI visibility.
 *
 * Follows Guide §14.3: actions grouped in stable object
 *
 * skipHydration: true - Prevents automatic hydration on store creation.
 * Hydration is coordinated by HydrationManager to ensure all stores
 * hydrate together, eliminating race conditions in E2E tests.
 */
export const useDebugStoreBase = create<DebugStore>()(
  persist(
    set => {
      const actions = {
        toggleView: () => set(state => ({ isDebugView: !state.isDebugView })),
        toggleSandbox: () =>
          set(state => ({
            showSandbox: !state.showSandbox,
            isSandboxMinimized: state.showSandbox ? state.isSandboxMinimized : false,
          })),
        toggleSandboxMinimized: () => set(state => ({ isSandboxMinimized: !state.isSandboxMinimized })),
        setDebugView: (show: boolean) => set({ isDebugView: show }),
        setSandbox: (show: boolean) => set({ showSandbox: show }),
        setSandboxMinimized: (minimized: boolean) => set({ isSandboxMinimized: minimized }),
        setSandboxWidth: (width: number) => set({ sandboxWidth: width }),
      }
      return {
        isDebugView: false,
        showSandbox: false,
        isSandboxMinimized: true,
        sandboxWidth: null,
        actions,
      }
    },
    {
      name: "alive-debug-view-v7",
      partialize: state => ({
        isDebugView: state.isDebugView,
        showSandbox: state.showSandbox,
        isSandboxMinimized: state.isSandboxMinimized,
        sandboxWidth: state.sandboxWidth,
      }),
      skipHydration: true,
    },
  ),
)

// Atomic selector: debug view state (Guide §14.1)
export const useDebugView = () => useDebugStoreBase(state => state.isDebugView)

// Atomic selector: Sandbox visibility (Guide §14.1)
export const useSandbox = () => useDebugStoreBase(state => state.showSandbox)

// Atomic selector: Sandbox minimized state (Guide §14.1)
export const useSandboxMinimized = () => useDebugStoreBase(state => state.isSandboxMinimized)

// Atomic selector: Sandbox width (Guide §14.1)
export const useSandboxWidth = () => useDebugStoreBase(state => state.sandboxWidth)

// Actions hook - stable reference (Guide §14.3)
export const useDebugActions = () => useDebugStoreBase(state => state.actions)

// Helper: Check if debug tools should be available
// Available in development mode OR on dev/staging environments
export function isDevelopment(): boolean {
  return isDev || isDevOrStaging()
}

/**
 * Check if debug view should be visible
 * Shows ONLY when:
 * - User explicitly enabled debug view (toggleView in UI) AND
 * - Either in local development (localhost) OR in superadmin workspace
 *
 * This ensures regular users on prod/staging never see debug UI,
 * even if running a dev build.
 */
export function useDebugVisible(): boolean {
  const debugView = useDebugView()
  const workspace = useCurrentWorkspace()
  const isSuperadminWorkspace = workspace === SUPERADMIN.WORKSPACE_NAME
  const isLocalDev = typeof window !== "undefined" && window.location.hostname === "localhost"

  // Only show if user enabled it AND (localhost OR superadmin)
  return debugView && (isLocalDev || isSuperadminWorkspace)
}
