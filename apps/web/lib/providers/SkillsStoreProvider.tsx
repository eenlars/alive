"use client"

import { createContext, type ReactNode, useContext, useEffect, useRef } from "react"
import { useStore } from "zustand"
import { createSkillsStore, type Skill, type SkillsState, type SkillsStore } from "@/lib/stores/skillsStore"

export type SkillsStoreApi = ReturnType<typeof createSkillsStore>

const SkillsStoreContext = createContext<SkillsStoreApi | undefined>(undefined)

export interface SkillsStoreProviderProps {
  children: ReactNode
  /** Initial state (SSR-safe) */
  initialState?: Partial<SkillsState>
}

export function SkillsStoreProvider({ children, initialState }: SkillsStoreProviderProps) {
  const storeRef = useRef<SkillsStoreApi | undefined>(undefined)

  if (!storeRef.current) {
    storeRef.current = createSkillsStore({
      superadminSkills: [],
      userSkills: [],
      isLoading: false,
      error: null,
      lastFetched: null,
      ...initialState,
    } as SkillsState)
  }

  // Auto-fetch superadmin skills on mount (will silently return empty for non-superadmins)
  useEffect(() => {
    storeRef.current?.getState().actions.loadSuperadminSkills()
  }, [])

  return <SkillsStoreContext.Provider value={storeRef.current}>{children}</SkillsStoreContext.Provider>
}

export function useSkillsStore<T>(selector: (store: SkillsStore) => T): T {
  const ctx = useContext(SkillsStoreContext)
  if (!ctx) throw new Error("useSkillsStore must be used within SkillsStoreProvider")
  return useStore(ctx, selector)
}

// ============================================================================
// Atomic selector hooks (follow Zustand best practices)
// ============================================================================

/** All skills merged (superadmin + user, with user overrides) */
export const useAllSkills = (): Skill[] => {
  const superadminSkills = useSkillsStore(s => s.superadminSkills)
  const userSkills = useSkillsStore(s => s.userSkills)

  // Merge: user skills override superadmin skills with same id
  const skillMap = new Map<string, Skill>()
  for (const skill of superadminSkills) {
    skillMap.set(skill.id, skill)
  }
  for (const skill of userSkills) {
    skillMap.set(skill.id, skill)
  }

  return Array.from(skillMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** Superadmin skills only (empty for non-superadmins) */
export const useSuperadminSkills = () => useSkillsStore(s => s.superadminSkills)

/** User skills only */
export const useUserSkills = () => useSkillsStore(s => s.userSkills)

/** Loading state */
export const useSkillsLoading = () => useSkillsStore(s => s.isLoading)

/** Error state */
export const useSkillsError = () => useSkillsStore(s => s.error)

/** All actions (stable reference - won't cause re-renders) */
export const useSkillsActions = () => useSkillsStore(s => s.actions)
