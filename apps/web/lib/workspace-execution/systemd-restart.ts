/**
 * Resilient Systemd Service Restart
 *
 * Handles the common case where a service is in "failed" state (OOM, crash, etc.)
 * and `systemctl restart` alone won't recover it. The flow:
 *
 * 1. Try `systemctl restart <service>`
 * 2. On failure → check `systemctl is-failed <service>`
 * 3. If failed → `systemctl reset-failed <service>` → retry restart
 * 4. If retry fails → collect `journalctl` diagnostics → return failure
 * 5. On success → poll `systemctl is-active` to confirm
 */

import { execSync } from "node:child_process"

export interface RestartResult {
  success: boolean
  /** What action was taken */
  action: "restarted" | "reset-then-restarted" | "failed"
  /** Whether the service is active after the attempt */
  serviceActive: boolean
  /** Error message if failed */
  error?: string
  /** Last 20 lines of journalctl output for debugging */
  diagnostics?: string
}

interface RestartAttemptResult {
  ok: boolean
  error?: string
}

/** Shell-safe service name: only allow alphanumeric, dash, underscore, @, dot */
function validateServiceName(name: string): void {
  if (!/^[a-zA-Z0-9@._-]+$/.test(name)) {
    throw new Error(`Invalid service name: ${name}`)
  }
}

function isServiceFailed(serviceName: string): boolean {
  try {
    const status = execSync(`systemctl is-failed ${serviceName}`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim()
    return status === "failed"
  } catch {
    // is-failed returns exit code 1 when NOT failed, which throws
    return false
  }
}

function isServiceActive(serviceName: string): boolean {
  try {
    execSync(`systemctl is-active --quiet ${serviceName}`, { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

function getJournalDiagnostics(serviceName: string): string {
  try {
    return execSync(`journalctl -u ${serviceName} -n 20 --no-pager`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim()
  } catch {
    return "(could not retrieve journal logs)"
  }
}

function restartAndConfirmActive(serviceName: string, timeout: number, waitTimeout: number): RestartAttemptResult {
  try {
    execSync(`systemctl restart ${serviceName}`, {
      encoding: "utf-8",
      timeout,
    })
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  const active = waitForActive(serviceName, waitTimeout)
  if (!active) {
    return {
      ok: false,
      error: `systemctl restart succeeded but service did not become active within ${waitTimeout}ms`,
    }
  }

  return { ok: true }
}

/**
 * Wait for a service to become active, polling every 500ms.
 */
function waitForActive(serviceName: string, timeoutMs: number): boolean {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (isServiceActive(serviceName)) {
      return true
    }
    // Blocking sleep — fine for a short poll in a route handler
    execSync("sleep 0.5")
  }
  return isServiceActive(serviceName)
}

/**
 * Restart a systemd service with automatic recovery from failed state.
 *
 * @param serviceName - e.g. "site@example-com.service"
 * @param options.timeout - Timeout for the restart command (default 10s)
 * @param options.waitForActive - How long to poll for active state (default 5s)
 */
export function restartSystemdService(
  serviceName: string,
  options: { timeout?: number; waitForActive?: number } = {},
): RestartResult {
  const { timeout = 10_000, waitForActive: waitTimeout = 5_000 } = options
  validateServiceName(serviceName)

  // Attempt 1: straight restart
  const firstAttempt = restartAndConfirmActive(serviceName, timeout, waitTimeout)
  if (firstAttempt.ok) {
    return { success: true, action: "restarted", serviceActive: true }
  }

  // Check if it's a failed-state issue
  if (!isServiceFailed(serviceName)) {
    // Not a failed-state issue — collect diagnostics and give up
    const diagnostics = getJournalDiagnostics(serviceName)
    return {
      success: false,
      action: "failed",
      serviceActive: false,
      error: firstAttempt.error
        ? `${firstAttempt.error} (service is not in failed state)`
        : "systemctl restart failed and service is not in failed state",
      diagnostics,
    }
  }

  // Attempt 2: reset-failed → restart
  try {
    execSync(`systemctl reset-failed ${serviceName}`, {
      encoding: "utf-8",
      timeout: 5000,
    })
  } catch (e) {
    const diagnostics = getJournalDiagnostics(serviceName)
    return {
      success: false,
      action: "failed",
      serviceActive: false,
      error: `reset-failed failed: ${e instanceof Error ? e.message : String(e)}`,
      diagnostics,
    }
  }

  const secondAttempt = restartAndConfirmActive(serviceName, timeout, waitTimeout)
  if (secondAttempt.ok) {
    return { success: true, action: "reset-then-restarted", serviceActive: true }
  }

  const diagnostics = getJournalDiagnostics(serviceName)
  return {
    success: false,
    action: "failed",
    serviceActive: false,
    error: `restart failed after reset-failed: ${secondAttempt.error || "unknown error"}`,
    diagnostics,
  }
}
