import { spawnSync } from "node:child_process"
import { normalize } from "node:path"

/**
 * DOMAIN VALIDATION
 * Strict regex for domain format: must start and end with alphanumeric,
 * can contain dots and hyphens in the middle.
 * Examples: example.com ✓, my-domain.co.uk ✓, test ✓
 * Rejects: -invalid ✗, example. ✗, .hidden ✗
 */
const DOMAIN_FORMAT_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/

/**
 * Validates that a string matches the domain format.
 * @param domain - String to validate
 * @returns true if valid domain format, false otherwise
 */
function isValidDomainFormat(domain: string): boolean {
  return domain ? DOMAIN_FORMAT_REGEX.test(domain) : false
}

/**
 * Helper for consistent logging with request context.
 */
function log(level: "log" | "error" | "warn", requestId: string, message: string, ...args: unknown[]): void {
  const prefix = `[install-package ${requestId}]`
  console[level](`${prefix} ${message}`, ...args)
}

/**
 * Extracts the domain/service name from a workspace root path.
 *
 * SECURITY CRITICAL: This function validates the path structure to prevent:
 * - Path traversal attacks (../ sequences)
 * - Invalid domain characters (command injection)
 * - Malformed path structures
 *
 * Examples:
 * - /srv/webalive/sites/example.com/user → example.com
 * - /srv/webalive/sites/two.goalive.nl/user → two.goalive.nl
 * - /srv/webalive/sites/test/user → test
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @returns Domain name or null if path doesn't follow expected pattern
 */
export function extractDomainFromWorkspace(workspaceRoot: string): string | null {
  // Remove trailing slashes
  const normalized = workspaceRoot.replace(/\/+$/, "")

  // SECURITY: Must be absolute path
  if (!normalized.startsWith("/")) {
    return null
  }

  // Check if path ends with /user
  if (!normalized.endsWith("/user")) {
    return null
  }

  // SECURITY: Detect path traversal attempts
  // Normalize removes .. sequences, if different then traversal was attempted
  const withoutUser = normalized.slice(0, -5) // Remove "/user"
  const normalizedPath = normalize(withoutUser)
  if (normalizedPath !== withoutUser) {
    // Path was altered by normalize - indicates .. or ./ sequences
    return null
  }

  // SECURITY: Path must match structure /[base]/webalive/sites/[domain]/user
  // Extract the part after /sites/ and before /user
  // Valid patterns:
  // - /srv/webalive/sites/example.com/user
  // - /srv/webalive/sites/example.com/user
  const sitesMatch = normalized.match(/^(\/\w+)?\/webalive\/sites\/([^/]+)\/user$/)
  if (!sitesMatch || !sitesMatch[2]) {
    return null
  }

  const domain = sitesMatch[2]

  // SECURITY: Validate domain format using shared validator
  if (!isValidDomainFormat(domain)) {
    return null
  }

  return domain
}

/**
 * Converts a domain to a systemd service name.
 *
 * SECURITY: Validates domain input to prevent malformed service names.
 * Fails safely if domain contains invalid characters.
 *
 * Examples:
 * - example.com → site@example-com.service
 * - two.goalive.nl → site@two-goalive-nl.service
 * - test → site@test.service
 *
 * @param domain - Domain name (must be alphanumeric, dots, hyphens only)
 * @returns systemd service name
 * @throws Error if domain contains invalid characters (fail-safe)
 */
export function domainToServiceName(domain: string): string {
  // SECURITY: Validate domain format before transformation
  if (!isValidDomainFormat(domain)) {
    throw new Error(`Invalid domain format: ${domain}`)
  }

  // Replace dots with hyphens for systemd naming
  const serviceName = domain.replace(/\./g, "-")
  return `site@${serviceName}.service`
}

interface RestartResult {
  success: boolean
  message: string
  details?: string
}

/**
 * Restarts a systemd service for a workspace.
 *
 * SECURITY: Validates domain format before attempting restart.
 * Returns error if domain is invalid (fail-safe principle).
 *
 * @param domain - Domain name
 * @param requestId - Request ID for logging
 * @returns Object with success status and details
 */
export function restartSystemdService(domain: string, requestId: string): RestartResult {
  let serviceName: string

  // SECURITY: Catch validation errors from domainToServiceName
  try {
    serviceName = domainToServiceName(domain)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log("error", requestId, "Invalid domain format:", errorMsg)
    return {
      success: false,
      message: `Invalid domain format: ${domain}`,
      details: errorMsg,
    }
  }

  log("log", requestId, `Restarting systemd service: ${serviceName}`)

  // Use systemctl to restart the service
  const result = spawnSync("systemctl", ["restart", serviceName], {
    encoding: "utf-8",
    timeout: 30000, // 30 second timeout
    shell: false, // CRITICAL: no shell = no injection attacks
  })

  if (result.error) {
    log("error", requestId, "Failed to restart service:", result.error.message)
    return {
      success: false,
      message: `Failed to restart service ${serviceName}`,
      details: result.error.message,
    }
  }

  if (result.status !== 0) {
    const stderr = result.stderr || ""
    log("warn", requestId, `Service restart returned non-zero status ${result.status}:`, stderr)

    // Some non-zero statuses might still indicate success (e.g., service was restarted)
    // Check if this is a "service already running" or "restart scheduled" type message
    if (stderr.includes("restart scheduled") || stderr.includes("job is pending")) {
      log("log", requestId, "Service restart scheduled (async)")
      return {
        success: true,
        message: `Service ${serviceName} restart scheduled`,
      }
    }

    // If we can't determine success, treat as failure
    return {
      success: false,
      message: `Failed to restart service ${serviceName}`,
      details: stderr.trim(),
    }
  }

  log("log", requestId, `Service ${serviceName} restarted successfully`)
  return {
    success: true,
    message: `Service ${serviceName} restarted successfully`,
  }
}

/**
 * Checks if a service is currently running.
 *
 * @param domain - Domain name
 * @param requestId - Request ID for logging
 * @returns true if service is active/running, false otherwise
 */
export function isServiceRunning(domain: string, requestId: string): boolean {
  const serviceName = domainToServiceName(domain)

  const result = spawnSync("systemctl", ["is-active", serviceName], {
    encoding: "utf-8",
    timeout: 5000,
    shell: false,
  })

  const isActive = result.status === 0 && result.stdout?.trim() === "active"
  log("log", requestId, `Service ${serviceName} active: ${isActive}`)
  return isActive
}

/**
 * Gets recent logs from a service.
 *
 * @param domain - Domain name
 * @param requestId - Request ID for logging
 * @param lines - Number of log lines to retrieve (default: 30)
 * @returns Service logs or error message
 */
export function getServiceLogs(domain: string, requestId: string, lines = 30): string {
  const serviceName = domainToServiceName(domain)

  const result = spawnSync("journalctl", ["-u", serviceName, "-n", String(lines), "--no-pager"], {
    encoding: "utf-8",
    timeout: 5000,
    shell: false,
  })

  if (result.error || result.status !== 0) {
    log("error", requestId, `Failed to get logs for ${serviceName}`)
    return "Could not retrieve service logs"
  }

  return result.stdout || "No logs available"
}
