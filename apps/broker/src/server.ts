/**
 * Message Broker Server
 *
 * A dedicated service for Claude streaming that:
 * - Owns stream lifecycle state machines
 * - Manages concurrency and backpressure
 * - Handles graceful shutdown
 * - Runs as a separate process from Next.js
 *
 * Internal only - not exposed to internet.
 */

import { Hono } from "hono"
import { logger } from "hono/logger"
import { serve, type ServerType } from "@hono/node-server"
import { getStreamManager, resetStreamManager } from "./engine/stream-manager.js"
import claudeRoutes from "./routes/claude.js"
import healthRoutes from "./routes/health.js"
import { DEFAULT_BROKER_CONFIG } from "./types.js"

// Environment configuration
const PORT = parseInt(process.env.BROKER_PORT ?? String(DEFAULT_BROKER_CONFIG.port), 10)
const HOST = process.env.BROKER_HOST ?? DEFAULT_BROKER_CONFIG.host

// Validate required environment
if (!process.env.BROKER_SHARED_SECRET) {
  console.error("[Broker] ERROR: BROKER_SHARED_SECRET environment variable is required")
  process.exit(1)
}

// Create Hono app
const app = new Hono()

// Global middleware
app.use("*", logger())

// Mount routes
app.route("/", healthRoutes)
app.route("/v1/streams/claude", claudeRoutes)

// 404 handler
app.notFound(c => {
  return c.json({ error: "Not found" }, 404)
})

// Global error handler
app.onError((err, c) => {
  console.error("[Broker] Unhandled error:", err)
  return c.json({ error: "Internal server error" }, 500)
})

// Start server
let server: ServerType | null = null

function startServer() {
  server = serve({
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  })

  console.error(`[Broker] Server started on ${HOST}:${PORT}`)
  console.error(`[Broker] Health check: http://${HOST}:${PORT}/health`)
  console.error(`[Broker] Stats: http://${HOST}:${PORT}/stats`)
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.error(`[Broker] Received ${signal}, starting graceful shutdown...`)

  // Stop accepting new connections
  if (server) {
    server.close()
  }

  // Cancel all active streams
  const streamManager = getStreamManager()
  await streamManager.shutdown()
  resetStreamManager()

  console.error("[Broker] Shutdown complete")
  process.exit(0)
}

// Register shutdown handlers
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))

// Handle uncaught errors
process.on("uncaughtException", err => {
  console.error("[Broker] Uncaught exception:", err)
  shutdown("uncaughtException")
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Broker] Unhandled rejection at:", promise, "reason:", reason)
  // Don't exit on unhandled rejection - log and continue
})

// Start
startServer()
