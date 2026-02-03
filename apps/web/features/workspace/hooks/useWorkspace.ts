import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"
import { useAppHydrated } from "@/lib/stores/HydrationBoundary"
import { useCurrentWorkspace, useWorkspaceActions } from "@/lib/stores/workspaceStore"

interface UseWorkspaceOptions {
  redirectOnMissing?: string | null
  allowEmpty?: boolean
  /** If true, auto-select the most recently accessed workspace when none is selected */
  autoSelect?: boolean
}

interface UseWorkspaceReturn {
  workspace: string | null
  isTerminal: boolean
  mounted: boolean
  setWorkspace: (workspace: string, orgId?: string) => void
}

/**
 * Hook for accessing and managing the current workspace.
 *
 * Uses the workspaceStore as the single source of truth.
 * The workspace is persisted to localStorage and survives browser restarts.
 */
export function useWorkspace(options: UseWorkspaceOptions = {}): UseWorkspaceReturn {
  const { redirectOnMissing = "/", allowEmpty = false, autoSelect = true } = options
  const router = useRouter()
  const hasAttemptedAutoSelect = useRef(false)

  // Read from store (single source of truth)
  const workspace = useCurrentWorkspace()
  const hasHydrated = useAppHydrated()
  const { setCurrentWorkspace, autoSelectWorkspace } = useWorkspaceActions()

  // Derive mounted directly from hasHydrated - no extra state/render cycle
  const mounted = hasHydrated

  // Auto-select workspace after hydration (runs once)
  useEffect(() => {
    if (!hasHydrated || hasAttemptedAutoSelect.current) return
    hasAttemptedAutoSelect.current = true

    // Only auto-select if enabled and no workspace is currently selected
    if (autoSelect && !workspace) {
      autoSelectWorkspace()
    }
  }, [hasHydrated, workspace, autoSelect, autoSelectWorkspace])

  // Handle redirect separately (side effect only)
  useEffect(() => {
    if (!hasHydrated) return
    if (!workspace && !allowEmpty && redirectOnMissing) {
      router.push(redirectOnMissing)
    }
  }, [hasHydrated, workspace, allowEmpty, redirectOnMissing, router])

  const setWorkspace = useCallback(
    (newWorkspace: string, orgId?: string) => {
      setCurrentWorkspace(newWorkspace, orgId)
    },
    [setCurrentWorkspace],
  )

  return {
    workspace,
    isTerminal: true, // Always terminal mode now
    mounted,
    setWorkspace,
  }
}
