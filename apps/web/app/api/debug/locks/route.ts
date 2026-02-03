/**
 * Debug endpoint to inspect conversation locks, cancellation registry, and worker pool state
 * Only available in development
 *
 * This endpoint is CRITICAL for proper E2E testing - it exposes the actual state
 * of all concurrency primitives so tests can poll for conditions instead of using
 * fixed timeouts (which are flaky and slow).
 *
 * Returns:
 * - locks: Conversation locks (prevents concurrent requests to same conversation)
 * - cancellationRegistry: Active streams that can be cancelled
 * - workerPool: Worker process state (busy/idle/starting)
 *
 * Usage in tests:
 *   await waitFor(async () => {
 *     const state = await fetch('/api/debug/locks').then(r => r.json())
 *     return state.workerPool.activeWorkers === 0 && state.locks.count === 0
 *   }, { timeout: 5000 })
 */

import { WORKER_POOL } from "@webalive/shared"
import { getWorkerPool } from "@webalive/worker-pool"
import { NextResponse } from "next/server"
import { getLockedConversations } from "@/features/auth/types/session"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { getRegistryState } from "@/lib/stream/cancellation-registry"

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 403 })
  }

  const locks = getLockedConversations()
  const registry = getRegistryState()

  // Get worker pool state (if enabled)
  let workerPoolState = null
  if (WORKER_POOL.ENABLED) {
    const pool = getWorkerPool()
    const stats = pool.getStats()
    const workers = pool.getWorkerInfo()

    workerPoolState = {
      enabled: true,
      stats,
      workers: workers.map(w => ({
        workspaceKey: w.workspaceKey,
        state: w.state,
        isActive: w.isActive,
        queriesProcessed: w.queriesProcessed,
        ageMs: Date.now() - w.createdAt.getTime(),
        idleMs: Date.now() - w.lastActivity.getTime(),
      })),
    }
  } else {
    workerPoolState = { enabled: false }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    locks: {
      count: locks.length,
      keys: locks,
    },
    cancellationRegistry: {
      count: registry.length,
      entries: registry,
    },
    workerPool: workerPoolState,
  })
}
