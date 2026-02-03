import { realpathSync } from "node:fs"
import { PATHS } from "@webalive/shared"
import { NextResponse } from "next/server"
import type { ZodSchema, z } from "zod"
import { isWorkspaceAuthenticated, requireSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes, getErrorMessage } from "@/lib/error-codes"

// Workspace base directory (from env or default)
const WORKSPACE_BASE = process.env.WORKSPACE_BASE ?? PATHS.SITES_ROOT

interface WorkspaceApiConfig<_T extends z.ZodRawShape> {
  schema: ZodSchema<any>
  handler: (params: { data: z.infer<ZodSchema<any>>; requestId: string }) => Promise<NextResponse>
}

/**
 * Validates workspace containment to prevent path traversal attacks
 * Uses realpathSync to resolve symlinks before checking containment
 * Returns the resolved path for further processing
 */
function validateWorkspaceContainment(
  workspaceRoot: string,
  requestId: string,
): {
  valid: boolean
  resolvedPath?: string
} {
  try {
    // Resolve any symlinks to get real paths
    const realWorkspaceRoot = realpathSync(workspaceRoot)
    const realBaseRoot = realpathSync(WORKSPACE_BASE)

    // Ensure workspace is within the base directory
    if (!realWorkspaceRoot.startsWith(`${realBaseRoot}/`)) {
      console.error(
        `[workspace-api ${requestId}] Path traversal attempt: ${workspaceRoot} -> ${realWorkspaceRoot} not in ${realBaseRoot}`,
      )
      return { valid: false }
    }

    console.log(`[workspace-api ${requestId}] Workspace validated: ${realWorkspaceRoot}`)
    return { valid: true, resolvedPath: realWorkspaceRoot }
  } catch (error) {
    console.error(`[workspace-api ${requestId}] Workspace validation failed:`, error)
    return { valid: false }
  }
}

/**
 * Shared handler for workspace API endpoints
 * Provides consistent auth, validation, and error handling
 */
export async function handleWorkspaceApi<T extends z.ZodRawShape>(
  req: Request,
  config: WorkspaceApiConfig<T>,
): Promise<NextResponse> {
  const requestId = crypto.randomUUID()

  try {
    // Authentication - always required, no localhost bypass
    const user = await requireSessionUser()

    // Parse and validate request body
    const body = await req.json()
    const parseResult = config.schema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: ErrorCodes.INVALID_REQUEST,
          message: getErrorMessage(ErrorCodes.INVALID_REQUEST, {
            field: parseResult.error.issues[0]?.path.join(".") || "unknown",
          }),
          requestId,
        },
        { status: 400 },
      )
    }

    // Validate workspace containment and authorization if workspaceRoot is present
    if (parseResult.data.workspaceRoot) {
      // First: check path is within allowed base and get resolved path
      const containmentResult = validateWorkspaceContainment(parseResult.data.workspaceRoot, requestId)

      if (!containmentResult.valid) {
        return NextResponse.json(
          {
            ok: false,
            error: ErrorCodes.WORKSPACE_NOT_FOUND,
            message: "Invalid workspace path",
            requestId,
          },
          { status: 403 },
        )
      }

      // Second: check user has access to this specific workspace
      // CRITICAL: Extract workspace name from RESOLVED path (not original)
      const pathParts = containmentResult.resolvedPath!.split("/")
      const sitesIndex = pathParts.indexOf("sites")
      const workspaceName = sitesIndex >= 0 && pathParts[sitesIndex + 1] ? pathParts[sitesIndex + 1] : null

      if (!workspaceName) {
        console.error(`[workspace-api ${requestId}] Authorization failed: could not extract workspace name from path`)
        return NextResponse.json(
          {
            ok: false,
            error: ErrorCodes.UNAUTHORIZED,
            message: "Invalid workspace path",
            requestId,
          },
          { status: 403 },
        )
      }

      // Check if user has access to this workspace
      const hasAccess = await isWorkspaceAuthenticated(workspaceName)
      if (!hasAccess) {
        console.error(
          `[workspace-api ${requestId}] Authorization failed: user ${user.id} does not have access to workspace ${workspaceName}`,
        )
        return NextResponse.json(
          {
            ok: false,
            error: ErrorCodes.UNAUTHORIZED,
            message: "You don't have access to this workspace",
            requestId,
          },
          { status: 403 },
        )
      }

      console.log(`[workspace-api ${requestId}] Workspace authorization passed: ${workspaceName}`)
    }

    // Call the specific handler
    return await config.handler({ data: parseResult.data, requestId })
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        {
          ok: false,
          error: ErrorCodes.UNAUTHORIZED,
          message: getErrorMessage(ErrorCodes.UNAUTHORIZED),
          requestId,
        },
        { status: 401 },
      )
    }

    // Handle unexpected errors
    console.error(`[workspace-api ${requestId}] Unexpected error:`, error)
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.REQUEST_PROCESSING_FAILED,
        message: getErrorMessage(ErrorCodes.REQUEST_PROCESSING_FAILED),
        details: { error: error instanceof Error ? error.message : "Unknown error" },
        requestId,
      },
      { status: 500 },
    )
  }
}
