import { existsSync } from "node:fs"
import path from "node:path"
import { env } from "@webalive/env/server"
import { PATHS, SUPERADMIN, TEST_CONFIG } from "@webalive/shared"
import { NextResponse } from "next/server"
import { structuredErrorResponse } from "@/lib/api/responses"
import { domainToSlug, normalizeDomain } from "@/features/manager/lib/domain-utils"
import { resolveWorktreePath, WorktreeError } from "@/features/worktrees/lib/worktrees"
import { type ErrorCode, ErrorCodes } from "@/lib/error-codes"
import { resolveAndValidatePath } from "@/lib/utils/path-security"

export interface GetWorkspaceParams {
  host: string
  body: WorkspaceRequestBody
  requestId: string
}

export type WorkspaceResult =
  | {
      success: true
      workspace: string
    }
  | {
      success: false
      response: NextResponse
    }

interface WorkspaceRequestBody {
  workspace?: string
  worktree?: string
  [key: string]: unknown
}

function mapWorktreeError(error: WorktreeError): { code: ErrorCode; status: number } {
  switch (error.code) {
    case "WORKTREE_INVALID_SLUG":
      return { code: ErrorCodes.WORKTREE_INVALID_SLUG, status: 400 }
    case "WORKTREE_NOT_FOUND":
      return { code: ErrorCodes.WORKTREE_NOT_FOUND, status: 404 }
    case "WORKTREE_NOT_GIT":
      return { code: ErrorCodes.WORKTREE_NOT_GIT, status: 404 }
    case "WORKTREE_BASE_INVALID":
      return { code: ErrorCodes.WORKTREE_BASE_INVALID, status: 400 }
    case "WORKTREE_LOCKED":
      return { code: ErrorCodes.WORKTREE_LOCKED, status: 409 }
    default:
      return { code: ErrorCodes.INTERNAL_ERROR, status: 500 }
  }
}

/**
 * Determines the workspace directory based on request body.
 *
 * Always terminal mode:
 * - Expects 'workspace' parameter in request body
 * - Must start with 'webalive/sites/' (or will be auto-prepended)
 * - Returns full path: /srv/{workspace}/user
 *
 * Optional worktree support:
 * - If 'worktree' is provided, resolves to /srv/.../worktrees/<slug>
 * - Worktree must exist and be registered in git worktree list
 *
 * Special case: alive workspace for superadmins
 * - Returns SUPERADMIN.WORKSPACE_PATH directly
 * - Auth layer MUST verify superadmin status before this is called
 * - This function does NOT verify permissions (that's done in verifyWorkspaceAccess)
 */
export async function getWorkspace({ host: _, body, requestId }: GetWorkspaceParams): Promise<WorkspaceResult> {
  // Special case: alive workspace
  // SECURITY NOTE: This only resolves the path - auth layer (verifyWorkspaceAccess)
  // MUST verify the user is a superadmin before this function is called.
  // This function trusts that auth has already been verified.
  if (body?.workspace === SUPERADMIN.WORKSPACE_NAME) {
    if (body?.worktree !== undefined) {
      return {
        success: false,
        response: structuredErrorResponse(ErrorCodes.WORKTREE_INVALID_SLUG, {
          status: 400,
          details: { requestId, reason: "Worktrees are not supported for the Alive workspace." },
        }),
      }
    }

    return {
      success: true,
      workspace: SUPERADMIN.WORKSPACE_PATH,
    }
  }

  // Always terminal mode - resolve workspace from request body
  return await getTerminalWorkspace(body, requestId)
}

async function getTerminalWorkspace(body: WorkspaceRequestBody, requestId: string): Promise<WorkspaceResult> {
  const customWorkspace = body?.workspace

  if (!customWorkspace || typeof customWorkspace !== "string") {
    console.error(`[Workspace ${requestId}] Missing or invalid workspace parameter`)
    return {
      success: false,
      response: NextResponse.json(
        {
          ok: false,
          error: ErrorCodes.WORKSPACE_MISSING,
          message: "Terminal hostname requires workspace parameter in request body (string)",
        },
        { status: 400 },
      ),
    }
  }

  // Standalone mode - resolve workspace from local filesystem
  if (env.STREAM_ENV === "standalone") {
    const {
      getStandaloneWorkspacePath,
      getStandaloneWorkspaceBase,
      isValidStandaloneWorkspaceName,
      standaloneWorkspaceExists,
    } = await import("@/features/workspace/lib/standalone-workspace")

    if (!isValidStandaloneWorkspaceName(customWorkspace)) {
      console.error(`[Workspace ${requestId}] Invalid standalone workspace name: ${customWorkspace}`)
      return {
        success: false,
        response: NextResponse.json(
          {
            ok: false,
            error: ErrorCodes.WORKSPACE_INVALID,
            message: `Invalid workspace name: ${customWorkspace}`,
            details: {
              workspace: customWorkspace,
              suggestion: `Create workspace with: mkdir -p ${getStandaloneWorkspaceBase()}/<workspace>/user`,
            },
          },
          { status: 400 },
        ),
      }
    }

    if (standaloneWorkspaceExists(customWorkspace)) {
      const workspacePath = getStandaloneWorkspacePath(customWorkspace)
      return {
        success: true,
        workspace: workspacePath,
      }
    }

    console.error(`[Workspace ${requestId}] Standalone workspace not found: ${customWorkspace}`)
    return {
      success: false,
      response: NextResponse.json(
        {
          ok: false,
          error: ErrorCodes.WORKSPACE_NOT_FOUND,
          message: `Standalone workspace not found: ${customWorkspace}`,
          details: {
            workspace: customWorkspace,
            suggestion: `Create workspace with: mkdir -p ${getStandaloneWorkspaceBase()}/${customWorkspace}/user`,
          },
        },
        { status: 404 },
      ),
    }
  }

  // Allow "test" or "test.alive.local" workspace in local development mode (for E2E tests)
  // Test workspace is created by e2e-tests/genuine-setup.ts
  const testWorkspace = `test.${TEST_CONFIG.EMAIL_DOMAIN}`
  if (env.STREAM_ENV === "local" && (customWorkspace === "test" || customWorkspace === testWorkspace)) {
    return await resolveWorktreeIfRequested("/tmp/test-workspace", body, requestId)
  }

  // Normalize domain name to handle protocols, www, uppercase, etc.
  const normalizedDomain = normalizeDomain(customWorkspace)

  // Try to find the workspace directory using both naming conventions:
  // 1. New convention: domain with dots (e.g., "example.com")
  // 2. Legacy convention: domain with hyphens (e.g., "example-com")
  const candidates = [
    normalizedDomain, // Try with dots first (new sites)
    domainToSlug(normalizedDomain), // Fall back to hyphens (legacy sites)
  ]

  let workspacePath: string | null = null
  let fullPath: string | null = null

  for (const candidate of candidates) {
    // Build the workspace path
    const candidatePath = candidate.startsWith("webalive/sites/") ? candidate : `webalive/sites/${candidate}`

    // Always append /user to the workspace path
    const candidatePathWithUser = candidatePath.endsWith("/user") ? candidatePath : `${candidatePath}/user`

    // Prevent path traversal attacks
    const normalized = path.normalize(candidatePathWithUser)
    if (normalized !== candidatePathWithUser || normalized.includes("..")) {
      console.warn(`[Workspace ${requestId}] Skipping invalid candidate path: ${candidatePathWithUser}`)
      continue
    }

    // Build full path and validate it's within workspace boundaries
    const candidateFullPath = path.join("/srv", normalized)

    // Validate path is within workspace
    // Use candidate + "/user" (not normalized which includes "webalive/sites/" prefix)
    const validation = resolveAndValidatePath(`${candidate}/user`, "/srv/webalive/sites")
    if (!validation.valid) {
      console.warn(`[Workspace ${requestId}] Invalid path validation: ${validation.error}`)
      continue
    }

    if (existsSync(candidateFullPath)) {
      workspacePath = normalized
      fullPath = candidateFullPath
      break
    }
  }

  // If no workspace found after trying both conventions
  if (!workspacePath || !fullPath) {
    const attemptedPaths = candidates.map(c => path.join(PATHS.SITES_ROOT, c, "user"))
    console.error(`[Workspace ${requestId}] Workspace not found. Tried: ${attemptedPaths.join(", ")}`)
    return {
      success: false,
      response: NextResponse.json(
        {
          ok: false,
          error: ErrorCodes.WORKSPACE_NOT_FOUND,
          message: `Workspace directory not found for domain: ${normalizedDomain}`,
          details: {
            domain: normalizedDomain,
            attemptedPaths,
            suggestion: `Create the workspace directory at: ${attemptedPaths[0]} -> check the logs`,
          },
        },
        { status: 404 },
      ),
    }
  }

  return await resolveWorktreeIfRequested(fullPath, body, requestId)
}

async function resolveWorktreeIfRequested(
  baseWorkspacePath: string,
  body: WorkspaceRequestBody,
  requestId: string,
): Promise<WorkspaceResult> {
  if (body.worktree === undefined) {
    return {
      success: true,
      workspace: baseWorkspacePath,
    }
  }

  if (typeof body.worktree !== "string" || body.worktree.trim().length === 0) {
    return {
      success: false,
      response: structuredErrorResponse(ErrorCodes.WORKTREE_INVALID_SLUG, {
        status: 400,
        details: { requestId, reason: "Worktree slug must be a non-empty string." },
      }),
    }
  }

  try {
    const resolvedWorktree = await resolveWorktreePath(baseWorkspacePath, body.worktree)
    return {
      success: true,
      workspace: resolvedWorktree,
    }
  } catch (error) {
    if (error instanceof WorktreeError) {
      const mapped = mapWorktreeError(error)
      return {
        success: false,
        response: structuredErrorResponse(mapped.code, {
          status: mapped.status,
          details: { requestId, worktree: body.worktree },
        }),
      }
    }

    return {
      success: false,
      response: structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
        status: 500,
        details: { requestId, error: error instanceof Error ? error.message : "Unknown error" },
      }),
    }
  }
}
