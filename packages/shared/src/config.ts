/**
 * ============================================================================
 * INFRASTRUCTURE CONFIGURATION - SINGLE SOURCE OF TRUTH
 * ============================================================================
 *
 * This file contains ALL infrastructure constants used throughout the WebAlive
 * platform. Always import from this file - never hardcode values.
 *
 * NO FALLBACKS: Values are loaded from server-config.json (via SERVER_CONFIG_PATH env var).
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

import { parseServerConfig, type ServerConfig } from "./server-config-schema.js"

// =============================================================================
// Server Config Loading (server-side only)
// =============================================================================

// Check if we're in a browser environment
const isBrowser = typeof globalThis !== "undefined" && "window" in globalThis

/**
 * Require an environment variable to be set. Throws if missing.
 * Use in standalone scripts that need specific env vars at startup.
 */
export function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`FATAL: ${key} env var is not set.`)
  return val
}

/**
 * Path to server-config.json. Set via SERVER_CONFIG_PATH env var.
 * Exported so other packages can read the same file without hardcoding paths.
 */
export const CONFIG_PATH = !isBrowser && typeof process !== "undefined" ? (process.env.SERVER_CONFIG_PATH ?? "") : ""

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
function loadServerConfig(): Partial<ServerConfig> {
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

  if (!CONFIG_PATH) {
    // In CI/test without config, return empty (tests will skip config-dependent assertions)
    if (process.env.CI === "true" || process.env.VITEST === "true") {
      return {}
    }
    throw new Error(
      "FATAL: SERVER_CONFIG_PATH env var is not set. " + "Set it to the absolute path of your server-config.json.",
    )
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    if (process.env.CI === "true" || process.env.VITEST === "true") {
      return {}
    }
    throw new Error(`FATAL: Server config not found at ${CONFIG_PATH} (from SERVER_CONFIG_PATH env var).`)
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8")
    return parseServerConfig(raw)
  } catch (err) {
    throw new Error(`FATAL: Failed to parse ${CONFIG_PATH}: ${err instanceof Error ? err.message : err}`)
  }
}

// Load server config once at module initialization
const serverConfig = loadServerConfig()

// =============================================================================
// Required config helpers (STRICT)
// =============================================================================

// Config was loaded - if values exist, use them. If not, return empty (browser/CI without config).
// Server environments with serverId get validated by the startup block below.
function configValue(envKey: string, serverConfigValue: string | undefined): string {
  // Env var takes precedence
  if (!isBrowser && typeof process !== "undefined" && process.env[envKey]) {
    return process.env[envKey]!
  }
  return serverConfigValue ?? ""
}

function pathValue(serverConfigValue: string | undefined): string {
  return serverConfigValue ?? ""
}

const ALIVE_ROOT = pathValue(serverConfig.paths?.aliveRoot)
const SITES_ROOT = pathValue(serverConfig.paths?.sitesRoot)
const TEMPLATES_ROOT = serverConfig.paths?.templatesRoot ?? "/srv/webalive/templates"
const IMAGES_STORAGE = pathValue(serverConfig.paths?.imagesStorage)

// Domain config from environment (REQUIRED - fails fast if missing)
// NOTE: These are SERVER-ONLY. For client-side code, use apps/web/lib/config.client.ts
const MAIN_DOMAIN = configValue("MAIN_DOMAIN", serverConfig.domains?.main)
const WILDCARD_DOMAIN = configValue("WILDCARD_DOMAIN", serverConfig.domains?.wildcard)
const PREVIEW_BASE = configValue("PREVIEW_BASE", serverConfig.domains?.previewBase)
const COOKIE_DOMAIN = configValue("COOKIE_DOMAIN", serverConfig.domains?.cookieDomain)

// Server IP: from env var or server config (REQUIRED)
const SERVER_IP = configValue("SERVER_IP", serverConfig.serverIp)

// NOTE: Startup validation is now handled by Zod schema (parseServerConfig).
// When config file is present, ALL required fields are validated at parse time.

// =============================================================================
// Path Constants
// =============================================================================

export const PATHS = {
  /** Root directory for webalive project */
  WEBALIVE_ROOT: "/root/webalive",

  /** Claude Stream root directory */
  ALIVE_ROOT,

  /** Site directory (systemd-managed) */
  SITES_ROOT,

  /** Template sites root directory (e.g., /srv/webalive/templates) */
  TEMPLATES_ROOT,

  /** Template directory for new sites */
  TEMPLATE_PATH: `${ALIVE_ROOT}/templates/site-template`,

  /** Site controller deployment scripts directory */
  SCRIPTS_DIR: `${ALIVE_ROOT}/packages/site-controller/scripts`,

  /** Server config path (from SERVER_CONFIG_PATH env var) */
  SERVER_CONFIG: CONFIG_PATH,

  /** Generated routing files directory (from server-config.json, optional) */
  GENERATED_DIR: serverConfig.generated?.dir ?? "",

  /** Caddyfile location for reverse proxy configuration (legacy - now generated) */
  CADDYFILE_PATH: `${ALIVE_ROOT}/ops/caddy/Caddyfile`,

  /** Generated Caddyfile for sites (from server-config.json, optional) */
  CADDYFILE_SITES: serverConfig.generated?.caddySites ?? "",

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
const STREAM_PROD_URL = configValue("STREAM_PROD_URL", MAIN_DOMAIN ? `https://app.${MAIN_DOMAIN}` : undefined)
const STREAM_STAGING_URL = configValue("STREAM_STAGING_URL", MAIN_DOMAIN ? `https://staging.${MAIN_DOMAIN}` : undefined)
const STREAM_DEV_URL = configValue("STREAM_DEV_URL", MAIN_DOMAIN ? `https://dev.${MAIN_DOMAIN}` : undefined)

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

  /**
   * Preview subdomain prefix. Preview URLs use single-level subdomains:
   * preview--{label}.{WILDCARD_DOMAIN} (e.g., preview--protino-sonno-tech.sonno.tech)
   * Single-level keeps them under *.WILDCARD which Cloudflare Universal SSL covers.
   */
  PREVIEW_PREFIX: "preview--",

  /** Preview subdomain base (kept for backwards compatibility, equals WILDCARD) */
  PREVIEW_BASE,

  /** Authentication forward endpoint for previews (uses dev server URL) */
  PREVIEW_AUTH: `${STREAM_DEV_URL}/api/auth/preview-guard`,

  /** Cookie domain for cross-subdomain sharing (leading dot allows *.DOMAIN) */
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
  CLAUDE_MAX_TURNS: 100,

  /** Default fallback origin for CORS */
  FALLBACK_ORIGIN: `https://app.${WILDCARD_DOMAIN}`,

  /** Template ID prefix - all template IDs must start with this */
  TEMPLATE_ID_PREFIX: "tmpl_",

  /** Default template ID for new site deployments */
  DEFAULT_TEMPLATE_ID: "tmpl_blank",

  /** Automation worker HTTP port (standalone scheduler/executor process) */
  AUTOMATION_WORKER_PORT: 5070,
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
  WORKSPACE_PATH: ALIVE_ROOT,
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
  STANDALONE: "standalone",
} as const

export type StreamEnv = (typeof STREAM_ENV)[keyof typeof STREAM_ENV]

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Standalone mode configuration
 * For running Alive locally without external dependencies
 */
export const STANDALONE = {
  /** Default workspace directory relative to home */
  DEFAULT_WORKSPACE_DIR: ".alive/workspaces",
  /** Test user for auto-login in standalone mode */
  TEST_USER: {
    EMAIL: "local@standalone",
    NAME: "Local Developer",
    ID: "standalone-user-001",
  },
  /**
   * Session cookie value for standalone mode
   * INTENTIONALLY WEAK - standalone mode is for local development only
   * with no external authentication. Do not use in production.
   */
  SESSION_VALUE: "standalone-session",
} as const

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
 * Minimum requirements for a valid server ID:
 * - starts with "srv_"
 * - at least 10 characters total
 * This catches placeholder / garbage values early.
 */
const SERVER_ID_RE = /^srv_.{6,}$/

/**
 * Get the current server ID (from server-config.json)
 * Returns undefined if not configured
 */
export function getServerId(): string | undefined {
  return serverConfig.serverId
}

/**
 * Validate that the server ID looks legitimate (not a placeholder).
 * Throws a descriptive error if the value is missing or malformed.
 */
export function assertValidServerId(serverId: string | undefined): asserts serverId is string {
  if (!serverId) {
    throw new Error("serverId is not configured in server-config.json (via SERVER_CONFIG_PATH)")
  }
  if (!SERVER_ID_RE.test(serverId)) {
    throw new Error(
      `serverId "${serverId}" looks invalid (must match srv_<6+ chars>). ` +
        "Check server-config.json referenced by SERVER_CONFIG_PATH.",
    )
  }
}

/**
 * Resolve a template's local filesystem path from its DB source_path.
 *
 * Extracts the directory name (e.g. "blank.alive.best") from the DB path
 * and joins it with this server's TEMPLATES_ROOT. This way both servers
 * resolve to the correct local path without per-template config.
 *
 * Example: source_path "/srv/webalive/templates/blank.alive.best"
 *        → TEMPLATES_ROOT + "/blank.alive.best"
 *        → "/srv/webalive/templates/blank.alive.best"
 */
export function resolveTemplatePath(dbSourcePath: string): string {
  if (!TEMPLATES_ROOT) {
    throw new Error(
      "TEMPLATES_ROOT is not configured. " +
        'Set "paths.templatesRoot" in server-config.json (e.g. "/srv/webalive/templates").',
    )
  }
  const dirName = dbSourcePath.split("/").pop()
  if (!dirName || dirName === ".." || dirName === ".") {
    throw new Error(`Invalid template source_path: "${dbSourcePath}" — cannot extract directory name`)
  }
  return `${TEMPLATES_ROOT}/${dirName}`
}

// NOTE: validateConfig() and assertConfigValid() have been removed.
// All validation is now handled at parse time by the Zod schema in
// server-config-schema.ts via parseServerConfig().
