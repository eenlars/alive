import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import type { NextRequest } from "next/server"
import { createErrorResponse, getSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { ensureDriveDir } from "@/features/chat/lib/drivePath"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { alrighty, handleBody, isHandleBodyError } from "@/lib/api/server"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

const MAX_FILE_SIZE = 1024 * 1024

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "pdf",
  "zip",
  "tar",
  "gz",
  "rar",
  "mp3",
  "mp4",
  "wav",
  "ogg",
  "webm",
  "exe",
  "dll",
  "so",
  "dylib",
  "db",
  "sqlite",
  "sqlite3",
])

function getLanguageFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || ""
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    bash: "bash",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    sql: "sql",
    vue: "vue",
    svelte: "svelte",
    txt: "plaintext",
  }
  return languageMap[ext] || "plaintext"
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    const parsed = await handleBody("drive/read", request)
    if (isHandleBodyError(parsed)) return parsed

    const authorizedWorkspace = await verifyWorkspaceAccess(
      user,
      { workspace: parsed.workspace, worktree: parsed.worktree },
      `[Drive Read ${requestId}]`,
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
      })
    }

    const ext = parsed.path.toLowerCase().split(".").pop() || ""
    if (BINARY_EXTENSIONS.has(ext)) {
      return createErrorResponse(ErrorCodes.BINARY_FILE_NOT_SUPPORTED, 400, {
        requestId,
        filePath: parsed.path,
        extension: ext,
      })
    }

    try {
      const fileStat = await stat(resolvedPath)
      if (fileStat.size > MAX_FILE_SIZE) {
        return createErrorResponse(ErrorCodes.FILE_TOO_LARGE_TO_READ, 400, {
          requestId,
          filePath: parsed.path,
          size: fileStat.size,
          maxSize: MAX_FILE_SIZE,
        })
      }

      const content = await readFile(resolvedPath, "utf-8")

      const filename = path.basename(parsed.path)
      const language = getLanguageFromFilename(filename)

      return alrighty("drive/read", {
        ok: true,
        path: parsed.path,
        filename,
        content,
        language,
        size: content.length,
      })
    } catch (fsError) {
      const err = fsError as NodeJS.ErrnoException
      if (err.code === "ENOENT") {
        return createErrorResponse(ErrorCodes.FILE_NOT_FOUND, 404, {
          requestId,
          filePath: parsed.path,
        })
      }
      if (err.code === "EISDIR") {
        return createErrorResponse(ErrorCodes.PATH_IS_DIRECTORY, 400, {
          requestId,
          filePath: parsed.path,
        })
      }
      console.error(`[Drive Read ${requestId}] Error reading file:`, fsError)
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, 500, {
        requestId,
        filePath: parsed.path,
        error: err.message,
      })
    }
  } catch (error) {
    console.error(`[Drive Read ${requestId}] Unexpected error:`, error)
    return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
