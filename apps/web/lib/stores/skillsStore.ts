import { createJSONStorage, persist } from "zustand/middleware"
import { createStore } from "zustand/vanilla"
import type { SkillListItem, SkillSource } from "@alive-brug/tools"

/**
 * Skills Store - Unified store for global and user skills
 *
 * Skills come from two sources:
 * 1. Global skills: Loaded from API (/api/skills/list), read-only
 * 2. User skills: Created by user, stored in localStorage
 *
 * Uses vanilla store pattern for SSR-safety with Provider initialization
 */

/**
 * Skill structure for the store
 * Compatible with both global (from API) and user-created skills
 */
export interface Skill {
  /** Unique ID (e.g., "revise-code" or "user-123456") */
  id: string
  /** Human-readable display name */
  displayName: string
  /** Short description for UI */
  description: string
  /** Full prompt text to prepend to message */
  prompt: string
  /** Source: "global" (from API), "user" (localStorage), "project" (workspace) */
  source: SkillSource
  /** Creation timestamp (user skills only) */
  createdAt?: number
  /** Last update timestamp (user skills only) */
  updatedAt?: number
}

export interface SkillsState {
  /** Global skills from API (read-only) */
  globalSkills: Skill[]
  /** User-created skills (persisted to localStorage) */
  userSkills: Skill[]
  /** Loading state for global skills */
  isLoading: boolean
  /** Error message if loading failed */
  error: string | null
  /** Last time global skills were fetched */
  lastFetched: number | null
}

export interface SkillsActions {
  /** Fetch global skills from API */
  loadGlobalSkills: () => Promise<void>
  /** Add a new user skill */
  addUserSkill: (skill: Omit<Skill, "id" | "source" | "createdAt">) => void
  /** Update an existing user skill */
  updateUserSkill: (id: string, updates: Partial<Pick<Skill, "displayName" | "description" | "prompt">>) => void
  /** Remove a user skill */
  removeUserSkill: (id: string) => void
  /** Get all skills merged (user overrides global with same id) */
  getAllSkills: () => Skill[]
  /** Reset user skills */
  resetUserSkills: () => void
}

export type SkillsStore = SkillsState & { actions: SkillsActions }

export const defaultInitState: SkillsState = {
  globalSkills: [],
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
        globalSkills: initState.globalSkills,
        userSkills: initState.userSkills,
        isLoading: false,
        error: null,
        lastFetched: initState.lastFetched,

        actions: {
          loadGlobalSkills: async () => {
            // Don't refetch if we fetched recently (5 minutes)
            const state = get()
            const now = Date.now()
            if (state.lastFetched && now - state.lastFetched < 5 * 60 * 1000 && state.globalSkills.length > 0) {
              return
            }

            set({ isLoading: true, error: null })

            try {
              const response = await fetch("/api/skills/list")
              if (!response.ok) {
                throw new Error(`Failed to fetch skills: ${response.status}`)
              }

              const data = await response.json()
              const skills: Skill[] = (data.skills || []).map(apiSkillToStoreSkill)

              set({
                globalSkills: skills,
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
            // Merge: user skills override global skills with same id
            const skillMap = new Map<string, Skill>()

            // Add global skills first
            for (const skill of state.globalSkills) {
              skillMap.set(skill.id, skill)
            }

            // User skills override
            for (const skill of state.userSkills) {
              skillMap.set(skill.id, skill)
            }

            // Sort alphabetically by display name
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
        // Only persist user skills, not global skills (those come from API)
        partialize: state => ({
          userSkills: state.userSkills,
          lastFetched: state.lastFetched,
        }),
      },
    ),
  )
}
