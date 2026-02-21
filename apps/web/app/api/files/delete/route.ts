import type { Stats } from "node:fs"
import { lstat, readdir, readlink, realpath, rm, unlink } from "node:fs/promises"
import path from "node:path"
import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

/**
 * Critical files within /user that cannot be deleted.
 * These protect users from breaking their own site.
 * NOTE: Checked case-insensitively to handle macOS HFS+
 */
const PROTECTED_FILES = new Set([
  "index.ts",
  "index.js",
  "package.json",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
])

/**
 * Protected directories that cannot be deleted or have files deleted from.
 * NOTE: Checked case-insensitively to handle macOS HFS+
 */
const PROTECTED_DIRS = new Set(["node_modules", ".git", ".well-known"])

/**
 * Check if a path points to a protected file or is inside a protected directory.
 * Uses case-insensitive matching to prevent bypass on case-insensitive filesystems (macOS).
 */
function isProtected(targetPath: string): { protected: boolean; reason?: string } {
  const basename = path.basename(targetPath).toLowerCase()
  const segments = targetPath
    .split(path.sep)
    .filter(Boolean)
    .map(s => s.toLowerCase())

  // Check if it's a protected file (case-insensitive)
  if (PROTECTED_FILES.has(basename)) {
    return {
      protected: true,
      reason: `'${path.basename(targetPath)}' is a critical file required for your site to run`,
    }
  }

  // Check if path is inside or is a protected directory (case-insensitive)
  for (const seg of segments) {
    if (PROTECTED_DIRS.has(seg)) {
      return {
        protected: true,
        reason: `Cannot delete files in '${seg}' directory`,
      }
    }
  }

  // Check if trying to delete a protected directory itself (case-insensitive)
  if (PROTECTED_DIRS.has(basename)) {
    return {
      protected: true,
      reason: `'${path.basename(targetPath)}' is a protected directory`,
    }
  }

  return { protected: false }
}

/**
 * Validates that a symlink target is within the workspace.
 * Prevents TOCTOU attacks where attacker creates symlink pointing outside workspace.
 *
 * @returns null if safe, error response if symlink escapes workspace
 */
async function validateSymlinkTarget(
  symlinkPath: string,
  workspaceRoot: string,
  requestId: string,
): Promise<NextResponse | null> {
  try {
    // Resolve the symlink to its actual target
    const target = await readlink(symlinkPath)
    const resolvedTarget = path.resolve(path.dirname(symlinkPath), target)

    // Check if symlink target is within workspace
    if (!isPathWithinWorkspace(resolvedTarget, workspaceRoot, path.sep)) {
      console.warn(
        `[Delete ${requestId}] Symlink escape blocked: ${symlinkPath} -> ${target} (resolved: ${resolvedTarget})`,
      )
      return structuredErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, {
        status: 403,
        details: {
          requestId,
          reason: "Symlink points outside workspace",
        },
      })
    }

    return null // Safe
  } catch {
    // If we can't read the symlink, treat it as suspicious
    console.warn(`[Delete ${requestId}] Failed to read symlink target: ${symlinkPath}`)
    return structuredErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, {
      status: 403,
      details: {
        requestId,
        reason: "Cannot verify symlink target",
      },
    })
  }
}

/**
 * DELETE endpoint for removing files/directories within user workspace.
 *
 * Security:
 * - Requires session authentication AND workspace authorization
 * - User must have access to the requested workspace (prevents cross-tenant attacks)
 * - Path must be within workspace (/user directory)
 * - Protected files/dirs cannot be deleted (case-insensitive check)
 * - Symlinks are validated to ensure target is within workspace (TOCTOU protection)
 * - Uses realpath() to resolve workspace and prevent symlink-based escapes
 * - No shell commands - uses fs APIs directly
 * - All deletions are logged
 *
 * Request body:
 * - path: string (required) - relative path within workspace
 * - workspace: string (required) - workspace identifier
 * - recursive: boolean (optional) - required for directories
 *
 * Note: Uses POST instead of DELETE method to allow request body parsing.
 * DELETE requests traditionally don't have bodies, though the spec allows it.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    // 1. Authentication check - get user from session
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401, details: { requestId } })
    }

    // 2. Parse and validate request body
    let body: { path?: string; workspace?: string; worktree?: string; recursive?: boolean }
    try {
      body = await request.json()
    } catch {
      return structuredErrorResponse(ErrorCodes.INVALID_JSON, { status: 400, details: { requestId } })
    }

    const { path: targetPath, recursive = false } = body

    if (!targetPath || typeof targetPath !== "string") {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: {
          requestId,
          field: "path",
        },
      })
    }

    // 3. Verify user has access to this workspace (prevents cross-tenant attacks)
    const authorizedWorkspace = await verifyWorkspaceAccess(user, body, `[Delete ${requestId}]`)
    if (!authorizedWorkspace) {
      console.warn(`[Delete ${requestId}] User ${user.id} denied access to workspace: ${body.workspace}`)
      return structuredErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, {
        status: 401,
        details: {
          requestId,
          workspace: body.workspace,
        },
      })
    }

    // 4. Resolve workspace path
    const host = request.headers.get("host") || "localhost"
    const workspaceResult = await getWorkspace({ host, body, requestId })

    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    // 5. Resolve workspace to real path (follows symlinks, prevents workspace symlink attack)
    let resolvedWorkspace: string
    try {
      resolvedWorkspace = await realpath(workspaceResult.workspace)
    } catch {
      console.error(`[Delete ${requestId}] Failed to resolve workspace: ${workspaceResult.workspace}`)
      return structuredErrorResponse(ErrorCodes.WORKSPACE_NOT_FOUND, { status: 404, details: { requestId } })
    }

    // 6. Path traversal protection (string-based check first)
    const fullPath = path.join(resolvedWorkspace, targetPath)
    const resolvedPath = path.resolve(fullPath)

    if (!isPathWithinWorkspace(resolvedPath, resolvedWorkspace, path.sep)) {
      console.warn(`[Delete ${requestId}] Path traversal blocked: ${targetPath} -> ${resolvedPath}`)
      return structuredErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, {
        status: 403,
        details: {
          requestId,
          attemptedPath: targetPath,
          workspacePath: resolvedWorkspace,
        },
      })
    }

    // 7. Protected file/directory check (case-insensitive for macOS compatibility)
    const protectionCheck = isProtected(targetPath)
    if (protectionCheck.protected) {
      console.warn(`[Delete ${requestId}] Protected file blocked: ${targetPath}`)
      return structuredErrorResponse(ErrorCodes.FILE_PROTECTED, {
        status: 403,
        details: {
          requestId,
          filePath: targetPath,
          reason: protectionCheck.reason,
        },
      })
    }

    // 8. Use lstat() to check file WITHOUT following symlinks (TOCTOU protection)
    let lstats: Stats
    try {
      lstats = await lstat(resolvedPath)
    } catch (err: unknown) {
      const fsError = err as NodeJS.ErrnoException
      if (fsError.code === "ENOENT") {
        return structuredErrorResponse(ErrorCodes.FILE_NOT_FOUND, {
          status: 404,
          details: {
            requestId,
            filePath: targetPath,
          },
        })
      }
      throw err
    }

    // 9. If it's a symlink, validate the target is within workspace
    if (lstats.isSymbolicLink()) {
      const symlinkError = await validateSymlinkTarget(resolvedPath, resolvedWorkspace, requestId)
      if (symlinkError) {
        return symlinkError
      }
    }

    const isDir = lstats.isDirectory()

    // 10. Directory requires recursive flag
    if (isDir && !recursive) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: {
          requestId,
          message: "Cannot delete directory without recursive: true",
          hint: "Add recursive: true to delete directories",
        },
      })
    }

    // 11. Perform deletion with audit logging
    let fileCount = 0
    if (isDir) {
      // Count files for audit logging
      try {
        const countFiles = async (dir: string): Promise<number> => {
          let count = 0
          const entries = await readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isFile()) count++
            else if (entry.isDirectory()) {
              count += await countFiles(path.join(dir, entry.name))
            }
          }
          return count
        }
        fileCount = await countFiles(resolvedPath)
        console.log(
          `[Delete ${requestId}] Deleting directory: ${resolvedPath} (${fileCount} file${fileCount !== 1 ? "s" : ""})`,
        )
      } catch {
        // If counting fails, proceed with deletion anyway
        console.log(`[Delete ${requestId}] Deleting directory: ${resolvedPath}`)
      }
    } else {
      console.log(`[Delete ${requestId}] Deleting file: ${resolvedPath}`)
    }

    try {
      if (isDir) {
        await rm(resolvedPath, { recursive: true })
      } else {
        await unlink(resolvedPath)
      }
    } catch (err: unknown) {
      const fsError = err as NodeJS.ErrnoException
      console.error(`[Delete ${requestId}] Failed to delete: ${fsError.message}`)
      return structuredErrorResponse(ErrorCodes.FILE_DELETE_ERROR, {
        status: 500,
        details: {
          requestId,
          filePath: targetPath,
          error: fsError.message,
        },
      })
    }

    if (isDir && fileCount > 0) {
      console.log(
        `[Delete ${requestId}] Successfully deleted directory with ${fileCount} file${fileCount !== 1 ? "s" : ""}: ${resolvedPath}`,
      )
    } else {
      console.log(`[Delete ${requestId}] Successfully deleted: ${resolvedPath}`)
    }

    return NextResponse.json({
      ok: true,
      deleted: targetPath,
      type: isDir ? "directory" : "file",
    })
  } catch (error) {
    console.error(`[Delete ${requestId}] Unexpected error:`, error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.FILE_DELETE_ERROR, {
      status: 500,
      details: {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}
