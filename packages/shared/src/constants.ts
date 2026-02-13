/**
 * Shared Constants - Single Source of Truth
 *
 * These constants are used across all packages in the monorepo.
 * DO NOT duplicate these values anywhere else.
 */

/**
 * Cookie Names
 *
 * Used for session management across the application.
 * Both frontend (apps/web) and backend tools (packages/tools) use these.
 */
export const COOKIE_NAMES = {
  SESSION: "auth_session_v2", // v2: changed sameSite from "none" to "lax" for mobile Safari ITP
  MANAGER_SESSION: "manager_session",
} as const

/**
 * Session Configuration
 */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

/**
 * Free Credits - Single Source of Truth
 *
 * Credits given to new users when they sign up.
 * DO NOT hardcode this value anywhere else.
 */
export const FREE_CREDITS = 100

/**
 * Environment Variable Names
 *
 * Used for passing configuration to child processes and MCP tools.
 */
export const ENV_VARS = {
  STREAM_SESSION_COOKIE: "STREAM_SESSION_COOKIE",
  STREAM_SESSION_COOKIE_NAME: "STREAM_SESSION_COOKIE_NAME",
  INTERNAL_TOOLS_SECRET: "INTERNAL_TOOLS_SECRET",
} as const

/**
 * Test Configuration
 *
 * Constants for E2E test isolation and worker management.
 */
export const TEST_CONFIG = {
  PORT: 9547,
  BASE_URL: "http://localhost:9547",
  EMAIL_DOMAIN: "alive.local",
  DEFAULT_CREDITS: 1000,
  WORKER_EMAIL_PREFIX: "e2e_w", // e2e_w0@alive.local
  WORKSPACE_PREFIX: "e2e-w", // e2e-w0.alive.local
  TEST_PASSWORD: "test-password-123", // Password for all E2E test users
  JWT_SECRET: "test-jwt-secret-for-e2e-tests", // JWT secret for E2E tests (copy to .env.test from .env.test.example)
  DEFAULT_TEMPLATE_ID: "tmpl_landing", // Default template for deployment tests (must exist in Supabase)

  // Worker port configuration (single source of truth)
  // Allow env override for CI environments with port conflicts
  WORKER_PORT_BASE: Number(process.env.TEST_WORKER_PORT_BASE) || 9100, // Base port for virtual worker domains
  MAX_WORKERS: 20, // Maximum parallel Playwright workers
} as const

/**
 * Stream Stream Types - Single Source of Truth
 *
 * Event types for NDJSON streaming protocol between:
 * - Claude Agent SDK child process (producer)
 * - Stream API routes (consumer/transformer)
 * - Frontend chat page (consumer)
 *
 * All packages MUST import from here. DO NOT duplicate.
 */
export const STREAM_TYPES = {
  START: "stream_start",
  SESSION: "stream_session",
  MESSAGE: "stream_message",
  COMPLETE: "stream_complete",
  ERROR: "stream_error",
  PING: "stream_ping",
  DONE: "stream_done",
  INTERRUPT: "stream_interrupt",
} as const

export type StreamType = (typeof STREAM_TYPES)[keyof typeof STREAM_TYPES]

/**
 * Stream Synthetic Message Types
 *
 * Additional message types created by the Stream (not from SDK).
 */
export const STREAM_SYNTHETIC_MESSAGE_TYPES = {
  WARNING: "stream_warning",
} as const

/**
 * Stream Interrupt Sources
 *
 * Sources that can trigger stream interruption.
 */
export const STREAM_INTERRUPT_SOURCES = {
  HTTP_ABORT: "stream_http_abort",
  CLIENT_CANCEL: "stream_client_cancel",
} as const

/**
 * Streaming Configuration
 *
 * Controls SSE streaming behavior between server and client.
 */
export const STREAMING = {
  /**
   * Interval between heartbeat pings sent during long tool executions.
   * Prevents Cloudflare (~100s) from dropping idle SSE connections.
   * 30s gives good margin against the 100s timeout.
   */
  HEARTBEAT_INTERVAL_MS: 30_000,
} as const

/**
 * Worker Pool Configuration
 *
 * Controls the persistent worker pool for Claude Agent SDK.
 * Workers stay alive between requests for faster response times.
 */
export const WORKER_POOL = {
  /** Feature flag: Enable persistent workers (false = spawn-per-request) */
  ENABLED: true,

  /** Maximum number of workers to keep alive (~100MB memory per worker) */
  MAX_WORKERS: 20,

  /** Time in ms before idle worker is terminated */
  INACTIVITY_TIMEOUT_MS: 15 * 60 * 1000, // 15 minutes

  /** Maximum age in ms before worker is forced to restart */
  MAX_AGE_MS: 60 * 60 * 1000, // 1 hour

  /** Eviction strategy when at capacity: "lru" | "oldest" | "least_used" */
  EVICTION_STRATEGY: "lru" as const,

  /** Directory for Unix sockets */
  SOCKET_DIR: "/tmp/claude-workers",

  /** Timeout for worker to become ready (ms) */
  READY_TIMEOUT_MS: 30_000,

  /** Timeout for graceful shutdown (ms) */
  SHUTDOWN_TIMEOUT_MS: 10_000,

  /** Timeout for cancel to complete before forcing cleanup (ms)
   *  IMPORTANT: Keep this SHORT (<1s) for good UX - users shouldn't wait long after clicking Stop
   *  The SDK may block on API calls that don't respect abort signals, so we force cleanup quickly */
  CANCEL_TIMEOUT_MS: 500,

  /** Fairness: max concurrent workers attributable to a single owner/user */
  MAX_WORKERS_PER_USER: 3,

  /** Fairness: max concurrent workers for a single workspace */
  MAX_WORKERS_PER_WORKSPACE: 6,

  /** Queue limits to prevent unbounded memory growth */
  MAX_QUEUED_PER_USER: 10,
  MAX_QUEUED_PER_WORKSPACE: 20,
  MAX_QUEUED_GLOBAL: 200,

  /** CPU-aware spawning: dynamic cap = min(MAX_WORKERS, floor(cpus * WORKERS_PER_CORE)) */
  WORKERS_PER_CORE: 1.5,

  /** Load-shed threshold: stop spawning when loadavg(1m) > cpuCount * threshold */
  LOAD_SHED_THRESHOLD: 2.0,

  /** Grace period between SIGTERM and SIGKILL for worker process trees */
  KILL_GRACE_MS: 1_500,

  /** How often orphan sweeper runs */
  ORPHAN_SWEEP_INTERVAL_MS: 60_000,

  /** Kill orphaned claude-agent-sdk subprocesses older than this age */
  ORPHAN_MAX_AGE_MS: 5 * 60 * 1000,

  /**
   * PID pressure shed threshold against cgroup Task/PID limit.
   * If usage exceeds this ratio, new worker spawns are deferred.
   */
  PID_PRESSURE_THRESHOLD_RATIO: 0.85,

  /**
   * Minimum pids headroom required before allowing a new worker spawn.
   * Prevents flapping when near the process/thread limit.
   */
  PID_PRESSURE_MIN_HEADROOM: 64,

  /**
   * How often to re-check cgroup pids usage when deciding spawn behavior.
   */
  PID_PRESSURE_CHECK_INTERVAL_MS: 2_000,
} as const

/**
 * Referral System Configuration
 *
 * Used by API routes, database schema defaults, and frontend.
 * SQL schema DEFAULT values must be kept in sync manually.
 */
export const REFERRAL = {
  /** Feature flag - set to false to hide all referral UI */
  ENABLED: false,
  /** Credits awarded to both referrer and referred user */
  CREDITS: 500,
  /** Days before stored referral code expires in localStorage */
  EXPIRY_DAYS: 30,
  /** Maximum invite emails per user per day */
  EMAIL_DAILY_LIMIT: 10,
  /** Max account age (ms) to redeem referral - prevents existing user exploit */
  ACCOUNT_AGE_LIMIT_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const

/**
 * User Limits - Default quotas for site creation
 *
 * These are default values. Per-user limits are stored in app.user_quotas
 * and can be adjusted per user for upgrades/special cases.
 */
export const LIMITS = {
  /** Default maximum sites per user (across all owned organizations) */
  MAX_SITES_PER_USER: 2,
} as const

/**
 * Workspace Storage Configuration - Single Source of Truth
 *
 * Used by Zustand persist middleware in workspaceStore.ts
 * and E2E tests (fixtures.ts, helpers.ts) that need to set workspace state.
 *
 * CRITICAL: This is the ONLY place these values should be defined.
 * If you change the storage format, update both WORKSPACE_STORAGE and
 * the migration logic in workspaceStore.ts.
 */
export const WORKSPACE_STORAGE = {
  /** localStorage key for workspace state */
  KEY: "workspace-storage",
  /** Current schema version - increment when changing state structure */
  VERSION: 4,
} as const

/**
 * Workspace Storage State Types
 *
 * Matches the Zustand persist partialize output in workspaceStore.ts
 */
export interface WorkspaceStorageRecentItem {
  domain: string
  lastAccessed: number
  orgId: string
}

export interface WorkspaceStorageState {
  currentWorkspace: string | null
  selectedOrgId: string | null
  recentWorkspaces: WorkspaceStorageRecentItem[]
  currentWorktreeByWorkspace: Record<string, string | null>
}

export interface WorkspaceStorageValue {
  state: WorkspaceStorageState
  version: number
}

/**
 * Create a properly typed workspace storage value for localStorage
 *
 * Use this in E2E tests to set workspace state without fragile raw object manipulation.
 *
 * @example
 * ```typescript
 * import { WORKSPACE_STORAGE, createWorkspaceStorageValue } from "@webalive/shared"
 *
 * await page.evaluate(
 *   ({ key, value }) => localStorage.setItem(key, value),
 *   {
 *     key: WORKSPACE_STORAGE.KEY,
 *     value: createWorkspaceStorageValue("example.com", "org-123"),
 *   }
 * )
 * ```
 */
export function createWorkspaceStorageValue(workspace: string, orgId: string | null): string {
  const storageValue: WorkspaceStorageValue = {
    state: {
      currentWorkspace: workspace,
      selectedOrgId: orgId,
      recentWorkspaces: [],
      currentWorktreeByWorkspace: {},
    },
    version: WORKSPACE_STORAGE.VERSION,
  }
  return JSON.stringify(storageValue)
}

/**
 * Preview Navigation Messages - Single Source of Truth
 *
 * PostMessage types used for communication between preview iframes
 * and the Sandbox component. Used by:
 * - Go preview-proxy script injection (apps/preview-proxy)
 * - Vite plugin in site template (templates/site-template)
 * - Sandbox components (apps/web/features/chat/components)
 */
export const PREVIEW_MESSAGES = {
  /** Sent when navigation starts (before page unloads) */
  NAVIGATION_START: "preview-navigation-start",
  /** Sent when navigation completes (with new path) */
  NAVIGATION: "preview-navigation",
} as const

/**
 * Feature Flag Definition
 */
export interface FeatureFlagDefinition {
  /** Default value when no override is set */
  defaultValue: boolean
  /** Human-readable description for admin UI */
  description: string
  /** If true, only superadmins can see and toggle this flag */
  superadminOnly?: boolean
}

/**
 * Feature Flags - Single Source of Truth
 *
 * Central configuration for feature toggles across the application.
 * Admin users can override these per-account via Settings > Flags.
 */
export const FEATURE_FLAGS = {
  /**
   * Agent Supervisor - Analyze conversation progress and suggest next action.
   * When enabled and a PR goal is set, uses askAIFull + Groq to evaluate
   * progress and suggest the optimal next message after Claude completes.
   */
  AGENT_SUPERVISOR: {
    defaultValue: false,
    description: "Agent Supervisor: Analyze progress and suggest next actions",
  },

  /**
   * Tabs - Multiple conversation tabs per workspace.
   * Enabled by default. Shows a tab bar allowing users to work on
   * multiple conversations simultaneously within a tabgroup.
   */
  TABS: {
    defaultValue: true,
    description: "Tabs: Multiple conversation tabs per workspace",
  },

  /**
   * Drive - File manager panel in the sandbox.
   * Disabled by default. When enabled, shows the Drive panel option
   * in the sandbox view switcher for browsing and uploading files.
   */
  DRIVE: {
    defaultValue: false,
    description: "Drive: File manager panel for browsing and uploading files",
    superadminOnly: true,
  },

  /**
   * Worktrees - Git worktree switching per workspace.
   * Disabled by default. Superadmin-only toggle.
   * When enabled, shows the worktree switcher in the workspace info bar.
   */
  WORKTREES: {
    defaultValue: false,
    description: "Worktrees: Git worktree switching per workspace",
    superadminOnly: true,
  },
} as const satisfies Record<string, FeatureFlagDefinition>

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS

/**
 * Store Storage Keys - Single Source of Truth
 *
 * localStorage keys for all Zustand persisted stores.
 * Used by E2E tests to inject deterministic state.
 *
 * CRITICAL: Keep these in sync with the store definitions in apps/web/lib/stores/
 */
export const STORE_STORAGE_KEYS = {
  WORKSPACE: "workspace-storage",
  MESSAGE: "claude-messages-v4",
  /** @deprecated Use TAB_DATA and TAB_VIEW instead */
  TAB: "claude-tabs-v1",
  /** Tab data store (localStorage) - shared tab history */
  TAB_DATA: "claude-tab-data",
  /** Tab view store (sessionStorage) - per-browser-tab UI state */
  TAB_VIEW: "claude-tab-view",
  LLM: "alive-llm-settings-v2",
  DEBUG: "alive-debug-view-v6",
  FEATURE_FLAG: "feature-flag-overrides-v1",
  SESSION: "claude-session-storage",
  GOAL: "goal-storage",
  ONBOARDING: "onboarding-storage",
  DEPLOY: "deploy-storage",
  USER: "user-store",
  USER_PROMPTS: "user-prompts-store",
} as const

/**
 * E2E Test State Builder
 *
 * Creates deterministic localStorage values for all persisted stores.
 * This eliminates implicit state and ensures tests start with known values.
 *
 * @example
 * ```typescript
 * const storageEntries = createTestStorageState({
 *   workspace: "e2e-w0.alive.local",
 *   orgId: "org-123",
 * })
 *
 * // In Playwright fixture:
 * for (const { key, value } of storageEntries) {
 *   await context.addInitScript(
 *     ({ k, v }) => localStorage.setItem(k, v),
 *     { k: key, v: value }
 *   )
 * }
 * ```
 */
export interface TestStorageStateOptions {
  /** Workspace domain (e.g., "e2e-w0.alive.local") */
  workspace: string
  /** Organization ID */
  orgId: string
  /** Optional feature flag overrides */
  featureFlags?: Partial<Record<FeatureFlagKey, boolean>>
  /** Optional debug settings override */
  debug?: {
    isDebugView?: boolean
    showSSETerminal?: boolean
    showSandbox?: boolean
  }
}

export interface StorageEntry {
  key: string
  value: string
  /** Storage type: localStorage (default) or sessionStorage */
  storage?: "localStorage" | "sessionStorage"
}

/**
 * Creates localStorage entries for all persisted stores with explicit defaults.
 *
 * This ensures E2E tests don't depend on auto-hydration timing or
 * default state that might change.
 */
export function createTestStorageState(options: TestStorageStateOptions): StorageEntry[] {
  const entries: StorageEntry[] = []

  // Workspace store (most critical - determines which site we're working on)
  entries.push({
    key: STORE_STORAGE_KEYS.WORKSPACE,
    value: createWorkspaceStorageValue(options.workspace, options.orgId),
  })

  // Debug store - explicit defaults prevent flash of wrong UI state
  entries.push({
    key: STORE_STORAGE_KEYS.DEBUG,
    value: JSON.stringify({
      state: {
        isDebugView: options.debug?.isDebugView ?? false,
        showSSETerminal: options.debug?.showSSETerminal ?? false,
        isSSETerminalMinimized: false,
        showSandbox: options.debug?.showSandbox ?? false,
        isSandboxMinimized: false,
        sandboxWidth: null,
      },
    }),
  })

  // Feature flags - explicit empty overrides (use defaults)
  entries.push({
    key: STORE_STORAGE_KEYS.FEATURE_FLAG,
    value: JSON.stringify({
      state: {
        overrides: options.featureFlags ?? {},
      },
    }),
  })

  // Goal store - explicit empty state
  entries.push({
    key: STORE_STORAGE_KEYS.GOAL,
    value: JSON.stringify({
      state: {
        goal: "",
        building: "",
        targetUsers: "",
      },
    }),
  })

  // Onboarding store - explicit empty state
  entries.push({
    key: STORE_STORAGE_KEYS.ONBOARDING,
    value: JSON.stringify({
      state: {
        siteIdea: "",
        templateId: null,
      },
    }),
  })

  // Session store - let it initialize naturally (workspace-specific)
  // Don't inject this - the app creates sessions as needed

  // Deploy store - explicit empty state
  entries.push({
    key: STORE_STORAGE_KEYS.DEPLOY,
    value: JSON.stringify({
      state: {
        domain: "",
        history: [],
      },
      version: 1,
    }),
  })

  // LLM store - use defaults (apiKey empty, model default)
  // Message store - don't inject (conversation-specific)

  // Tab data store - inject a default tab for the workspace
  // This is CRITICAL for E2E tests - without a tab, sessionReady is false
  // and data-chat-ready will never become "true"
  const tabId = crypto.randomUUID()
  const tabGroupId = crypto.randomUUID()
  entries.push({
    key: STORE_STORAGE_KEYS.TAB_DATA,
    value: JSON.stringify({
      state: {
        tabsByWorkspace: {
          [options.workspace]: [
            {
              id: tabId,
              tabGroupId: tabGroupId,
              name: "Tab 1",
              tabNumber: 1,
              createdAt: Date.now(),
            },
          ],
        },
      },
      version: 1,
    }),
  })

  // Tab view store - set the active tab for this workspace
  // Uses sessionStorage for per-browser-tab isolation
  entries.push({
    key: STORE_STORAGE_KEYS.TAB_VIEW,
    value: JSON.stringify({
      state: {
        activeTabByWorkspace: {
          [options.workspace]: tabId,
        },
        tabsExpandedByWorkspace: {
          [options.workspace]: true,
        },
      },
      version: 1,
    }),
    storage: "sessionStorage",
  })

  return entries
}
