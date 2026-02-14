/**
 * protectedRoute — Eliminates auth/workspace boilerplate from API routes.
 *
 * Usage:
 *   // User-only route (no workspace needed)
 *   export const GET = protectedRoute(async ({ user, req }) => {
 *     return NextResponse.json({ ok: true, userId: user.id })
 *   })
 *
 *   // Workspace-scoped route
 *   export const POST = protectedRoute.withWorkspace(async ({ user, workspace, workspacePath, body, req }) => {
 *     return NextResponse.json({ ok: true })
 *   })
 */

import * as Sentry from "@sentry/nextjs"
import type { NextRequest } from "next/server"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"
import { getSessionUser, type SessionUser, verifyWorkspaceAccess } from "./auth"

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

export interface UserRouteContext {
  user: SessionUser
  requestId: string
  req: NextRequest
}

export interface WorkspaceRouteContext extends UserRouteContext {
  workspace: string
  workspacePath: string
  body: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// User-only route (most common)
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler with authentication. Returns 401 if no session.
 * Catches unhandled errors, logs to Sentry, returns 500.
 */
function userRoute(handler: (ctx: UserRouteContext) => Promise<Response>): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const requestId = generateRequestId()

    try {
      const user = await getSessionUser()
      if (!user) {
        return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
      }

      return handler({ user, requestId, req })
    } catch (error) {
      console.error(`[protectedRoute ${requestId}] Unhandled error:`, error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }
  }
}

// ---------------------------------------------------------------------------
// Workspace-scoped route
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler with authentication + workspace authorization + path resolution.
 * Returns 401 if no session or workspace not authorized. Parses JSON body.
 */
function workspaceRoute(
  handler: (ctx: WorkspaceRouteContext) => Promise<Response>,
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const requestId = generateRequestId()

    try {
      // Step 1: Authenticate
      const user = await getSessionUser()
      if (!user) {
        return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
      }

      // Step 2: Parse body
      let body: Record<string, unknown>
      try {
        body = await req.json()
      } catch {
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
          status: 400,
          details: { message: "Invalid JSON body" },
        })
      }

      // Step 3: Verify workspace access
      const workspace = await verifyWorkspaceAccess(user, body, `[${requestId}]`)
      if (!workspace) {
        return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, {
          status: 401,
          details: { message: "Workspace not authorized" },
        })
      }

      // Step 4: Resolve workspace path
      const { resolveWorkspace } = await import("@/features/workspace/lib/workspace-utils")
      const host = req.headers.get("host") || ""
      const workspaceResult = await resolveWorkspace(host, body, requestId)

      if (!workspaceResult.success) {
        return workspaceResult.response
      }

      return handler({
        user,
        requestId,
        req,
        workspace,
        workspacePath: workspaceResult.workspace,
        body,
      })
    } catch (error) {
      console.error(`[protectedRoute ${requestId}] Unhandled error:`, error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const protectedRoute = Object.assign(userRoute, {
  withWorkspace: workspaceRoute,
})
