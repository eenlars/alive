import { existsSync } from "node:fs"
import path from "node:path"
import { PATHS, SUPERADMIN, TEST_CONFIG } from "@webalive/shared"
import { NextResponse } from "next/server"
import { domainToSlug, normalizeDomain } from "@/features/manager/lib/domain-utils"
import { ErrorCodes } from "@/lib/error-codes"

export interface GetWorkspaceParams {
  host: string
  body: Record<string, unknown>
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

/**
 * Determines the workspace directory based on request body
 *
 * Always terminal mode:
 * - Expects 'workspace' parameter in request body
 * - Must start with 'webalive/sites/' (or will be auto-prepended)
 * - Returns full path: /srv/{workspace}
 *
 * Special case: claude-bridge workspace for superadmins
 * - Returns SUPERADMIN.WORKSPACE_PATH directly
 * - Auth layer MUST verify superadmin status before this is called
 * - This function does NOT verify permissions (that's done in verifyWorkspaceAccess)
 */
export function getWorkspace({ host, body, requestId }: GetWorkspaceParams): WorkspaceResult {
  console.log(`[Workspace ${requestId}] Resolving workspace for host: ${host}`)

  // Special case: claude-bridge workspace
  // SECURITY NOTE: This only resolves the path - auth layer (verifyWorkspaceAccess)
  // MUST verify the user is a superadmin before this function is called.
  // This function trusts that auth has already been verified.
  if (body?.workspace === SUPERADMIN.WORKSPACE_NAME) {
    console.log(`[Workspace ${requestId}] Resolving superadmin Bridge workspace path: ${SUPERADMIN.WORKSPACE_PATH}`)
    return {
      success: true,
      workspace: SUPERADMIN.WORKSPACE_PATH,
    }
  }

  // Always terminal mode - resolve workspace from request body
  return getTerminalWorkspace(body, requestId)
}

function getTerminalWorkspace(body: any, requestId: string): WorkspaceResult {
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

  // Allow "test" or "test.bridge.local" workspace in local development mode (for E2E tests)
  // Test workspace is created by e2e-tests/genuine-setup.ts
  const testWorkspace = `test.${TEST_CONFIG.EMAIL_DOMAIN}`
  if (process.env.BRIDGE_ENV === "local" && (customWorkspace === "test" || customWorkspace === testWorkspace)) {
    console.log(`[Workspace ${requestId}] Using test workspace in local mode`)
    return {
      success: true,
      workspace: "/tmp/test-workspace", // Created by e2e-tests/genuine-setup.ts
    }
  }

  // Normalize domain name to handle protocols, www, uppercase, etc.
  const normalizedDomain = normalizeDomain(customWorkspace)
  console.log(`[Workspace ${requestId}] Normalized workspace: ${customWorkspace} → ${normalizedDomain}`)

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

    // Build full path and check if it exists
    const candidateFullPath = path.join("/srv", normalized)
    if (existsSync(candidateFullPath)) {
      workspacePath = normalized
      fullPath = candidateFullPath
      console.log(
        `[Workspace ${requestId}] Found workspace using ${candidate === normalizedDomain ? "dots (new)" : "hyphens (legacy)"}: ${candidateFullPath}`,
      )
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

  console.log(`[Workspace ${requestId}] Using custom workspace: ${fullPath}`)
  return {
    success: true,
    workspace: fullPath,
  }
}
