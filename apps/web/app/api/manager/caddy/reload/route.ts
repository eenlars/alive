import { execSync } from "node:child_process"
import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"
import * as Sentry from "@sentry/nextjs"

/**
 * POST /api/manager/caddy/reload
 *
 * Reload Caddy reverse proxy configuration
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    console.log("[Manager] Starting Caddy reload")
    const output = execSync("systemctl reload caddy", { encoding: "utf-8" })

    console.log("[Manager] Caddy reload completed")

    return createCorsSuccessResponse(origin, {
      output,
      message: "Caddy configuration reloaded successfully",
      requestId,
    })
  } catch (error) {
    console.error("[Manager] Caddy reload failed:", error)
    Sentry.captureException(error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
