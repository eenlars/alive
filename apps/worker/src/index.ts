/**
 * Automation Worker Entry Point
 *
 * Pure scheduler — finds due jobs, delegates execution to the web app.
 * Runs independently from Next.js. Survives web deploys.
 *
 * Features:
 * - CronService: setTimeout-based scheduler, wakes when next job is due
 * - Stale reaping: clears stuck jobs based on lease_expires_at
 * - HTTP API: /poke, /trigger/:id, /health, /status
 * - Delegates execution to web app's /api/internal/automation/trigger
 */

import { timingSafeEqual } from "node:crypto"
import { serve } from "@hono/node-server"
import { getServerId } from "@webalive/shared"
import { Hono } from "hono"
import { getCronServiceStatus, pokeCronService, startCronService, stopCronService, triggerJob } from "./cron-service"
import { createWorkerAppClient } from "./supabase"

// =============================================================================
// Configuration
// =============================================================================

/** Constant-time secret comparison to prevent timing attacks */
function verifySecret(secret: string | undefined): boolean {
  const expected = process.env.JWT_SECRET
  if (!secret || !expected) return false
  if (secret.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
}

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
  if (!verifySecret(c.req.header("X-Internal-Secret"))) {
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }
  pokeCronService()
  return c.json({ ok: true })
})

// Trigger: manually run a job via the web app
app.post("/trigger/:id", async c => {
  if (!verifySecret(c.req.header("X-Internal-Secret"))) {
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }

  const jobId = c.req.param("id")
  const result = await triggerJob(jobId)
  return c.json(result, result.success ? 200 : 409)
})

// Status: detailed service info (authenticated)
app.get("/status", c => {
  if (!verifySecret(c.req.header("X-Internal-Secret"))) {
    return c.json({ ok: false, error: "Unauthorized" }, 401)
  }
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

  // Start CronService (pure scheduler — delegates execution to web app)
  await startCronService(supabase, serverId)

  // Start HTTP server
  const server = serve({ fetch: app.fetch, port: PORT }, info => {
    console.log(`[Worker] HTTP API listening on port ${info.port}`)
  })

  // Graceful shutdown
  const shutdown = () => {
    console.log("[Worker] Shutting down...")
    stopCronService()
    server.close()
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
