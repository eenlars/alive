import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { handleWorkspaceApi } from "@/lib/workspace-api-handler"
import { detectServeMode, runAsWorkspaceUser } from "@/lib/workspace-execution/command-runner"
import { restartSystemdService } from "@/lib/workspace-execution/systemd-restart"

/**
 * Detect if site has a backend server (server.ts exists).
 */
function hasBackendServer(workspaceRoot: string): boolean {
  const serverPath = join(workspaceRoot, "server.ts")
  return existsSync(serverPath)
}

/**
 * Check if server.ts has static file serving for production.
 * Production servers need to serve built files from dist/.
 */
function hasProductionStaticServing(workspaceRoot: string): boolean {
  const serverPath = join(workspaceRoot, "server.ts")
  try {
    const content = readFileSync(serverPath, "utf-8")
    // Check for common patterns that indicate static file serving
    return content.includes("serveStatic") && content.includes("dist")
  } catch (_err) {
    // Expected: server.ts may not exist or be unreadable
    return false
  }
}

/**
 * Check if site needs script updates for backend server support.
 * Returns true if server.ts exists but scripts are still using default Vite-only config.
 */
function needsBackendScriptUpdate(workspaceRoot: string): boolean {
  if (!hasBackendServer(workspaceRoot)) {
    return false
  }

  const packageJsonPath = join(workspaceRoot, "package.json")
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
    // Needs update if preview is still "vite preview" (default)
    return packageJson.scripts?.preview === "vite preview"
  } catch (_err) {
    // Expected: package.json may not exist or be invalid
    return false
  }
}

const SwitchServeModeSchema = z.object({
  workspaceRoot: z.string(),
  mode: z.enum(["dev", "build"]),
  buildFirst: z.boolean().optional().default(true),
})

/**
 * Format build output - just show the actual output
 */
function formatBuildOutput(buildOutput?: { stdout?: string; stderr?: string }, error?: string): string {
  const parts: string[] = []

  if (buildOutput?.stderr?.trim()) {
    parts.push(buildOutput.stderr.trim())
  }

  if (buildOutput?.stdout?.trim()) {
    parts.push(buildOutput.stdout.trim())
  }

  if (error) {
    parts.push(error)
  }

  return parts.join("\n\n") || "Build failed with no output"
}

/**
 * POST /api/internal-tools/switch-serve-mode
 *
 * Internal API for switching workspace between dev and build serving modes.
 * Runs with root privileges to modify systemd service configuration.
 *
 * Used by: mcp__alive-workspace__switch_serve_mode
 *
 * Security:
 * - Internal tools secret (X-Internal-Tools-Secret header)
 * - Session authentication via handleWorkspaceApi
 * - Workspace authorization validation
 */
export async function POST(req: Request) {
  // Security: Verify internal tools secret
  const internalSecret = process.env.INTERNAL_TOOLS_SECRET
  const providedSecret = req.headers.get("x-internal-tools-secret")

  if (!internalSecret || providedSecret !== internalSecret) {
    console.error("[switch-serve-mode] Unauthorized: Invalid or missing internal tools secret")
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401, { requestId: crypto.randomUUID() })
  }

  return handleWorkspaceApi(req, {
    schema: SwitchServeModeSchema,
    handler: async ({ data, requestId }) => {
      const { workspaceRoot, mode, buildFirst } = data

      const sitePath = dirname(workspaceRoot)
      const domain = basename(sitePath)
      const serviceSlug = domain.replace(/\./g, "-")
      const serviceName = `site@${serviceSlug}.service`
      const overrideDir = `/etc/systemd/system/${serviceName}.d`
      const overrideConf = join(overrideDir, "override.conf")

      // Detect current mode before switching
      const previousMode = detectServeMode(workspaceRoot)
      const alreadyInMode = previousMode === mode

      console.log(`[switch-serve-mode ${requestId}] Switching ${domain} from ${previousMode} to ${mode} mode`)

      try {
        // If switching to build mode and buildFirst is true, run the build
        if (mode === "build" && buildFirst) {
          console.log(`[switch-serve-mode ${requestId}] Running build...`)

          const buildResult = await runAsWorkspaceUser({
            command: "bun",
            args: ["run", "build"],
            workspaceRoot,
            timeout: 120000, // 2 minutes for build
          })

          if (!buildResult.success) {
            return NextResponse.json({
              ok: false,
              message: formatBuildOutput({ stdout: buildResult.stdout, stderr: buildResult.stderr }),
              requestId,
            })
          }

          console.log(`[switch-serve-mode ${requestId}] Build completed`)
        }

        // For sites with backend servers, ensure package.json has correct scripts
        if (needsBackendScriptUpdate(workspaceRoot)) {
          const packageJsonPath = join(workspaceRoot, "package.json")
          try {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
            let updated = false

            // Fix preview script for production mode
            if (packageJson.scripts?.preview === "vite preview") {
              packageJson.scripts.preview = "NODE_ENV=production bun server.ts"
              updated = true
              console.log(`[switch-serve-mode ${requestId}] Updated preview script to use production server`)
            }

            // Fix dev script to run both Vite and API server
            if (packageJson.scripts?.dev === "vite") {
              // Add helper scripts if missing
              if (!packageJson.scripts["dev:api"]) {
                // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a shell variable, not JS template
                packageJson.scripts["dev:api"] = "API_PORT=$((${PORT:-3333} + 1000)) bun --watch server.ts"
              }
              if (!packageJson.scripts["dev:client"]) {
                packageJson.scripts["dev:client"] = "vite"
              }
              packageJson.scripts.dev = 'concurrently -k -n api,vite -c blue,green "bun dev:api" "bun dev:client"'

              // Add concurrently as dependency if missing
              if (!packageJson.dependencies?.concurrently && !packageJson.devDependencies?.concurrently) {
                packageJson.dependencies = packageJson.dependencies || {}
                packageJson.dependencies.concurrently = "^9.2.1"
              }

              updated = true
              console.log(`[switch-serve-mode ${requestId}] Updated dev script to run API + Vite concurrently`)
            }

            if (updated) {
              writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf-8")

              // Install new dependencies
              console.log(`[switch-serve-mode ${requestId}] Installing dependencies...`)
              await runAsWorkspaceUser({
                command: "bun",
                args: ["install"],
                workspaceRoot,
                timeout: 60000,
              })
            }
          } catch (e) {
            console.error(`[switch-serve-mode ${requestId}] Failed to update package.json:`, e)
            Sentry.captureException(e)
          }
        }

        // Update systemd override configuration
        // Use ${PORT} from EnvironmentFile - systemd loads /etc/sites/<slug>.env
        const execStart =
          mode === "dev"
            ? `/bin/sh -c 'exec /usr/local/bin/bun run dev --port \${PORT:-3333} --host 0.0.0.0'`
            : `/bin/sh -c 'exec /usr/local/bin/bun run preview --port \${PORT:-3333} --host 0.0.0.0'`

        const overrideContent = `[Service]
ExecStart=
ExecStart=${execStart}
`

        // Ensure override directory exists
        if (!existsSync(overrideDir)) {
          mkdirSync(overrideDir, { recursive: true })
        }

        // Write override configuration
        writeFileSync(overrideConf, overrideContent, { encoding: "utf-8" })
        console.log(`[switch-serve-mode ${requestId}] Updated ${overrideConf}`)

        // Reload systemd and restart service with recovery
        execSync("systemctl daemon-reload", { encoding: "utf-8", timeout: 10000 })
        const restartResult = restartSystemdService(serviceName)

        if (!restartResult.success && mode === "build") {
          // Build/preview mode crashed the service — revert to dev mode automatically
          console.warn(`[switch-serve-mode ${requestId}] Service crashed in build mode, reverting to dev mode`)

          const devExecStart = `/bin/sh -c 'exec /usr/local/bin/bun run dev --port \${PORT:-3333} --host 0.0.0.0'`
          const devOverride = `[Service]\nExecStart=\nExecStart=${devExecStart}\n`
          writeFileSync(overrideConf, devOverride, { encoding: "utf-8" })
          execSync("systemctl daemon-reload", { encoding: "utf-8", timeout: 10000 })

          const fallbackResult = restartSystemdService(serviceName)
          const fallbackStatus = fallbackResult.success ? "running in dev mode" : "still failing"

          return NextResponse.json(
            {
              ok: false,
              message:
                `Production mode crashed the service. Automatically reverted to development mode (${fallbackStatus}).` +
                `\n\nDiagnostics:\n${restartResult.diagnostics || "(no logs available)"}`,
              previousMode,
              currentMode: "dev",
              requestId,
            },
            { status: 500 },
          )
        }

        if (!restartResult.success) {
          console.error(`[switch-serve-mode ${requestId}] Restart failed:`, restartResult.error)
          Sentry.captureException(new Error(`switch-serve-mode restart failed: ${restartResult.error}`))
          return NextResponse.json(
            {
              ok: false,
              message: `Failed to restart service: ${restartResult.error}\n\nDiagnostics:\n${restartResult.diagnostics || "(no logs available)"}`,
              requestId,
            },
            { status: 500 },
          )
        }

        console.log(`[switch-serve-mode ${requestId}] Service restarted in ${mode} mode`)

        // Build informative message based on previous state
        const modeLabel = mode === "dev" ? "Development" : "Production"
        // If previous mode is unknown, don't mention it - just say we switched to the new mode
        const previousLabel = previousMode === "dev" ? "development" : previousMode === "build" ? "production" : null

        const recoveryNote = restartResult.action === "reset-then-restarted" ? " (recovered from crashed state)" : ""

        let message: string
        if (alreadyInMode) {
          // Already in this mode - still restart, but inform user
          const explanation =
            mode === "dev"
              ? "Server restarted. Changes will appear instantly (hot reload)."
              : "Server restarted with existing production build."
          message = `✓ Already in ${modeLabel.toLowerCase()} mode${recoveryNote}. ${explanation}`
        } else {
          // Switched modes
          const explanation =
            mode === "dev"
              ? "Changes you make will appear instantly on the site."
              : "Your site is now running the fast, optimized version."
          // If we couldn't detect previous mode, just say we enabled the new mode
          message = previousLabel
            ? `✓ Switched from ${previousLabel} to ${modeLabel.toLowerCase()} mode${recoveryNote}. ${explanation}`
            : `✓ ${modeLabel} mode enabled${recoveryNote}. ${explanation}`
        }

        // Warn if site has backend server but might not be configured for production
        if (mode === "build" && hasBackendServer(workspaceRoot) && !hasProductionStaticServing(workspaceRoot)) {
          message +=
            "\n\n⚠️ This site has a backend server (server.ts) but may not be configured to serve static files in production. " +
            "The server.ts needs to serve files from dist/ when NODE_ENV=production."
        }

        return NextResponse.json({
          ok: true,
          message,
          previousMode,
          currentMode: mode,
          requestId,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[switch-serve-mode ${requestId}] Error:`, error)
        Sentry.captureException(error)

        return NextResponse.json({
          ok: false,
          message: errorMessage,
          requestId,
        })
      }
    },
  })
}
