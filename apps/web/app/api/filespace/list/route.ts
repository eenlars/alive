import { lstat, readdir, readlink } from "node:fs/promises"
import path from "node:path"
import type { NextRequest } from "next/server"
import { createErrorResponse, getSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { alrighty, handleBody, isHandleBodyError } from "@/lib/api/server"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    const parsed = await handleBody("filespace/list", request)
    if (isHandleBodyError(parsed)) return parsed

    const authorizedWorkspace = await verifyWorkspaceAccess(
      user,
      { workspace: parsed.workspace, worktree: parsed.worktree },
      `[Filespace List ${requestId}]`,
    )
    if (!authorizedWorkspace) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, {
        requestId,
        workspace: parsed.workspace,
      })
    }

    const host = request.headers.get("host") || "localhost"
    const body = { workspace: parsed.workspace, path: parsed.path, worktree: parsed.worktree }

    const workspaceResult = await getWorkspace({ host, body, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    const targetPath = parsed.path || ""
    const fullPath = path.join(workspaceResult.workspace, targetPath)

    const resolvedPath = path.resolve(fullPath)
    const resolvedWorkspace = path.resolve(workspaceResult.workspace)
    if (!isPathWithinWorkspace(resolvedPath, resolvedWorkspace, path.sep)) {
      return createErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, 403, {
        requestId,
      })
    }

    try {
      const entries = await readdir(fullPath, { withFileTypes: true })

      // Get stat info for size/modified (needed for filespace view)
      // Uses lstat to avoid following symlinks outside workspace
      const files = await Promise.all(
        entries.map(async entry => {
          const entryPath = path.join(fullPath, entry.name)
          let size = 0
          let modified = ""
          try {
            if (entry.isSymbolicLink()) {
              const target = await readlink(entryPath)
              const resolvedTarget = path.resolve(path.dirname(entryPath), target)
              if (!isPathWithinWorkspace(resolvedTarget, resolvedWorkspace, path.sep)) {
                // Symlink points outside workspace — skip metadata
                return {
                  name: entry.name,
                  type: "file" as const,
                  size: 0,
                  modified: "",
                  path: path.join(targetPath, entry.name),
                }
              }
            }
            const stats = await lstat(entryPath)
            size = stats.size
            modified = stats.mtime.toISOString()
          } catch {
            // Skip stat errors (broken symlinks etc.)
          }
          return {
            name: entry.name,
            type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
            size,
            modified,
            path: path.join(targetPath, entry.name),
          }
        }),
      )

      return alrighty("filespace/list", {
        ok: true,
        path: targetPath,
        files,
      })
    } catch (fsError) {
      console.error(`[Filespace ${requestId}] Error reading directory:`, fsError)
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, 500, {
        requestId,
        filePath: targetPath,
      })
    }
  } catch (error) {
    console.error("[Filespace] List API error:", error)
    return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
      requestId,
    })
  }
}
