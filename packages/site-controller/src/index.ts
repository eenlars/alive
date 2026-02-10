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

// Constants - re-exported from constants.ts for browser safety
export { DEFAULTS, DOMAINS, PATHS, PORTS, SECURITY, TIMEOUTS } from "./constants.js"
export { buildSite } from "./executors/build.js"
// Caddy types
export type {
  CaddyStatus,
  CaddyValidation,
  ConfigureCaddyParams,
  TeardownParams,
} from "./executors/caddy.js"
// Caddy operations - ALL Caddy functionality centralized here
export {
  checkDomainInCaddy,
  configureCaddy,
  getCaddyStatus,
  reloadCaddy,
  teardown,
  validateCaddyConfig,
} from "./executors/caddy.js"
// Re-export individual executors for advanced usage
export { validateDns } from "./executors/dns.js"
export { setupFilesystem } from "./executors/filesystem.js"
export { assignPort } from "./executors/port.js"
export { startService } from "./executors/service.js"
export { ensureUser } from "./executors/system.js"
export { SiteOrchestrator } from "./orchestrator.js"
export type { DeployConfig, DeployResult, DnsValidationResult, PortAssignment } from "./types.js"

// Backup operations - NOT exported from main index due to Node.js dependencies
// Import directly: import { backupWebsites } from '@webalive/site-controller/dist/backup'

export type { DeploymentErrorCode } from "./errors.js"
export { DeploymentError } from "./errors.js"
