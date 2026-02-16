import type { Stats } from "node:fs"
import { lstat, rm, unlink } from "node:fs/promises"
import path from "node:path"
import * as Sentry from "@sentry/nextjs"
import type { NextRequest } from "next/server"
import { createErrorResponse, getSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { ensureDriveDir } from "@/features/chat/lib/drivePath"
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

    const parsed = await handleBody("drive/delete", request)
    if (isHandleBodyError(parsed)) return parsed

    const authorizedWorkspace = await verifyWorkspaceAccess(
      user,
      { workspace: parsed.workspace, worktree: parsed.worktree },
      `[Drive Delete ${requestId}]`,
    )
    if (!authorizedWorkspace) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, {
        requestId,
        workspace: parsed.workspace,
      })
    }

    const host = request.headers.get("host")
    if (!host) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        message: "Missing host header",
      })
    }
    const body = { workspace: parsed.workspace, worktree: parsed.worktree }
    const workspaceResult = await getWorkspace({ host, body, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    const drivePath = await ensureDriveDir(workspaceResult.workspace)
    const resolvedDrive = path.resolve(drivePath)
    const fullPath = path.join(resolvedDrive, parsed.path)
    const resolvedPath = path.resolve(fullPath)

    if (!isPathWithinWorkspace(resolvedPath, resolvedDrive, path.sep)) {
      return createErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, 403, {
        requestId,
        attemptedPath: parsed.path,
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
      console.error(`[Drive Delete ${requestId}] Failed:`, fsError.message)
      return createErrorResponse(ErrorCodes.FILE_DELETE_ERROR, 500, {
        requestId,
        filePath: parsed.path,
        error: fsError.message,
      })
    }

    console.log(`[Drive Delete ${requestId}] Deleted: ${resolvedPath}`)

    return alrighty("drive/delete", {
      deleted: parsed.path,
      type: isDir ? "directory" : "file",
    })
  } catch (error) {
    console.error(`[Drive Delete ${requestId}] Unexpected error:`, error)
    Sentry.captureException(error)
    return createErrorResponse(ErrorCodes.FILE_DELETE_ERROR, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
