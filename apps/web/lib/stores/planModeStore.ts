"use client"

import { create } from "zustand"

/**
 * Plan Mode Store
 *
 * Controls whether Claude operates in "plan mode" (permissionMode: 'plan')
 * where it can only read/explore but not execute tools that modify files.
 *
 * In plan mode:
 * - Claude can Read, Glob, Grep (explore codebase)
 * - Claude CANNOT Write, Edit, Bash (no modifications)
 * - Claude writes a plan to .claude/plan.md
 * - Use ExitPlanMode tool to signal plan completion
 */

interface PlanModeState {
  /** Whether plan mode is enabled (default: false) */
  planMode: boolean
}

interface PlanModeActions {
  actions: {
    /** Enable plan-only mode */
    enablePlanMode: () => void
    /** Disable plan mode (back to normal execution) */
    disablePlanMode: () => void
    /** Toggle plan mode on/off */
    togglePlanMode: () => void
  }
}

export type PlanModeStore = PlanModeState & PlanModeActions

const usePlanModeStoreBase = create<PlanModeStore>()(set => ({
  planMode: false, // Default: plan mode OFF
  actions: {
    enablePlanMode: () => set({ planMode: true }),
    disablePlanMode: () => set({ planMode: false }),
    togglePlanMode: () => set(state => ({ planMode: !state.planMode })),
  },
}))

// Atomic selectors
export const usePlanMode = () => usePlanModeStoreBase(state => state.planMode)
export const usePlanModeActions = () => usePlanModeStoreBase(state => state.actions)

// Direct store access for non-React contexts
export const getPlanModeState = () => usePlanModeStoreBase.getState()
