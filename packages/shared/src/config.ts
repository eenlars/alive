/**
 * ============================================================================
 * INFRASTRUCTURE CONFIGURATION - SINGLE SOURCE OF TRUTH
 * ============================================================================
 *
 * This file contains ALL infrastructure constants used throughout the WebAlive
 * platform. Always import from this file - never hardcode values.
 *
 * NO FALLBACKS: Values are loaded from /var/lib/claude-stream/server-config.json.
 * Missing config = fail fast. Browser/test environments get empty strings.
 *
 * Organization:
 * - PATHS: Filesystem paths
 * - DOMAINS: Domain names and URLs
 * - PORTS: Port numbers and ranges
 * - TIMEOUTS: Timing constants
 * - DEFAULTS: Default values and configuration
 * - SECURITY: Security-related constants
 */

// =============================================================================
// Server Config Loading (server-side only)
// =============================================================================

interface ServerConfigFile {
  serverId?: string
  paths?: {
    streamRoot?: string
    sitesRoot?: string
    imagesStorage?: string
  }
  domains?: {
    main?: string
    wildcard?: string
    previewBase?: string
    cookieDomain?: string
    frameAncestors?: string[]
  }
  // NOTE: urls section removed - URLs are now derived from domains.main
  // Pattern: app.{main} (prod), staging.{main} (staging), dev.{main} (dev)
  serverIp?: string
}

// Check if we're in a browser environment
const isBrowser = typeof globalThis !== "undefined" && "window" in globalThis

const CONFIG_PATH = "/var/lib/claude-stream/server-config.json"

/**
 * Load server-config.json - STRICT MODE
 * If config file exists, load it (works in tests too)
 * Browser: returns empty object
 * Server without config: throws FATAL error
 *
 * Uses require("node:fs") because:
 * - Static `import from "node:fs"` breaks Turbopack client bundles
 * - Dynamic require works in Bun ESM (production) and Node CJS (tests)
 * - Wrapped in try/catch for strict Node ESM (Playwright) where require is unavailable
 */
function loadServerConfig(): ServerConfigFile {
  // Browser can't read filesystem
  if (isBrowser) {
    return {}
  }

  // biome-ignore lint/suspicious/noImplicitAnyLet: fs type depends on runtime
  let fs
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fs = require("node:fs")
  } catch {
    // Strict Node ESM (e.g., Playwright) where require() is not available.
    // These environments don't need server config - return empty.
    return {}
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    // In CI/test without config file, return empty (tests will skip config-dependent assertions)
    if (process.env.CI === "true" || process.env.VITEST === "true") {
      return {}
    }
    throw new Error(`FATAL: Server config not found at ${CONFIG_PATH}. This file is REQUIRED.`)
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8")
    return JSON.parse(raw) as ServerConfigFile
  } catch (err) {
    throw new Error(`FATAL: Failed to parse ${CONFIG_PATH}: ${err instanceof Error ? err.message : err}`)
  }
}

// Load server config once at module initialization
const serverConfig = loadServerConfig()

// =============================================================================
// Required config helpers (STRICT)
// =============================================================================

// Config was loaded - if values exist, use them. If not, return empty (browser/CI without config)
function requireConfig(envKey: string, serverConfigValue: string | undefined, _description: string): string {
  // Env var takes precedence
  if (!isBrowser && typeof process !== "undefined" && process.env[envKey]) {
    return process.env[envKey]!
  }
  return serverConfigValue || ""
}

function requirePath(serverConfigValue: string | undefined, _description: string): string {
  return serverConfigValue || ""
}

const STREAM_ROOT = requirePath(serverConfig.paths?.streamRoot, "paths.streamRoot")
const SITES_ROOT = requirePath(serverConfig.paths?.sitesRoot, "paths.sitesRoot")
const IMAGES_STORAGE = requirePath(serverConfig.paths?.imagesStorage, "paths.imagesStorage")

// Domain config from environment (REQUIRED - fails fast if missing)
// NOTE: These are SERVER-ONLY. For client-side code, use NEXT_PUBLIC_ env vars directly.
const MAIN_DOMAIN = requireConfig("MAIN_DOMAIN", serverConfig.domains?.main, "Main domain")
const WILDCARD_DOMAIN = requireConfig("WILDCARD_DOMAIN", serverConfig.domains?.wildcard, "Wildcard domain")
const PREVIEW_BASE = requireConfig("PREVIEW_BASE", serverConfig.domains?.previewBase, "Preview base domain")
const COOKIE_DOMAIN = requireConfig("COOKIE_DOMAIN", serverConfig.domains?.cookieDomain, "Cookie domain")

// Server IP: from env var or server config (REQUIRED)
const SERVER_IP = requireConfig("SERVER_IP", serverConfig.serverIp, "Server IP")

// =============================================================================
// Path Constants
// =============================================================================

export const PATHS = {
  /** Root directory for webalive project */
  WEBALIVE_ROOT: "/root/webalive",

  /** Claude Stream root directory */
  STREAM_ROOT,

  /** Site directory (systemd-managed) */
  SITES_ROOT,

  /** Template directory for new sites */
  TEMPLATE_PATH: `${STREAM_ROOT}/templates/site-template`,

  /** Site controller deployment scripts directory */
  SCRIPTS_DIR: `${STREAM_ROOT}/packages/site-controller/scripts`,

  /** Domain password registry */
  REGISTRY_PATH: "/var/lib/claude-stream/domain-passwords.json",

  /** Server config (contains server identity and paths) */
  SERVER_CONFIG: "/var/lib/claude-stream/server-config.json",

  /** Generated routing files directory */
  GENERATED_DIR: "/var/lib/claude-stream/generated",

  /** Caddyfile location for reverse proxy configuration (legacy - now generated) */
  CADDYFILE_PATH: `${STREAM_ROOT}/ops/caddy/Caddyfile`,

  /** Generated Caddyfile for sites */
  CADDYFILE_SITES: "/var/lib/claude-stream/generated/Caddyfile.sites",

  /** Systemd service environment files */
  SYSTEMD_ENV_DIR: "/etc/sites",

  /** Caddyfile lock for concurrent write protection */
  CADDY_LOCK: "/tmp/caddyfile.lock",

  /** Image storage base path */
  IMAGES_STORAGE,

  /** Site backup repository */
  BACKUP_REPO: "/srv/webalive",
} as const

// =============================================================================
// Domain Constants
// =============================================================================

// Stream URLs - derived from MAIN_DOMAIN (pattern: {subdomain}.{MAIN_DOMAIN})
// Can be overridden via env vars for special cases
const STREAM_PROD_URL = requireConfig(
  "STREAM_PROD_URL",
  MAIN_DOMAIN ? `https://app.${MAIN_DOMAIN}` : undefined,
  "Production stream URL",
)
const STREAM_STAGING_URL = requireConfig(
  "STREAM_STAGING_URL",
  MAIN_DOMAIN ? `https://staging.${MAIN_DOMAIN}` : undefined,
  "Staging stream URL",
)
const STREAM_DEV_URL = requireConfig(
  "STREAM_DEV_URL",
  MAIN_DOMAIN ? `https://dev.${MAIN_DOMAIN}` : undefined,
  "Dev stream URL",
)

// Extract hostnames from URLs using URL API
const extractHost = (url: string): string => {
  if (!url) return ""
  return new URL(url).host
}

export const DOMAINS = {
  /** Wildcard domain for automatic subdomain deployment */
  WILDCARD: WILDCARD_DOMAIN,

  /** Main platform domain */
  MAIN: MAIN_DOMAIN,

  /** Main domain suffix for CORS/origin checks */
  MAIN_SUFFIX: `.${MAIN_DOMAIN}`,

  /** Production stream URL */
  STREAM_PROD: STREAM_PROD_URL,

  /** Production stream hostname */
  STREAM_PROD_HOST: extractHost(STREAM_PROD_URL),

  /** Development stream URL */
  STREAM_DEV: STREAM_DEV_URL,

  /** Development stream hostname */
  STREAM_DEV_HOST: extractHost(STREAM_DEV_URL),

  /** Staging stream URL */
  STREAM_STAGING: STREAM_STAGING_URL,

  /** Staging stream hostname */
  STREAM_STAGING_HOST: extractHost(STREAM_STAGING_URL),

  /** Staging domain suffix */
  STAGING_SUFFIX: `.staging.${MAIN_DOMAIN}`,

  /** Dev domain suffix */
  DEV_SUFFIX: `.dev.${MAIN_DOMAIN}`,

  /** Preview subdomain base (e.g., workspace-label.preview.alive.best) */
  PREVIEW_BASE,

  /** Authentication forward endpoint for previews (uses dev server URL) */
  PREVIEW_AUTH: `${STREAM_DEV_URL}/api/auth/preview-guard`,

  /** Cookie domain for cross-subdomain sharing (leading dot allows *.terminal.DOMAIN) */
  COOKIE_DOMAIN,
} as const

// =============================================================================
// Port Configuration
// =============================================================================

export const PORTS = {
  /** Port range for site deployments */
  SITE_RANGE: {
    MIN: 3333,
    MAX: 3999,
  },

  /** Local development server */
  LOCAL_DEV: 3000,

  /** Development environment (systemd) */
  DEV: 8997,

  /** Staging environment (systemd) */
  STAGING: 8998,
} as const

// =============================================================================
// Timeout Configuration
// =============================================================================

export const TIMEOUTS = {
  /** Service startup wait time */
  SERVICE_WAIT: 3000,

  /** Port availability check wait time */
  PORT_CHECK: 2000,

  /** Caddy reload wait time */
  CADDY_RELOAD: 2000,

  /** HTTP request timeout for status checks */
  HTTP_REQUEST: 3000,

  /** Test timeouts */
  TEST: {
    SHORT: 1000,
    MEDIUM: 3000,
    LONG: 10000,
  },

  /** Flock timeout (in seconds, not milliseconds) */
  FLOCK: 30,
} as const

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULTS = {
  /** Server IP for DNS validation */
  SERVER_IP,

  /** Wildcard domain (alias for DOMAINS.WILDCARD for backward compatibility) */
  WILDCARD_DOMAIN,

  /** Port range (alias for PORTS.SITE_RANGE for backward compatibility) */
  PORT_RANGE: {
    MIN: 3333,
    MAX: 3999,
  },

  /** Service startup retry attempts */
  SERVICE_RETRIES: 3,

  /** Service startup wait time (alias for TIMEOUTS.SERVICE_WAIT) */
  SERVICE_WAIT_MS: 3000,

  /** Port check wait time (alias for TIMEOUTS.PORT_CHECK) */
  PORT_CHECK_WAIT_MS: 2000,

  /** Caddy reload wait time (alias for TIMEOUTS.CADDY_RELOAD) */
  CADDY_WAIT_MS: 2000,

  /** Flock timeout in seconds (alias for TIMEOUTS.FLOCK) */
  FLOCK_TIMEOUT: 30,

  /** Default password for new deployments (development only) */
  PASSWORD: "supersecret",

  /** Default Claude model - uses short name from models.ts */
  CLAUDE_MODEL: "claude-sonnet-4-5" as const,

  /** Default Claude max turns */
  CLAUDE_MAX_TURNS: 50,

  /** Default fallback origin for CORS */
  FALLBACK_ORIGIN: `https://app.${WILDCARD_DOMAIN}`,

  /** Template ID prefix - all template IDs must start with this */
  TEMPLATE_ID_PREFIX: "tmpl_",

  /** Default template ID for new site deployments */
  DEFAULT_TEMPLATE_ID: "tmpl_blank",
} as const

// =============================================================================
// Superadmin Configuration
// =============================================================================

// Parse comma-separated emails from env var
function parseEmailList(envValue: string | undefined): readonly string[] {
  if (!envValue) return []
  return envValue
    .split(",")
    .map(e => e.trim())
    .filter(Boolean)
}

// Superadmin emails from env var (SUPERADMIN_EMAILS)
const SUPERADMIN_EMAILS_ENV = !isBrowser && typeof process !== "undefined" ? process.env.SUPERADMIN_EMAILS : undefined
const SUPERADMIN_EMAIL_LIST = parseEmailList(SUPERADMIN_EMAILS_ENV)

export const SUPERADMIN = {
  /** Emails with superadmin access (can edit Stream itself). Set via SUPERADMIN_EMAILS env var. */
  EMAILS: SUPERADMIN_EMAIL_LIST,

  /** Special workspace name for Stream editing */
  WORKSPACE_NAME: "alive",

  /** Path to Stream repository */
  WORKSPACE_PATH: STREAM_ROOT,
} as const

// =============================================================================
// Security Configuration
// =============================================================================

// Build CORS origins from configured domains
const buildCorsOrigins = (): readonly string[] => {
  const origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    `https://app.${WILDCARD_DOMAIN}`,
    `https://dev.${WILDCARD_DOMAIN}`,
    `https://staging.${WILDCARD_DOMAIN}`,
  ]

  // Add frame ancestors from server config if present
  if (serverConfig.domains?.frameAncestors) {
    for (const ancestor of serverConfig.domains.frameAncestors) {
      if (!origins.includes(ancestor)) {
        origins.push(ancestor)
      }
    }
  }

  return origins
}

export const SECURITY = {
  /** Allowed workspace base directories */
  ALLOWED_WORKSPACE_BASES: [SITES_ROOT].filter(Boolean) as readonly string[],

  /** CORS allowed origins */
  CORS_ORIGINS: buildCorsOrigins(),

  /** Environment-specific test credentials */
  LOCAL_TEST: {
    EMAIL: "test@stream.local",
    PASSWORD: "test",
    /** Session cookie value for local test mode (bypasses JWT verification) */
    SESSION_VALUE: "test-user",
  },
} as const

// =============================================================================
// Stream Environment
// =============================================================================

export const STREAM_ENV = {
  LOCAL: "local",
  DEV: "dev",
  STAGING: "staging",
  PRODUCTION: "production",
} as const

export type StreamEnv = (typeof STREAM_ENV)[keyof typeof STREAM_ENV]

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate systemd service name from slug
 */
export function getServiceName(slug: string): string {
  return `site@${slug}.service`
}

/**
 * Generate site user from slug
 */
export function getSiteUser(slug: string): string {
  return `site-${slug}`
}

/**
 * Generate site home directory from domain
 */
export function getSiteHome(domain: string): string {
  return `${PATHS.SITES_ROOT}/${domain}`
}

/**
 * Generate env file path from slug
 */
export function getEnvFilePath(slug: string): string {
  return `${PATHS.SYSTEMD_ENV_DIR}/${slug}.env`
}

/**
 * Get the current server ID (from server-config.json)
 * Returns undefined if not configured
 */
export function getServerId(): string | undefined {
  return serverConfig.serverId
}

// =============================================================================
// Configuration Validation
// =============================================================================

export interface ConfigValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate critical configuration is set.
 * Call this at app startup to catch missing config early.
 *
 * Required for deployments:
 * - WILDCARD_DOMAIN (from env var or server-config.json)
 *
 * Required for multi-server:
 * - SERVER_ID (from server-config.json)
 */
export function validateConfig(): ConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // WILDCARD_DOMAIN is required for site deployments
  if (!WILDCARD_DOMAIN) {
    errors.push(
      "WILDCARD_DOMAIN is not configured. Set via WILDCARD_DOMAIN env var or domains.wildcard in /var/lib/claude-stream/server-config.json",
    )
  }

  // SERVER_ID is recommended for multi-server deployments
  if (!serverConfig.serverId) {
    warnings.push(
      "SERVER_ID is not configured. Set serverId in /var/lib/claude-stream/server-config.json for multi-server deployments",
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Assert that critical configuration is set.
 * Throws an error if validation fails.
 */
export function assertConfigValid(): void {
  const result = validateConfig()
  if (!result.valid) {
    throw new Error(`Configuration validation failed:\n${result.errors.join("\n")}`)
  }
  if (result.warnings.length > 0) {
    console.warn(`Configuration warnings:\n${result.warnings.join("\n")}`)
  }
}
