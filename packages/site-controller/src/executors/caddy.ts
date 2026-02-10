import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { runScript } from "./common.js"

export interface ConfigureCaddyParams {
  domain: string
  port: number
  caddyfilePath: string
  caddyLockPath: string
  flockTimeout: number
}

/**
 * Configure Caddy reverse proxy for a site
 *
 * @param params - Caddy configuration parameters
 */
export async function configureCaddy(params: ConfigureCaddyParams): Promise<void> {
  await runScript("05-caddy-inject.sh", {
    SITE_DOMAIN: params.domain,
    SITE_PORT: params.port.toString(),
    CADDYFILE_PATH: params.caddyfilePath,
    CADDY_LOCK_PATH: params.caddyLockPath,
    FLOCK_TIMEOUT: params.flockTimeout.toString(),
  })
}

export interface TeardownParams {
  domain: string
  slug: string
  serviceName: string
  removeUser?: boolean
  removeFiles?: boolean
  caddyfilePath?: string
  caddyLockPath?: string
  envFilePath?: string
}

/**
 * Teardown a site (stop service, remove from Caddy, optionally remove user/files)
 *
 * @param params - Teardown parameters
 */
export async function teardown(params: TeardownParams): Promise<void> {
  const env: Record<string, string> = {
    SITE_DOMAIN: params.domain,
    SITE_SLUG: params.slug,
    SERVICE_NAME: params.serviceName,
    REMOVE_USER: params.removeUser ? "true" : "false",
    REMOVE_FILES: params.removeFiles ? "true" : "false",
  }

  if (params.caddyfilePath) env.CADDYFILE_PATH = params.caddyfilePath
  if (params.caddyLockPath) env.CADDY_LOCK_PATH = params.caddyLockPath
  if (params.envFilePath) env.ENV_FILE_PATH = params.envFilePath

  await runScript("99-teardown.sh", env)
}

/**
 * Status result for Caddy service
 */
export interface CaddyStatus {
  isActive: boolean
  status: string
  message?: string
}

/**
 * Validation result for Caddyfile
 */
export interface CaddyValidation {
  isValid: boolean
  output: string
  error?: string
}

/**
 * Check if Caddy service is active and running
 *
 * @returns Promise resolving to CaddyStatus
 */
export async function getCaddyStatus(): Promise<CaddyStatus> {
  // Check if service is active
  const isActiveResult = spawnSync("systemctl", ["is-active", "--quiet", "caddy"])
  const isActive = isActiveResult.status === 0

  // Get detailed status
  const statusResult = spawnSync("systemctl", ["status", "caddy", "--no-pager"], {
    encoding: "utf-8",
  })

  return {
    isActive,
    status: statusResult.stdout || statusResult.stderr || "",
    message: isActive ? "Caddy is running" : "Caddy is not active",
  }
}

/**
 * Reload Caddy configuration (zero-downtime)
 *
 * @throws Error if reload fails
 */
export async function reloadCaddy(): Promise<void> {
  const result = spawnSync("systemctl", ["reload", "caddy"])

  if (result.status !== 0) {
    const error = result.stderr?.toString() || result.stdout?.toString() || "Unknown error"
    throw new Error(`Failed to reload Caddy: ${error}`)
  }
}

/**
 * Validate Caddyfile syntax without applying changes
 *
 * @param caddyfilePath - Path to Caddyfile to validate
 * @returns Promise resolving to CaddyValidation
 */
export async function validateCaddyConfig(caddyfilePath: string): Promise<CaddyValidation> {
  const result = spawnSync("caddy", ["validate", "--config", caddyfilePath], {
    encoding: "utf-8",
  })

  return {
    isValid: result.status === 0,
    output: result.stdout || "",
    error: result.status !== 0 ? result.stderr : undefined,
  }
}

/**
 * Check if a domain exists in Caddyfile
 *
 * @param domain - Domain to check
 * @param caddyfilePath - Path to Caddyfile
 * @returns Promise resolving to boolean (true if domain exists)
 */
export async function checkDomainInCaddy(domain: string, caddyfilePath: string): Promise<boolean> {
  try {
    const content = await readFile(caddyfilePath, "utf-8")
    // Check for domain block (e.g., "example.com {")
    const domainBlockRegex = new RegExp(`^${domain.replace(/\./g, "\\.")} \\{`, "m")
    return domainBlockRegex.test(content)
  } catch (error) {
    throw new Error(`Failed to read Caddyfile: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}
