/**
 * Site Controller - Shell-Operator Pattern for Website Deployment
 *
 * This package implements atomic, idempotent deployment of websites using:
 * - Node.js (Brain): Auth, DB, State, Error Handling, Orchestration
 * - Bash (Hands): Filesystem, Permissions, Users, systemd
 *
 * @packageDocumentation
 */

import { assertServerOnly } from "./guards.js"

// Prevent this package from being imported in browser environments
assertServerOnly("@webalive/site-controller", "Use @webalive/shared for constants")

export { SiteOrchestrator } from "./orchestrator.js"
export type { DeployConfig, DeployResult, DnsValidationResult, PortAssignment } from "./types.js"

// Constants - re-exported from constants.ts for browser safety
export { PATHS, DEFAULTS, DOMAINS, PORTS, TIMEOUTS, SECURITY } from "./constants.js"

// Re-export individual executors for advanced usage
export { validateDns } from "./executors/dns.js"
export { assignPort } from "./executors/port.js"
export { ensureUser } from "./executors/system.js"
export { setupFilesystem } from "./executors/filesystem.js"
export { buildSite } from "./executors/build.js"
export { startService } from "./executors/service.js"

// Caddy operations - ALL Caddy functionality centralized here
export {
  configureCaddy,
  teardown,
  reloadCaddy,
  getCaddyStatus,
  validateCaddyConfig,
  checkDomainInCaddy,
} from "./executors/caddy.js"

// Caddy types
export type {
  ConfigureCaddyParams,
  TeardownParams,
  CaddyStatus,
  CaddyValidation,
} from "./executors/caddy.js"

// Backup operations - NOT exported from main index due to Node.js dependencies
// Import directly: import { backupWebsites } from '@webalive/site-controller/dist/backup'

export { DeploymentError } from "./errors.js"
export type { DeploymentErrorCode } from "./errors.js"
