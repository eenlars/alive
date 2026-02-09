import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import type { NextRequest } from "next/server"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { hasSessionCookie } from "@/features/auth/types/guards"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { alrighty, handleBody, isHandleBodyError } from "@/lib/api/server"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const jar = await (await import("next/headers")).cookies()
    if (!hasSessionCookie(jar.get(COOKIE_NAMES.SESSION))) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    const parsed = await handleBody("filespace/list", request)
    if (isHandleBodyError(parsed)) return parsed

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
        attemptedPath: resolvedPath,
        workspacePath: resolvedWorkspace,
      })
    }

    try {
      const entries = await readdir(fullPath, { withFileTypes: true })

      // Get stat info for size/modified (needed for filespace view)
      const files = await Promise.all(
        entries.map(async entry => {
          const entryPath = path.join(fullPath, entry.name)
          let size = 0
          let modified = ""
          try {
            const stats = await stat(entryPath)
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
        error: fsError instanceof Error ? fsError.message : "Unknown error",
      })
    }
  } catch (error) {
    console.error("[Filespace] List API error:", error)
    return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
