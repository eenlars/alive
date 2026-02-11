import { execSync } from "node:child_process"
import { PATHS } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"
import { runAsWorkspaceUser } from "@/lib/workspace-execution/command-runner"
import { domainToServiceName } from "@/lib/workspace-service-manager"

/**
 * POST /api/manager/restart-service
 *
 * Restart a site's systemd service and clear Vite cache
 * Requires manager authentication
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const body = await req.json()
    const { domain } = body

    if (!domain || typeof domain !== "string") {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        details: { field: "domain", message: "Domain is required" },
      })
    }

    const serviceName = domainToServiceName(domain)
    const isTemplate = serviceName.startsWith("template@")
    const baseDir = isTemplate ? PATHS.TEMPLATES_ROOT : PATHS.SITES_ROOT
    const workspaceRoot = `${baseDir}/${domain}/user`

    console.log(`[Manager] Restarting service for domain: ${domain}`)

    // Clear Vite cache to prevent stale dependency issues
    // IMPORTANT: Run as workspace user to ensure correct file ownership
    try {
      const result = await runAsWorkspaceUser({
        command: "rm",
        args: ["-rf", "node_modules/.vite"],
        workspaceRoot,
        timeout: 5000,
      })

      if (!result.success) {
        console.warn(`[Manager] Failed to clear Vite cache for ${domain}:`, result.stderr)
        // Continue with restart anyway - cache clear is optional
      } else {
        console.log(`[Manager] Vite cache cleared for ${domain}`)
      }
    } catch (cacheError) {
      // Cache might not exist or command failed, continue with restart
      console.warn(`[Manager] Cache clear error for ${domain}:`, cacheError)
    }

    // Restart the systemd service (runs as root - system operation)
    const output = execSync(`systemctl restart ${serviceName}`, {
      encoding: "utf-8",
      timeout: 10000,
    })

    console.log(`[Manager] Service restarted successfully: ${serviceName}`)

    return createCorsSuccessResponse(origin, {
      ok: true,
      service: serviceName,
      message: `Vite cache cleared and dev server restarted: ${serviceName}`,
      output,
      requestId,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[Manager] Service restart failed:", errorMessage)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
      requestId,
      details: { error: errorMessage },
    })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
