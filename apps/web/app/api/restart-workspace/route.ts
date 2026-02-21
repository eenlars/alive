import { basename, dirname } from "node:path"
import { NextResponse } from "next/server"
import { z } from "zod"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { handleWorkspaceApi } from "@/lib/workspace-api-handler"
import { detectServeMode, runAsWorkspaceUser } from "@/lib/workspace-execution/command-runner"
import { restartSystemdService } from "@/lib/workspace-execution/systemd-restart"

const RestartSchema = z.object({
  workspaceRoot: z.string(),
})

/** Per-service cooldown: serviceName → timestamp of last restart */
const lastRestartAt = new Map<string, number>()
const RESTART_COOLDOWN_MS = 10_000

export async function POST(req: Request) {
  return handleWorkspaceApi(req, {
    schema: RestartSchema,
    handler: async ({ data, requestId }) => {
      const { workspaceRoot } = data

      const sitePath = dirname(workspaceRoot)
      const domain = basename(sitePath)
      const serviceSlug = domain.replace(/\./g, "-")
      const serviceName = `site@${serviceSlug}.service`

      // Cooldown: prevent rapid restarts that cause port conflicts and SIGABRT crashes
      const now = Date.now()
      const lastRestart = lastRestartAt.get(serviceName)
      if (lastRestart && now - lastRestart < RESTART_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESTART_COOLDOWN_MS - (now - lastRestart)) / 1000)
        console.log(`[restart-workspace ${requestId}] Cooldown active for ${serviceName}, ${waitSec}s remaining`)
        const currentMode = detectServeMode(workspaceRoot)
        const modeLabel = currentMode === "dev" ? "development" : currentMode === "build" ? "production" : null
        return NextResponse.json({
          ok: true,
          service: serviceName,
          mode: currentMode,
          message: modeLabel
            ? `✓ Server already restarted recently (${modeLabel} mode). Skipped to avoid crash.`
            : "✓ Server already restarted recently. Skipped to avoid crash.",
          requestId,
          skipped: true,
        })
      }

      // Detect current mode before restart
      const currentMode = detectServeMode(workspaceRoot)

      // Clear all dev caches to prevent stale dependency/compilation issues
      // IMPORTANT: Run as workspace user to ensure correct file ownership
      const cachePaths = [
        "node_modules/.vite", // Vite dependency optimization cache
        "node_modules/.cache", // Babel, ESLint, and other tool caches
        ".swc", // SWC compiler cache (used by @vitejs/plugin-react-swc)
        "tsconfig.tsbuildinfo", // TypeScript incremental build cache
      ]

      for (const cachePath of cachePaths) {
        try {
          const cacheResult = await runAsWorkspaceUser({
            command: "rm",
            args: ["-rf", cachePath],
            workspaceRoot,
            timeout: 5000,
          })

          if (cacheResult.success) {
            console.log(`[restart-workspace ${requestId}] Cleared cache: ${cachePath}`)
          }
        } catch {
          // Cache might not exist, continue
        }
      }

      // Restart the systemd service with automatic recovery from failed state
      const result = restartSystemdService(serviceName)

      if (!result.success) {
        console.error(`[restart-workspace ${requestId}] Restart failed for ${serviceName}:`, result.error)

        return structuredErrorResponse(ErrorCodes.WORKSPACE_RESTART_FAILED, {
          status: 500,
          details: {
            requestId,
            service: serviceName,
            error: result.error,
            diagnostics: result.diagnostics,
          },
        })
      }

      lastRestartAt.set(serviceName, Date.now())

      if (result.action === "reset-then-restarted") {
        console.log(`[restart-workspace ${requestId}] Recovered ${serviceName} from failed state`)
      }

      // Build mode-aware message
      const modeLabel = currentMode === "dev" ? "development" : currentMode === "build" ? "production" : null
      const modeHint =
        currentMode === "dev"
          ? "Changes will appear instantly (hot reload active)."
          : currentMode === "build"
            ? "Running production build. Use switch_serve_mode to change."
            : ""

      const recoveryNote = result.action === "reset-then-restarted" ? " (recovered from crashed state)" : ""

      // If we couldn't detect mode, just say server restarted without mode info
      const message = modeLabel
        ? `✓ Server restarted in ${modeLabel} mode${recoveryNote}. ${modeHint}`.trim()
        : `✓ Server restarted${recoveryNote}.`

      return NextResponse.json({
        ok: true,
        service: serviceName,
        mode: currentMode,
        message,
        requestId,
      })
    },
  })
}
