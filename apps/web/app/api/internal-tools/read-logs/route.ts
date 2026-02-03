import { execSync } from "node:child_process"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { handleWorkspaceApi } from "@/lib/workspace-api-handler"

const ReadLogsSchema = z.object({
  workspace: z
    .string()
    .min(1)
    .regex(/^[a-z0-9.-]+$/i, "Workspace must be a valid domain"),
  lines: z.number().int().min(1).max(1000).optional().default(100),
  since: z.string().optional(),
  workspaceRoot: z.string(), // Required by handleWorkspaceApi for auth
})

/**
 * POST /api/internal-tools/read-logs
 *
 * Internal API for reading systemd journal logs from workspace services.
 * Runs with root privileges to access journalctl.
 *
 * Used by: mcp__alive-tools__read_server_logs
 *
 * Security:
 * - Internal tools secret (X-Internal-Tools-Secret header)
 * - Session authentication via handleWorkspaceApi
 * - Workspace authorization validation
 * - Service name validation (domain format)
 * - Input sanitization for journalctl parameters
 */
export async function POST(req: Request) {
  // Security: Verify internal tools secret
  const internalSecret = process.env.INTERNAL_TOOLS_SECRET
  const providedSecret = req.headers.get("x-internal-tools-secret")

  if (!internalSecret || providedSecret !== internalSecret) {
    console.error("[read-logs] Unauthorized: Invalid or missing internal tools secret")
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401, { requestId: crypto.randomUUID() })
  }
  return handleWorkspaceApi(req, {
    schema: ReadLogsSchema,
    handler: async ({ data, requestId }) => {
      const { workspace, lines, since } = data

      // Validate workspace format (domain)
      const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i
      if (!domainRegex.test(workspace)) {
        return createErrorResponse(ErrorCodes.WORKSPACE_INVALID, 400, { requestId, workspace })
      }

      // Convert domain to service name
      const serviceSlug = workspace.replace(/\./g, "-")
      const serviceName = `site@${serviceSlug}.service`

      console.log(`[read-logs ${requestId}] Reading logs for service: ${serviceName}`)

      try {
        // Check if service exists
        const checkCmd = `systemctl show ${serviceName} --property=LoadState,ActiveState`
        const checkOutput = execSync(checkCmd, {
          encoding: "utf-8",
          timeout: 5000,
        })

        const lines_output = checkOutput.trim().split("\n")
        const loadState = lines_output.find(l => l.startsWith("LoadState="))?.split("=")[1]
        const activeState = lines_output.find(l => l.startsWith("ActiveState="))?.split("=")[1]

        if (loadState === "not-found") {
          return createErrorResponse(ErrorCodes.SITE_NOT_FOUND, 404, { requestId, serviceName })
        }

        // Build journalctl command - return raw log lines
        const lineLimit = Math.min(Math.max(1, lines), 1000)
        let cmd = `journalctl -u "${serviceName}" -n ${lineLimit} --no-pager`

        if (since) {
          // Validate 'since' parameter format
          const validSincePatterns = /^(\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago|today|yesterday)$/i
          if (validSincePatterns.test(since)) {
            cmd += ` --since "${since}"`
          } else {
            console.warn(`[read-logs ${requestId}] Invalid 'since' parameter: ${since}, ignoring`)
          }
        }

        console.log(`[read-logs ${requestId}] Running: ${cmd}`)

        // Execute journalctl (runs as root)
        const output = execSync(cmd, {
          encoding: "utf-8",
          timeout: 10000,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        })

        // Return structured data for the tool to parse
        // callBridgeApi will extract the 'output' field as the text content
        return NextResponse.json({
          ok: true,
          output: JSON.stringify({
            logs: output.trim(),
            service: serviceName,
            status: activeState || "unknown",
            lineCount: output.trim().split("\n").filter(Boolean).length,
          }),
          requestId,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        console.error(`[read-logs ${requestId}] Error:`, error)

        return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
          requestId,
          serviceName,
          details: errorMessage,
        })
      }
    },
  })
}
