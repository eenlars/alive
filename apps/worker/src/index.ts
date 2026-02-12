/**
 * Automation Worker Entry Point
 *
 * Standalone Bun process that owns scheduling + execution.
 * Runs independently from the Next.js web app.
 *
 * Features:
 * - CronService: setTimeout-based scheduler with lease-based locking
 * - Executor: Claude Agent SDK in-process (no worker pool needed)
 * - HTTP API: /poke, /trigger/:id, /status for web app integration
 * - Graceful shutdown: SIGTERM/SIGINT stop scheduler, wait for running jobs
 */

import { serve } from "@hono/node-server"
import { getServerId } from "@webalive/shared"
import { Hono } from "hono"
import { getCronServiceStatus, pokeCronService, startCronService, stopCronService, triggerJob } from "./cron-service"
import { createWorkerAppClient } from "./supabase"

// =============================================================================
// Configuration
// =============================================================================

const PORT = parseInt(process.env.WORKER_PORT ?? "5070", 10)
const serverId: string = getServerId() ?? ""

if (!serverId) {
  console.error("[Worker] FATAL: serverId not found in server-config.json")
  process.exit(1)
}

// =============================================================================
// HTTP API (for web app integration)
// =============================================================================

const app = new Hono()

// Health check
app.get("/health", c => {
  const status = getCronServiceStatus()
  return c.json({ ok: true, ...status, serverId })
})

// Poke: re-arm timer immediately (called after job create/update)
app.post("/poke", c => {
  pokeCronService()
  return c.json({ ok: true })
})

// Trigger: manually run a job
app.post("/trigger/:id", async c => {
  // Validate internal secret
  const secret = c.req.header("X-Internal-Secret")
  if (!secret || secret !== process.env.JWT_SECRET) {
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }

  const jobId = c.req.param("id")
  const result = await triggerJob(jobId)
  return c.json(result, result.success ? 200 : 409)
})

// Status: detailed service info
app.get("/status", c => {
  const status = getCronServiceStatus()
  return c.json({
    ok: true,
    service: "automation-worker",
    ...status,
    serverId,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

// =============================================================================
// Startup
// =============================================================================

async function main() {
  console.log(`[Worker] Starting automation worker (server: ${serverId}, port: ${PORT})...`)

  const supabase = createWorkerAppClient()

  // Start CronService
  await startCronService(supabase, serverId, {
    maxConcurrent: 3,
    maxRetries: 3,
    retryBaseDelayMs: 60_000,
    onEvent: event => {
      console.log(`[Worker Event] ${event.action}:`, {
        jobId: event.jobId,
        status: event.status,
        durationMs: event.durationMs,
        error: event.error,
      })
    },
  })

  // Start HTTP server
  const server = serve({ fetch: app.fetch, port: PORT }, info => {
    console.log(`[Worker] HTTP API listening on port ${info.port}`)
  })

  // Graceful shutdown
  const shutdown = () => {
    console.log("[Worker] Shutting down...")
    stopCronService()
    server.close()
    // Give running jobs a moment to finish their current heartbeat
    setTimeout(() => process.exit(0), 2000)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  console.log("[Worker] Automation worker started")
}

main().catch(err => {
  console.error("[Worker] FATAL:", err)
  process.exit(1)
})
