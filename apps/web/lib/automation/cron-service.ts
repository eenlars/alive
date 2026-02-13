/**
 * CronService - Worker Client
 *
 * Scheduling and execution now live in apps/worker (standalone Bun process).
 * This module provides thin wrappers that delegate to the worker's HTTP API.
 *
 * Routes that previously called pokeCronService() continue to work unchanged —
 * the function now POSTs to the worker instead of re-arming a local timer.
 */

import { DEFAULTS } from "@webalive/shared"

export type { CronEvent, CronServiceConfig } from "@webalive/automation-engine"

const WORKER_URL = `http://localhost:${DEFAULTS.AUTOMATION_WORKER_PORT}`

/**
 * Poke the automation worker to immediately re-check for due jobs.
 * Call this when jobs are created, updated, or re-enabled.
 */
export function pokeCronService(): void {
  // Fire-and-forget POST to worker (authenticated)
  const headers: Record<string, string> = {}
  if (process.env.JWT_SECRET) {
    headers["X-Internal-Secret"] = process.env.JWT_SECRET
  }
  fetch(`${WORKER_URL}/poke`, { method: "POST", headers }).catch(err => {
    console.warn("[CronService] Failed to poke worker:", err instanceof Error ? err.message : err)
  })
}

/**
 * Get worker service status.
 * Returns a default if the worker is unreachable.
 */
export async function getCronServiceStatus(): Promise<{
  started: boolean
  runningJobs: number
  nextWakeAt: Date | null
}> {
  try {
    const res = await fetch(`${WORKER_URL}/health`, { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const data = await res.json()
      return {
        started: data.started ?? false,
        runningJobs: data.runningJobs ?? 0,
        nextWakeAt: null,
      }
    }
  } catch {
    // Worker unreachable
  }
  return { started: false, runningJobs: 0, nextWakeAt: null }
}

/**
 * @deprecated Scheduling now lives in apps/worker. This is a no-op.
 */
export async function startCronService(): Promise<void> {
  console.log("[CronService] Scheduling is handled by the automation worker (apps/worker)")
}

/**
 * @deprecated Scheduling now lives in apps/worker. This is a no-op.
 */
export function stopCronService(): void {
  // No-op — worker manages its own lifecycle
}

/**
 * @deprecated Use the worker's /trigger/:id endpoint instead.
 */
export async function triggerJob(_jobId: string): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: "Use the worker HTTP API to trigger jobs" }
}
