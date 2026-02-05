/**
 * ============================================================================
 * INFRASTRUCTURE CONFIGURATION - SINGLE SOURCE OF TRUTH
 * ============================================================================
 *
 * This file contains ALL hardcoded infrastructure constants used throughout
 * the WebAlive platform. Always import from this file - never hardcode values.
 *
 * SERVER-AGNOSTIC: Values are loaded from /var/lib/claude-stream/server-config.json
 * when running on a server. Falls back to defaults for local dev and browser.
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
  serverIp?: string
}

// Check if we're in a browser environment
const isBrowser = typeof globalThis !== "undefined" && "window" in globalThis

/**
 * Attempt to load server-config.json (server-side only)
 * Returns empty object in browser or if file doesn't exist
 */
function loadServerConfig(): ServerConfigFile {
  // Skip in browser environment
  if (isBrowser) {
    return {}
  }

  // Skip if process.env indicates we should use defaults
  if (typeof process !== "undefined" && process.env?.SKIP_SERVER_CONFIG === "true") {
    return {}
  }

  try {
    // Dynamic require to avoid bundler issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs")
    const configPath = "/var/lib/claude-stream/server-config.json"

    if (!fs.existsSync(configPath)) {
      return {}
    }

    const raw = fs.readFileSync(configPath, "utf8")
    return JSON.parse(raw) as ServerConfigFile
  } catch {
    // File doesn't exist or can't be read - use defaults
    return {}
  }
}

// Load server config once at module initialization
const serverConfig = loadServerConfig()

// Helper to get value from server config or use default
function cfg<T>(serverValue: T | undefined, defaultValue: T): T {
  return serverValue !== undefined ? serverValue : defaultValue
}

// =============================================================================
// Derived values from server config
// =============================================================================

// Environment variable helper (server-side only)
const getEnv = (key: string): string | undefined => {
  if (isBrowser || typeof process === "undefined") return undefined
  return process.env[key]
}

const STREAM_ROOT = cfg(serverConfig.paths?.streamRoot, "/root/webalive/claude-bridge")
const SITES_ROOT = cfg(serverConfig.paths?.sitesRoot, "/srv/webalive/sites")
const IMAGES_STORAGE = cfg(serverConfig.paths?.imagesStorage, "/srv/webalive/storage")

// Check if running in test environment
const isTestEnv =
  !isBrowser && typeof process !== "undefined" && (process.env.VITEST === "true" || process.env.NODE_ENV === "test")

// Helper to get required config - throws if missing on server (NO FALLBACKS)
// In browser or test env, returns empty string
function requireConfig(envKey: string, serverConfigValue: string | undefined, description: string): string {
  const value = getEnv(envKey) || serverConfigValue
  if (!value) {
    // Only throw on server runtime - browser and tests don't have access to these env vars
    if (!isBrowser && !isTestEnv) {
      throw new Error(`${description} is required. Set ${envKey} env var or configure in server-config.json`)
    }
    return ""
  }
  return value
}

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

// Stream URLs (with fallbacks for local/test environments)
// In production/staging/dev, these should be explicitly set via env vars or server-config
// For local testing, they fall back to derived URLs from WILDCARD_DOMAIN
const STREAM_PROD_URL = getEnv("STREAM_PROD_URL") || (WILDCARD_DOMAIN && `https://app.${WILDCARD_DOMAIN}`) || ""
const STREAM_STAGING_URL =
  getEnv("STREAM_STAGING_URL") || (WILDCARD_DOMAIN && `https://staging.${WILDCARD_DOMAIN}`) || ""
const STREAM_DEV_URL = getEnv("STREAM_DEV_URL") || (WILDCARD_DOMAIN && `https://dev.${WILDCARD_DOMAIN}`) || ""

// Extract hostnames from URLs using URL API for proper normalization
const extractHost = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    // Fallback for URLs without scheme
    try {
      return new URL(`https://${url}`).host
    } catch {
      return url
    }
  }
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
  PREVIEW_AUTH: STREAM_DEV_URL ? `${STREAM_DEV_URL}/api/auth/preview-guard` : "",

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
  ALLOWED_WORKSPACE_BASES: [SITES_ROOT, "/root/webalive/sites"] as readonly string[],

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
