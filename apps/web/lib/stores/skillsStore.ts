import type { SkillListItem } from "@webalive/tools"
import { createJSONStorage, persist } from "zustand/middleware"
import { createStore } from "zustand/vanilla"

/**
 * Skills Store - Unified store for superadmin and user skills
 *
 * Skills come from two sources:
 * 1. Superadmin skills: Loaded from API (/api/skills/list), superadmin-only, read-only
 * 2. User skills: Created by user, stored in localStorage
 *
 * Uses vanilla store pattern for SSR-safety with Provider initialization
 */

/**
 * Skill structure for the store.
 * Extends SkillListItem (from @webalive/tools) with optional timestamps for user-created skills.
 */
export interface Skill extends Omit<SkillListItem, "filePath"> {
  /** Creation timestamp (user skills only) */
  createdAt?: number
  /** Last update timestamp (user skills only) */
  updatedAt?: number
}

export interface SkillsState {
  /** Superadmin skills from API (read-only, only loaded for superadmins) */
  superadminSkills: Skill[]
  /** User-created skills (persisted to localStorage) */
  userSkills: Skill[]
  /** Loading state for superadmin skills */
  isLoading: boolean
  /** Error message if loading failed */
  error: string | null
  /** Last time superadmin skills were fetched */
  lastFetched: number | null
}

export interface SkillsActions {
  /** Fetch superadmin skills from API (will 403 for non-superadmins) */
  loadSuperadminSkills: () => Promise<void>
  /** Add a new user skill */
  addUserSkill: (skill: Omit<Skill, "id" | "source" | "createdAt">) => void
  /** Update an existing user skill */
  updateUserSkill: (id: string, updates: Partial<Pick<Skill, "displayName" | "description" | "prompt">>) => void
  /** Remove a user skill */
  removeUserSkill: (id: string) => void
  /** Get all skills merged (user overrides superadmin with same id) */
  getAllSkills: () => Skill[]
  /** Reset user skills */
  resetUserSkills: () => void
}

export type SkillsStore = SkillsState & { actions: SkillsActions }

export const defaultInitState: SkillsState = {
  superadminSkills: [],
  userSkills: [],
  isLoading: false,
  error: null,
  lastFetched: null,
}

/**
 * Convert API skill item to store skill
 */
function apiSkillToStoreSkill(item: SkillListItem): Skill {
  return {
    id: item.id,
    displayName: item.displayName,
    description: item.description,
    prompt: item.prompt,
    source: item.source,
  }
}

/**
 * Generate unique ID for user skills
 */
function generateSkillId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const createSkillsStore = (initState: SkillsState = defaultInitState) => {
  return createStore<SkillsStore>()(
    persist(
      (set, get) => ({
        superadminSkills: initState.superadminSkills,
        userSkills: initState.userSkills,
        isLoading: false,
        error: null,
        lastFetched: initState.lastFetched,

        actions: {
          loadSuperadminSkills: async () => {
            // Don't refetch if we fetched recently (5 minutes)
            const state = get()
            const now = Date.now()
            if (state.lastFetched && now - state.lastFetched < 5 * 60 * 1000) {
              return
            }

            set({ isLoading: true, error: null })

            try {
              const response = await fetch("/api/skills/list")
              if (response.status === 401 || response.status === 403) {
                // Not a superadmin — silently return empty
                set({ superadminSkills: [], isLoading: false, lastFetched: now })
                return
              }
              if (!response.ok) {
                throw new Error(`Failed to fetch skills: ${response.status}`)
              }

              const data = await response.json()
              const skills: Skill[] = (data.skills || []).map(apiSkillToStoreSkill)

              set({
                superadminSkills: skills,
                isLoading: false,
                lastFetched: now,
              })
            } catch (error) {
              set({
                isLoading: false,
                error: error instanceof Error ? error.message : "Failed to load skills",
              })
            }
          },

          addUserSkill: (skill: Omit<Skill, "id" | "source" | "createdAt">) => {
            const newSkill: Skill = {
              ...skill,
              id: generateSkillId(),
              source: "user",
              createdAt: Date.now(),
            }
            set(state => ({
              userSkills: [...state.userSkills, newSkill],
            }))
          },

          updateUserSkill: (id: string, updates: Partial<Pick<Skill, "displayName" | "description" | "prompt">>) => {
            set(state => ({
              userSkills: state.userSkills.map(skill =>
                skill.id === id ? { ...skill, ...updates, updatedAt: Date.now() } : skill,
              ),
            }))
          },

          removeUserSkill: (id: string) => {
            set(state => ({
              userSkills: state.userSkills.filter(skill => skill.id !== id),
            }))
          },

          getAllSkills: () => {
            const state = get()
            const skillMap = new Map<string, Skill>()

            for (const skill of state.superadminSkills) {
              skillMap.set(skill.id, skill)
            }

            // User skills override
            for (const skill of state.userSkills) {
              skillMap.set(skill.id, skill)
            }

            return Array.from(skillMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
          },

          resetUserSkills: () => {
            set({ userSkills: [] })
          },
        },
      }),
      {
        name: "skills-store",
        storage: createJSONStorage(() => {
          if (typeof window === "undefined") return undefined as any
          return localStorage
        }),
        // Only persist user skills, not superadmin skills (those come from API)
        partialize: state => ({
          userSkills: state.userSkills,
          lastFetched: state.lastFetched,
        }),
      },
    ),
  )
}
