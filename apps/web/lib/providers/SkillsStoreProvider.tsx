"use client"

import { createContext, type ReactNode, useContext, useEffect, useRef } from "react"
import { useStore } from "zustand"
import { createSkillsStore, type SkillsState, type SkillsStore, type Skill } from "@/lib/stores/skillsStore"

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
      globalSkills: [],
      userSkills: [],
      isLoading: false,
      error: null,
      lastFetched: null,
      ...initialState,
    } as SkillsState)
  }

  // Auto-fetch global skills on mount
  useEffect(() => {
    storeRef.current?.getState().actions.loadGlobalSkills()
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

/** All skills merged (global + user, with user overrides) */
export const useAllSkills = (): Skill[] => {
  const globalSkills = useSkillsStore(s => s.globalSkills)
  const userSkills = useSkillsStore(s => s.userSkills)

  // Merge: user skills override global skills with same id
  const skillMap = new Map<string, Skill>()
  for (const skill of globalSkills) {
    skillMap.set(skill.id, skill)
  }
  for (const skill of userSkills) {
    skillMap.set(skill.id, skill)
  }

  return Array.from(skillMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** Global skills only */
export const useGlobalSkills = () => useSkillsStore(s => s.globalSkills)

/** User skills only */
export const useUserSkills = () => useSkillsStore(s => s.userSkills)

/** Loading state */
export const useSkillsLoading = () => useSkillsStore(s => s.isLoading)

/** Error state */
export const useSkillsError = () => useSkillsStore(s => s.error)

/** All actions (stable reference - won't cause re-renders) */
export const useSkillsActions = () => useSkillsStore(s => s.actions)

// ============================================================================
// Legacy compatibility exports
// ============================================================================

/**
 * @deprecated Use useAllSkills instead
 * Provides backward compatibility for existing code using useUserPrompts
 */
export const useUserPrompts = useAllSkills

/**
 * @deprecated Use useSkillsActions instead
 * Provides backward compatibility for existing code
 */
export const useUserPromptsActions = () => {
  const actions = useSkillsActions()
  return {
    addPrompt: (_promptType: string, data: string, displayName: string, userFacingDescription?: string) => {
      actions.addUserSkill({
        displayName,
        description: userFacingDescription || displayName,
        prompt: data,
      })
    },
    updatePrompt: (id: string, data: string, displayName: string, userFacingDescription?: string) => {
      actions.updateUserSkill(id, {
        displayName,
        description: userFacingDescription,
        prompt: data,
      })
    },
    removePrompt: (id: string) => {
      actions.removeUserSkill(id)
    },
    reset: () => {
      actions.resetUserSkills()
    },
  }
}
