/**
 * Claude Bridge Environments Configuration
 *
 * ⚠️  SINGLE SOURCE OF TRUTH for environment configuration
 *
 * All environment-specific values (ports, domains, process names, etc.) are defined here.
 * This is the source of truth - TypeScript application code imports directly from this file.
 * A JSON artifact (packages/shared/environments.json) is generated for Bash script consumption.
 *
 * Usage:
 *   - TypeScript: import { environments, Environment } from '@webalive/shared/environments'
 *   - Direct access: environments.dev.port, environments.production.processName
 */

import { PATHS } from "./config.js"

export type EnvironmentKey = "production" | "staging" | "dev"

export interface Environment {
  // Identification
  key: EnvironmentKey
  displayName: string
  prefix: string

  // Network
  port: number
  domain: string
  cdnDomain?: string
  subdomain?: string

  // Processes
  processName: string
  serverScript: string
  serviceType?: string
  systemdService?: string

  // Paths
  buildPath?: string
  workspacePath: string

  // Flags
  isProduction: boolean
  hasHotReload: boolean

  // Commands
  deployCommand: string
  logsCommand: string
  restartCommand: string
}

/**
 * Environment configurations - SINGLE SOURCE OF TRUTH
 *
 * When updating: Run `bun run build:libs` to regenerate packages/shared/environments.json
 * for Bash script consumption.
 */
export const environments: Record<EnvironmentKey, Environment> = {
  production: {
    key: "production",
    displayName: "Production",
    prefix: "production",
    port: 9000,
    domain: "terminal.goalive.nl",
    processName: "alive-production",
    serviceType: "systemd",
    systemdService: "alive-production.service",
    serverScript: ".builds/production/current/standalone/apps/web/server.js",
    buildPath: ".builds/production",
    workspacePath: PATHS.SITES_ROOT,
    isProduction: true,
    hasHotReload: false,
    deployCommand: "make wash-skip",
    logsCommand: "journalctl -u alive-production.service -f",
    restartCommand: "systemctl restart alive-production.service",
  },
  staging: {
    key: "staging",
    displayName: "Staging",
    prefix: "staging",
    port: 8998,
    domain: "staging.terminal.goalive.nl",
    processName: "alive-staging",
    serviceType: "systemd",
    systemdService: "alive-staging.service",
    serverScript: ".builds/staging/current/standalone/apps/web/server.js",
    buildPath: ".builds/staging",
    workspacePath: PATHS.SITES_ROOT,
    isProduction: false,
    hasHotReload: false,
    deployCommand: "make staging",
    logsCommand: "journalctl -u alive-staging.service -f",
    restartCommand: "systemctl restart alive-staging.service",
  },
  dev: {
    key: "dev",
    displayName: "Development",
    prefix: "dev",
    port: 8997,
    domain: "dev.terminal.goalive.nl",
    processName: "alive-dev",
    serviceType: "systemd",
    systemdService: "alive-dev.service",
    serverScript: "node_modules/.bin/next",
    workspacePath: PATHS.SITES_ROOT,
    isProduction: false,
    hasHotReload: true,
    deployCommand: "make dev",
    logsCommand: "journalctl -u alive-dev.service -f",
    restartCommand: "systemctl restart alive-dev.service",
  },
}

/**
 * Get environment by key
 */
export function getEnvironment(key: EnvironmentKey): Environment {
  const env = environments[key]
  if (!env) {
    throw new Error(`Unknown environment: ${key}`)
  }
  return env
}

/**
 * Get all environments as array
 */
export function getAllEnvironments(): Environment[] {
  return Object.values(environments)
}

/**
 * Get environment by port
 */
export function getEnvironmentByPort(port: number): Environment | undefined {
  return getAllEnvironments().find(e => e.port === port)
}

/**
 * Get environment by process name
 */
export function getEnvironmentByProcessName(name: string): Environment | undefined {
  return getAllEnvironments().find(e => e.processName === name)
}

/**
 * Get environment by domain
 */
export function getEnvironmentByDomain(domain: string): Environment | undefined {
  return getAllEnvironments().find(e => e.domain === domain || e.cdnDomain === domain)
}

/**
 * Validation
 */
function validateEnvironments() {
  const allEnvs = getAllEnvironments()

  // Check for duplicate ports
  const ports = allEnvs.map(e => e.port)
  if (new Set(ports).size !== ports.length) {
    throw new Error("Duplicate ports in environment configuration")
  }

  // Check for duplicate process names
  const processNames = allEnvs.map(e => e.processName)
  if (new Set(processNames).size !== processNames.length) {
    throw new Error("Duplicate process names in environment configuration")
  }

  // Check for valid ports
  if (allEnvs.some(e => e.port < 1024 || e.port > 65535)) {
    throw new Error("Invalid port range (must be 1024-65535)")
  }

  // Check exactly one production
  const prodCount = allEnvs.filter(e => e.isProduction).length
  if (prodCount !== 1) {
    throw new Error(`Must have exactly 1 production environment, found ${prodCount}`)
  }
}

validateEnvironments()
