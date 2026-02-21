import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import * as Sentry from "@sentry/nextjs"
import { createDedupeCache } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"

// Configuration
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || ""
const DEPLOY_SCRIPT = path.join(process.cwd(), "../../scripts/deployment/build-and-serve.sh")
const LOG_DIR = path.join(process.cwd(), "../../logs")
const BRANCH = process.env.DEPLOY_BRANCH || "main" // Only deploy on this branch

// Dedupe cache: prevent duplicate deployments from rapid webhook retries
// TTL of 5 minutes - same commit won't trigger multiple deploys
const deployDedupeCache = createDedupeCache({ ttlMs: 5 * 60 * 1000, maxSize: 100 })

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

/**
 * Verify GitHub webhook signature
 * https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn("[WEBHOOK] No GITHUB_WEBHOOK_SECRET set, skipping verification")
    return true // Allow in development
  }

  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET)
  const digest = `sha256=${hmac.update(payload).digest("hex")}`
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

/**
 * GitHub webhook handler for automatic deployments
 *
 * Setup:
 * 1. Go to GitHub repo → Settings → Webhooks → Add webhook
 * 2. Payload URL: https://your-domain.com/api/webhook/deploy
 * 3. Content type: application/json
 * 4. Secret: (generate random string, set as GITHUB_WEBHOOK_SECRET env var)
 * 5. Events: Just the push event
 */
export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature verification
    const payload = await req.text()
    const signature = req.headers.get("x-hub-signature-256") || ""

    // Verify webhook signature
    if (!verifySignature(payload, signature)) {
      console.error("[WEBHOOK] Invalid signature")
      return structuredErrorResponse(ErrorCodes.INVALID_SIGNATURE, { status: 401 })
    }

    // Parse payload
    const body = JSON.parse(payload)
    const event = req.headers.get("x-github-event")

    // Only handle push events
    if (event !== "push") {
      return NextResponse.json({
        message: `Ignoring ${event} event`,
      })
    }

    // Extract branch from ref (refs/heads/main → main)
    const branch = body.ref?.replace("refs/heads/", "")
    const pusher = body.pusher?.name || "unknown"
    const commits = body.commits?.length || 0

    console.log(`[WEBHOOK] Push received: ${commits} commit(s) to ${branch} by ${pusher}`)

    // Only deploy on specified branch
    if (branch !== BRANCH) {
      console.log(`[WEBHOOK] Ignoring push to ${branch} (not ${BRANCH})`)
      return NextResponse.json({
        message: `Deployment skipped (branch: ${branch}, expected: ${BRANCH})`,
      })
    }

    // Dedupe: use latest commit SHA as deduplication key
    const headCommit = body.after || body.head_commit?.id
    if (headCommit && deployDedupeCache.check(headCommit)) {
      console.log(`[WEBHOOK] Ignoring duplicate deployment for commit ${headCommit}`)
      return NextResponse.json({
        message: "Deployment already in progress for this commit",
        commit: headCommit,
        deduplicated: true,
      })
    }

    // Trigger deployment in background
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const logFile = path.join(LOG_DIR, `deploy-${timestamp}.log`)
    const logStream = fs.createWriteStream(logFile)

    console.log(`[WEBHOOK] Starting deployment, logs: ${logFile}`)

    // Run deploy script (it handles git pull internally)
    const deployProcess = spawn("bash", [DEPLOY_SCRIPT], {
      detached: true, // Run independently
      stdio: ["ignore", "pipe", "pipe"],
    })

    // Capture output to log file
    deployProcess.stdout?.pipe(logStream)
    deployProcess.stderr?.pipe(logStream)

    // Don't wait for process to finish
    deployProcess.unref()

    deployProcess.on("exit", code => {
      const status = code === 0 ? "SUCCESS" : "FAILED"
      const message = `[WEBHOOK] Deployment ${status} (exit code: ${code})`
      console.log(message)
      logStream.write(`\n${message}\n`)
      logStream.end()
    })

    // Return immediately
    return NextResponse.json({
      message: "Deployment started",
      branch,
      commits,
      pusher,
      logFile: path.basename(logFile),
    })
  } catch (error) {
    console.error("[WEBHOOK] Error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: {
        exception: error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}

/**
 * GET endpoint to check webhook status and recent deployments
 */
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401 })
    }
    if (!user.isSuperadmin) {
      return structuredErrorResponse(ErrorCodes.FORBIDDEN, { status: 403 })
    }

    // Read recent log files
    const logs = fs
      .readdirSync(LOG_DIR)
      .filter(f => f.startsWith("deploy-"))
      .sort()
      .reverse()
      .slice(0, 5)

    return NextResponse.json({
      configured: !!WEBHOOK_SECRET,
      branch: BRANCH,
      recentDeployments: logs,
      logDir: LOG_DIR,
    })
  } catch (error) {
    console.error("[WEBHOOK] Failed to list deploy logs:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.FILE_READ_ERROR, { status: 500 })
  }
}
