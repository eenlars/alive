"use client"

/**
 * Workspace Preferences Sync
 *
 * Handles syncing workspace preferences between local storage and server.
 * This enables cross-device sync of:
 * - Current workspace selection
 * - Selected organization
 * - Recent workspaces
 *
 * Sync strategy:
 * - On page load: Fetch from server if local is empty OR server is newer
 * - On change: Debounced upload to server (2s delay)
 * - Conflict resolution: Server wins for initial load, local wins during session
 */

import { COOKIE_NAMES } from "@webalive/shared"
import { useWorkspaceStoreBase } from "./workspaceStore"

// =============================================================================
// Configuration
// =============================================================================

const SYNC_DEBOUNCE_MS = 2000
const SYNC_STORAGE_KEY = "workspace-preferences-sync-timestamp"

// =============================================================================
// Types
// =============================================================================

interface RecentWorkspace {
  domain: string
  orgId: string
  lastAccessed: number
}

interface ServerPreferences {
  currentWorkspace: string | null
  selectedOrgId: string | null
  recentWorkspaces: RecentWorkspace[]
  updatedAt: string | null
}

// =============================================================================
// State
// =============================================================================

let syncTimeout: ReturnType<typeof setTimeout> | null = null
let isSyncing = false
let _lastSyncedAt: number | null = null

// =============================================================================
// Helpers
// =============================================================================

/** Check if user has an auth session cookie (client-side) */
function hasAuthCookie(): boolean {
  if (typeof document === "undefined") return false
  return document.cookie.split(";").some(c => c.trim().startsWith(`${COOKIE_NAMES.SESSION}=`))
}

// =============================================================================
// Fetch from Server
// =============================================================================

/**
 * Fetch preferences from server and merge with local state.
 * Called on app initialization.
 *
 * Strategy:
 * - If local state is empty, use server state
 * - If server has newer data (based on timestamp), merge intelligently
 * - Current workspace: use server if local is null
 * - Recent workspaces: merge both, dedupe by domain+orgId
 */
export async function syncFromServer(): Promise<boolean> {
  if (typeof window === "undefined") return false
  if (isSyncing) return false
  if (!hasAuthCookie()) return false

  try {
    isSyncing = true

    const response = await fetch("/api/user/preferences", {
      credentials: "include",
    })

    if (!response.ok) {
      if (response.status === 401) return false
      console.error("[workspace-sync] Failed to fetch preferences:", response.status)
      return false
    }

    const server: ServerPreferences = await response.json()
    const store = useWorkspaceStoreBase.getState()

    // If server has no data, nothing to sync
    if (!server.updatedAt) {
      // Upload local state to server if we have any
      if (store.currentWorkspace || store.recentWorkspaces.length > 0) {
        void syncToServer()
      }
      return false
    }

    const _serverTime = new Date(server.updatedAt).getTime()
    const localSyncTime = getLastSyncTime()

    // If we synced recently and have local changes, don't overwrite
    if (localSyncTime && Date.now() - localSyncTime < 60000) {
      return false
    }

    // Merge strategy
    let didUpdate = false

    // Current workspace: use server if local is null
    if (!store.currentWorkspace && server.currentWorkspace) {
      useWorkspaceStoreBase.setState({ currentWorkspace: server.currentWorkspace })
      didUpdate = true
    }

    // Selected org: use server if local is null
    if (!store.selectedOrgId && server.selectedOrgId) {
      useWorkspaceStoreBase.setState({ selectedOrgId: server.selectedOrgId })
      didUpdate = true
    }

    // Recent workspaces: merge and dedupe
    if (server.recentWorkspaces.length > 0) {
      const merged = mergeRecentWorkspaces(store.recentWorkspaces, server.recentWorkspaces)
      if (merged.length !== store.recentWorkspaces.length) {
        useWorkspaceStoreBase.setState({ recentWorkspaces: merged })
        didUpdate = true
      }
    }

    setLastSyncTime(Date.now())
    return didUpdate
  } catch (error) {
    console.error("[workspace-sync] Error fetching preferences:", error)
    return false
  } finally {
    isSyncing = false
  }
}

// =============================================================================
// Sync to Server (Debounced)
// =============================================================================

/**
 * Queue a sync to server (debounced).
 * Called whenever local state changes.
 */
export function queueSyncToServer(): void {
  if (typeof window === "undefined") return

  if (syncTimeout) {
    clearTimeout(syncTimeout)
  }

  syncTimeout = setTimeout(() => {
    void syncToServer()
  }, SYNC_DEBOUNCE_MS)
}

/**
 * Immediately sync current state to server.
 */
async function syncToServer(): Promise<void> {
  if (typeof window === "undefined") return
  if (isSyncing) return
  if (!hasAuthCookie()) return

  try {
    isSyncing = true
    const store = useWorkspaceStoreBase.getState()

    const response = await fetch("/api/user/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        currentWorkspace: store.currentWorkspace,
        selectedOrgId: store.selectedOrgId,
        recentWorkspaces: store.recentWorkspaces,
      }),
    })

    if (!response.ok) {
      console.error("[workspace-sync] Failed to sync preferences:", response.status)
      return
    }

    setLastSyncTime(Date.now())
  } catch (error) {
    console.error("[workspace-sync] Error syncing preferences:", error)
  } finally {
    isSyncing = false
  }
}

// =============================================================================
// Helpers
// =============================================================================

function mergeRecentWorkspaces(local: RecentWorkspace[], server: RecentWorkspace[]): RecentWorkspace[] {
  const byKey = new Map<string, RecentWorkspace>()

  // Add server workspaces first
  for (const ws of server) {
    byKey.set(`${ws.domain}::${ws.orgId}`, ws)
  }

  // Local takes precedence (newer)
  for (const ws of local) {
    const key = `${ws.domain}::${ws.orgId}`
    const existing = byKey.get(key)
    if (!existing || ws.lastAccessed > existing.lastAccessed) {
      byKey.set(key, ws)
    }
  }

  // Sort by lastAccessed descending
  return Array.from(byKey.values()).sort((a, b) => b.lastAccessed - a.lastAccessed)
}

function getLastSyncTime(): number | null {
  if (typeof localStorage === "undefined") return null
  const stored = localStorage.getItem(SYNC_STORAGE_KEY)
  return stored ? parseInt(stored, 10) : null
}

function setLastSyncTime(time: number): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(SYNC_STORAGE_KEY, String(time))
  _lastSyncedAt = time
}

// =============================================================================
// Export for testing
// =============================================================================

export const __testing = {
  mergeRecentWorkspaces,
  getLastSyncTime,
  setLastSyncTime,
}
