/**
 * Centralized storage keys for Zustand persist stores
 *
 * All localStorage/sessionStorage keys used by the application should be defined here
 * to prevent typos and make it easy to see all persisted state at a glance.
 */

// Tab store keys (split architecture for parallel tab isolation)
export const TAB_DATA_STORAGE_KEY = "claude-tab-data" as const
export const TAB_VIEW_STORAGE_KEY = "claude-tab-view" as const

// Legacy tab store key (for migration only)
export const TAB_LEGACY_STORAGE_KEY = "claude-tab-storage" as const
export const TAB_MIGRATION_FLAG_KEY = "claude-tab-migration-v1-done" as const

// LLM store keys
export const LLM_STORAGE_KEY = "llm-config" as const
export const API_KEY_STORAGE_KEY = "llm-api-key-obf" as const

// Auth store key
export const AUTH_STORAGE_KEY = "claude-bridge-auth" as const

// Workspace store key
export const WORKSPACE_STORAGE_KEY = "workspace-store" as const

// Debug store key
export const DEBUG_STORAGE_KEY = "debug-store" as const

// Feature flags store key
export const FEATURE_FLAGS_STORAGE_KEY = "feature-flags-store" as const

// Goal store key
export const GOAL_STORAGE_KEY = "goal-store" as const

// Type for all storage keys (useful for cleanup utilities)
export type StorageKey =
  | typeof TAB_DATA_STORAGE_KEY
  | typeof TAB_VIEW_STORAGE_KEY
  | typeof TAB_LEGACY_STORAGE_KEY
  | typeof LLM_STORAGE_KEY
  | typeof API_KEY_STORAGE_KEY
  | typeof AUTH_STORAGE_KEY
  | typeof WORKSPACE_STORAGE_KEY
  | typeof DEBUG_STORAGE_KEY
  | typeof FEATURE_FLAGS_STORAGE_KEY
  | typeof GOAL_STORAGE_KEY
