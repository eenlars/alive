import { execSync } from "node:child_process"
import { basename, dirname } from "node:path"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { handleWorkspaceApi } from "@/lib/workspace-api-handler"
import { detectServeMode, runAsWorkspaceUser } from "@/lib/workspace-execution/command-runner"

const RestartSchema = z.object({
  workspaceRoot: z.string(),
})

export async function POST(req: Request) {
  return handleWorkspaceApi(req, {
    schema: RestartSchema,
    handler: async ({ data, requestId }) => {
      const { workspaceRoot } = data

      const sitePath = dirname(workspaceRoot)
      const domain = basename(sitePath)
      const serviceSlug = domain.replace(/\./g, "-")
      const serviceName = `site@${serviceSlug}.service`

      // Detect current mode before restart
      const currentMode = detectServeMode(workspaceRoot)

      try {
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
            const result = await runAsWorkspaceUser({
              command: "rm",
              args: ["-rf", cachePath],
              workspaceRoot,
              timeout: 5000,
            })

            if (result.success) {
              console.log(`[restart-workspace ${requestId}] Cleared cache: ${cachePath}`)
            }
          } catch {
            // Cache might not exist, continue
          }
        }

        // Restart the systemd service (runs as root - system operation)
        execSync(`systemctl restart ${serviceName}`, {
          encoding: "utf-8",
          timeout: 10000,
        })

        // Build mode-aware message
        const modeLabel = currentMode === "dev" ? "development" : currentMode === "build" ? "production" : null
        const modeHint =
          currentMode === "dev"
            ? "Changes will appear instantly (hot reload active)."
            : currentMode === "build"
              ? "Running production build. Use switch_serve_mode to change."
              : ""

        // If we couldn't detect mode, just say server restarted without mode info
        const message = modeLabel
          ? `✓ Server restarted in ${modeLabel} mode. ${modeHint}`.trim()
          : "✓ Server restarted."

        return NextResponse.json({
          ok: true,
          service: serviceName,
          mode: currentMode,
          message,
          requestId,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        return createErrorResponse(ErrorCodes.WORKSPACE_RESTART_FAILED, 500, {
          requestId,
          service: serviceName,
          error: errorMessage,
        })
      }
    },
  })
}
