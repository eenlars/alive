"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface GoalState {
  goal: string // PR goal - what we're trying to achieve
  building: string // What we're building (product/feature description)
  targetUsers: string // Who are the users of this project
  actions: {
    setGoal: (goal: string) => void
    setBuilding: (building: string) => void
    setTargetUsers: (targetUsers: string) => void
    clearAll: () => void
  }
}

/**
 * Goal Store - Persisted PR goals and project context.
 *
 * skipHydration: true - Prevents automatic hydration on store creation.
 * Hydration is coordinated by HydrationManager to ensure all stores
 * hydrate together, eliminating race conditions in E2E tests.
 */
export const useGoalStore = create<GoalState>()(
  persist(
    set => ({
      goal: "",
      building: "",
      targetUsers: "",
      actions: {
        setGoal: (goal: string) => set({ goal }),
        setBuilding: (building: string) => set({ building }),
        setTargetUsers: (targetUsers: string) => set({ targetUsers }),
        clearAll: () => set({ goal: "", building: "", targetUsers: "" }),
      },
    }),
    {
      name: "goal-storage",
      partialize: state => ({ goal: state.goal, building: state.building, targetUsers: state.targetUsers }),
      skipHydration: true,
    },
  ),
)

// Atomic selectors
export const useGoal = () => useGoalStore(s => s.goal)
export const useBuilding = () => useGoalStore(s => s.building)
export const useTargetUsers = () => useGoalStore(s => s.targetUsers)
export const useGoalActions = () => useGoalStore(s => s.actions)
