import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"
import { useAppHydrated } from "@/lib/stores/HydrationBoundary"
import { buildWorkspaceKey } from "@/features/workspace/lib/worktree-utils"
import { useCurrentWorkspace, useCurrentWorktree, useWorkspaceActions } from "@/lib/stores/workspaceStore"

interface UseWorkspaceOptions {
  redirectOnMissing?: string | null
  allowEmpty?: boolean
  /** If true, auto-select the most recently accessed workspace when none is selected */
  autoSelect?: boolean
}

interface UseWorkspaceReturn {
  workspace: string | null
  worktree: string | null
  workspaceKey: string | null
  isTerminal: boolean
  mounted: boolean
  setWorkspace: (workspace: string, orgId?: string) => void
  setWorktree: (worktree: string | null) => void
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
  const { setCurrentWorkspace, setCurrentWorktree, autoSelectWorkspace } = useWorkspaceActions()
  const worktree = useCurrentWorktree(workspace)
  const workspaceKey = buildWorkspaceKey(workspace, worktree)

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

  const setWorktree = useCallback(
    (newWorktree: string | null) => {
      if (!workspace) return
      setCurrentWorktree(workspace, newWorktree)
    },
    [setCurrentWorktree, workspace],
  )

  return {
    workspace,
    worktree,
    workspaceKey,
    isTerminal: true, // Always terminal mode now
    mounted,
    setWorkspace,
    setWorktree,
  }
}
