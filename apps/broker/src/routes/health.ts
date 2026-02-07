/**
 * Health & Status Routes
 *
 * GET /health - Basic health check
 * GET /stats - Stream manager statistics
 */

import { getWorkerPool } from "@webalive/worker-pool"
import { Hono } from "hono"
import { getStreamManager } from "../engine/stream-manager.js"

const app = new Hono()

/**
 * Basic health check - always returns OK if server is running
 */
app.get("/health", c => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

/**
 * Detailed statistics about stream manager and worker pool
 */
app.get("/stats", c => {
  const streamManager = getStreamManager()
  const workerPool = getWorkerPool()

  const streamStats = streamManager.getStats()
  const poolStats = workerPool.getStats()

  return c.json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    streams: {
      active: streamStats.activeStreams,
      queued: streamStats.queuedStreams,
      byOrg: Object.fromEntries(streamStats.byOrg),
      byUser: Object.fromEntries(streamStats.byUser),
    },
    workers: {
      total: poolStats.totalWorkers,
      active: poolStats.activeWorkers,
      idle: poolStats.idleWorkers,
      max: poolStats.maxWorkers,
    },
  })
})

/**
 * Readiness check - returns OK only if broker is ready to accept requests
 */
app.get("/ready", c => {
  const streamManager = getStreamManager()
  const stats = streamManager.getStats()

  // Consider ready if we have capacity
  const hasCapacity = stats.activeStreams < 50 // DEFAULT_CONCURRENCY.maxGlobal

  if (!hasCapacity) {
    return c.json({ status: "not_ready", reason: "At capacity" }, 503)
  }

  return c.json({ status: "ready" })
})

export default app
