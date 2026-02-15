import cors from "cors"
import type { Request, Response } from "express"
import express from "express"
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
  res.json({ status: "ok", service: "stealth-server", port: PORT })
})

// Register route modules
registerFetchRoutes(app)
registerDetectFrameworkRoutes(app)
registerReconRoutes(app)
registerAnalyzeJsRoutes(app)
registerDiscoverRoutes(app)

const HOST = "127.0.0.1"
app.listen(PORT, HOST, () => {
  console.log(`Stealth server running on http://${HOST}:${PORT}`)
  console.log(`API discovery: http://${HOST}:${PORT}/discover`)
})
