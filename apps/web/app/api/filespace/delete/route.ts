import type { Stats } from "node:fs"
import { lstat, rm, unlink } from "node:fs/promises"
import path from "node:path"
import type { NextRequest } from "next/server"
import { createErrorResponse, getSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { alrighty, handleBody, isHandleBodyError } from "@/lib/api/server"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

/** Critical files that cannot be deleted */
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

/** Protected directories that cannot be deleted */
const PROTECTED_DIRS = new Set(["node_modules", ".git", ".well-known"])

function isProtected(targetPath: string): { protected: boolean; reason?: string } {
  const basename = path.basename(targetPath).toLowerCase()
  const segments = targetPath
    .split(path.sep)
    .filter(Boolean)
    .map(s => s.toLowerCase())

  if (PROTECTED_FILES.has(basename)) {
    return { protected: true, reason: `'${path.basename(targetPath)}' is a critical file` }
  }

  for (const seg of segments) {
    if (PROTECTED_DIRS.has(seg)) {
      return { protected: true, reason: `Cannot delete files in '${seg}' directory` }
    }
  }

  if (PROTECTED_DIRS.has(basename)) {
    return { protected: true, reason: `'${path.basename(targetPath)}' is a protected directory` }
  }

  return { protected: false }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    const parsed = await handleBody("filespace/delete", request)
    if (isHandleBodyError(parsed)) return parsed

    const authorizedWorkspace = await verifyWorkspaceAccess(
      user,
      { workspace: parsed.workspace, worktree: parsed.worktree },
      `[Filespace Delete ${requestId}]`,
    )
    if (!authorizedWorkspace) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, {
        requestId,
        workspace: parsed.workspace,
      })
    }

    const host = request.headers.get("host") || "localhost"
    const body = { workspace: parsed.workspace, worktree: parsed.worktree }
    const workspaceResult = await getWorkspace({ host, body, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    const resolvedWorkspace = path.resolve(workspaceResult.workspace)
    const fullPath = path.join(resolvedWorkspace, parsed.path)
    const resolvedPath = path.resolve(fullPath)

    if (!isPathWithinWorkspace(resolvedPath, resolvedWorkspace, path.sep)) {
      return createErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, 403, {
        requestId,
        attemptedPath: parsed.path,
      })
    }

    const protectionCheck = isProtected(parsed.path)
    if (protectionCheck.protected) {
      return createErrorResponse(ErrorCodes.FILE_PROTECTED, 403, {
        requestId,
        filePath: parsed.path,
        reason: protectionCheck.reason,
      })
    }

    let lstats: Stats
    try {
      lstats = await lstat(resolvedPath)
    } catch (err: unknown) {
      const fsError = err as NodeJS.ErrnoException
      if (fsError.code === "ENOENT") {
        return createErrorResponse(ErrorCodes.FILE_NOT_FOUND, 404, {
          requestId,
          filePath: parsed.path,
        })
      }
      throw err
    }

    const isDir = lstats.isDirectory()

    if (isDir && !parsed.recursive) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        message: "Cannot delete directory without recursive: true",
      })
    }

    try {
      if (isDir) {
        await rm(resolvedPath, { recursive: true })
      } else {
        await unlink(resolvedPath)
      }
    } catch (err: unknown) {
      const fsError = err as NodeJS.ErrnoException
      console.error(`[Filespace Delete ${requestId}] Failed:`, fsError.message)
      return createErrorResponse(ErrorCodes.FILE_DELETE_ERROR, 500, {
        requestId,
        filePath: parsed.path,
        error: fsError.message,
      })
    }

    console.log(`[Filespace Delete ${requestId}] Deleted: ${resolvedPath}`)

    return alrighty("filespace/delete", {
      ok: true,
      deleted: parsed.path,
      type: isDir ? "directory" : "file",
    })
  } catch (error) {
    console.error(`[Filespace Delete ${requestId}] Unexpected error:`, error)
    return createErrorResponse(ErrorCodes.FILE_DELETE_ERROR, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
