import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import * as Sentry from "@sentry/nextjs"
import { PATHS } from "@webalive/shared"
import { z } from "zod"
import { AuthenticationError, getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

/**
 * Admin-only deployment endpoint
 *
 * Security:
 * - Requires authenticated session
 * - Requires admin privileges (isAdmin flag)
 * - Only allows predefined deployment commands (no arbitrary execution)
 * - Streams output via SSE for real-time feedback
 * - All actions are logged with request ID
 */

const PROJECT_ROOT = PATHS.ALIVE_ROOT

const DeployActionSchema = z.enum(["staging", "production", "production-skip-e2e", "status"])
type DeployAction = z.infer<typeof DeployActionSchema>

const RequestSchema = z.object({
  action: DeployActionSchema,
})

/**
 * Predefined deployment commands - only these can be executed
 * No arbitrary command execution allowed
 */
const ALLOWED_ACTIONS: Record<DeployAction, { command: string; args: string[]; description: string }> = {
  staging: {
    command: "make",
    args: ["staging"],
    description: "Deploy to staging (build, test, restart)",
  },
  production: {
    command: "make",
    args: ["wash"],
    description: "Deploy to production (full E2E tests)",
  },
  "production-skip-e2e": {
    command: "make",
    args: ["wash-skip"],
    description: "Deploy to production (skip E2E tests)",
  },
  status: {
    command: "make",
    args: ["status"],
    description: "Show status of all environments",
  },
}

/**
 * POST /api/admin/deploy
 *
 * Runs deployment commands with streaming output.
 * Admin-only endpoint for system administrators.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId()

  try {
    // 1. Authentication - get user from session
    const user = await getSessionUser()
    if (!user) {
      console.warn(`[Admin Deploy ${requestId}] No session`)
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401, details: { requestId } })
    }

    // 2. Authorization - require admin privileges
    if (!user.isAdmin) {
      console.warn(`[Admin Deploy ${requestId}] Non-admin access attempt: ${user.email} (${user.id})`)
      return structuredErrorResponse(ErrorCodes.FORBIDDEN, { status: 403, details: { requestId } })
    }

    // 3. Parse and validate request body
    let body: unknown
    try {
      body = await req.json()
    } catch (_err) {
      return structuredErrorResponse(ErrorCodes.INVALID_JSON, { status: 400, details: { requestId } })
    }

    const parseResult = RequestSchema.safeParse(body)
    if (!parseResult.success) {
      const field = parseResult.error.issues[0]?.path.join(".") || "action"
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: {
          field,
          validActions: DeployActionSchema.options,
          requestId,
        },
      })
    }

    const { action } = parseResult.data
    const { command, args, description } = ALLOWED_ACTIONS[action]

    console.log(`[Admin Deploy ${requestId}] Starting ${action} by ${user.email}`)

    // 4. Stream output via SSE
    // IMPORTANT: Use setsid to create a new process session
    // This ensures the deployment survives if this server restarts during deploy
    const logFile = `/tmp/admin-deploy-${requestId}.log`
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        // Send initial event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "start",
              action,
              description,
              logFile, // Include log file path so client can poll if disconnected
              requestId,
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        )

        // Write output to log file as backup (survives connection drop)
        const logStream = createWriteStream(logFile, { flags: "a" })
        logStream.write(`[${new Date().toISOString()}] Starting ${action}: ${description}\n`)

        // Use setsid to create new session - process continues even if parent dies
        // This is critical for staging deploys that restart the server
        const proc = spawn("setsid", [command, ...args], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            FORCE_COLOR: "0", // Disable colors for log file cleanliness
            TERM: "dumb",
          },
          detached: true, // Extra insurance - run in separate process group
        })

        // Allow parent to exit without killing the child
        proc.unref()

        const sendOutput = (data: Buffer, streamType: "stdout" | "stderr") => {
          const text = data.toString()
          // Strip ANSI color codes for cleaner display
          // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes require control chars
          const cleanText = text.replace(/\x1b\[[0-9;]*m/g, "")

          // Write to log file (persists even if connection drops)
          logStream.write(cleanText)

          // Try to send via SSE (may fail if connection dropped)
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "output",
                  stream: streamType,
                  text: cleanText,
                })}\n\n`,
              ),
            )
          } catch (_err) {
            // Expected: client disconnected, process continues via log file
          }
        }

        proc.stdout?.on("data", (data: Buffer) => sendOutput(data, "stdout"))
        proc.stderr?.on("data", (data: Buffer) => sendOutput(data, "stderr"))

        proc.on("close", (code: number | null) => {
          const success = code === 0
          console.log(
            `[Admin Deploy ${requestId}] ${action} completed with code ${code} (${success ? "success" : "failed"})`,
          )

          // Log completion to file
          logStream.write(`\n[${new Date().toISOString()}] Completed with exit code ${code}\n`)
          logStream.end()

          // Try to send completion via SSE
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "complete",
                  exitCode: code,
                  success,
                  logFile,
                  requestId,
                  timestamp: new Date().toISOString(),
                })}\n\n`,
              ),
            )
            controller.close()
          } catch (_err) {
            // Expected: client disconnected, deployment completed
          }
        })

        proc.on("error", (err: Error) => {
          console.error(`[Admin Deploy ${requestId}] Process error:`, err.message)
          Sentry.captureException(err)
          logStream.write(`\n[ERROR] ${err.message}\n`)
          logStream.end()

          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: err.message,
                  logFile,
                  requestId,
                })}\n\n`,
              ),
            )
            controller.close()
          } catch (_err) {
            // Expected: client disconnected
          }
        })
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    // Handle authentication errors thrown by requireSessionUser pattern
    if (error instanceof AuthenticationError) {
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401, details: { requestId } })
    }

    console.error(`[Admin Deploy ${requestId}] Unexpected error:`, error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, {
      status: 500,
      details: {
        exception: error instanceof Error ? error.message : "Unknown error",
        requestId,
      },
    })
  }
}
