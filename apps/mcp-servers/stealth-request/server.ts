import cors from "cors"
import type { Request, Response } from "express"
import express from "express"
import { browserPool } from "./src/browser-pool"
import { registerAnalyzeJsRoutes } from "./src/routes/analyze-js"
import { registerDetectFrameworkRoutes } from "./src/routes/detect-framework"
import { registerDiscoverRoutes } from "./src/routes/discover"
import { registerFetchRoutes } from "./src/routes/fetch"
import { registerReconRoutes } from "./src/routes/recon"

// Require puppeteer cache directory
if (!process.env.PUPPETEER_CACHE_DIR) {
  throw new Error("PUPPETEER_CACHE_DIR environment variable is required")
}

const app = express()
const PORT = 1234

app.use(cors())
app.use(express.json())

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "stealth-server", port: PORT, pool: browserPool.stats })
})

// Register route modules
registerFetchRoutes(app)
registerDetectFrameworkRoutes(app)
registerReconRoutes(app)
registerAnalyzeJsRoutes(app)
registerDiscoverRoutes(app, {
  port: PORT,
  publicUrl: `https://${process.env.STEALTH_PUBLIC_HOST ?? "scrape.alive.best"}`,
})

const HOST = "127.0.0.1"
app.listen(PORT, HOST, async () => {
  console.log(`Stealth server running on http://${HOST}:${PORT}`)
  console.log(`API discovery: http://${HOST}:${PORT}/discover`)
  // Pre-launch browsers so first requests are fast
  await browserPool.warmup()
})

// Graceful shutdown — close all pooled browsers
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    console.log(`[${signal}] Shutting down browser pool...`)
    await browserPool.shutdown()
    process.exit(0)
  })
}
