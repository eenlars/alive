import { readFile } from "node:fs/promises"
import path from "node:path"
import * as Sentry from "@sentry/nextjs"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { hasSessionCookie } from "@/features/auth/types/guards"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

// Max file size to read (1MB)
const MAX_FILE_SIZE = 1024 * 1024

// Binary file extensions that we won't read
const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "svg",
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
    zsh: "bash",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
    vue: "vue",
    svelte: "svelte",
  }
  return languageMap[ext] || "plaintext"
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const jar = await cookies()
    if (!hasSessionCookie(jar.get(COOKIE_NAMES.SESSION))) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    const body = await request.json()
    const host = request.headers.get("host") || "localhost"

    const workspaceResult = await getWorkspace({ host, body, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    const filePath = body.path
    if (!filePath || typeof filePath !== "string") {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        message: "Missing required field: path",
      })
    }

    const fullPath = path.join(workspaceResult.workspace, filePath)

    // Security check: ensure path is within workspace
    const resolvedPath = path.resolve(fullPath)
    const resolvedWorkspace = path.resolve(workspaceResult.workspace)
    if (!isPathWithinWorkspace(resolvedPath, resolvedWorkspace, path.sep)) {
      return createErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, 403, {
        requestId,
        attemptedPath: resolvedPath,
        workspacePath: resolvedWorkspace,
      })
    }

    // Check for binary files
    const ext = filePath.toLowerCase().split(".").pop() || ""
    if (BINARY_EXTENSIONS.has(ext)) {
      return createErrorResponse(ErrorCodes.BINARY_FILE_NOT_SUPPORTED, 400, {
        requestId,
        filePath,
        extension: ext,
      })
    }

    try {
      const content = await readFile(fullPath, "utf-8")

      // Check file size after reading (could also use stat before)
      if (content.length > MAX_FILE_SIZE) {
        return createErrorResponse(ErrorCodes.FILE_TOO_LARGE_TO_READ, 400, {
          requestId,
          filePath,
          size: content.length,
          maxSize: MAX_FILE_SIZE,
        })
      }

      const filename = path.basename(filePath)
      const language = getLanguageFromFilename(filename)

      return NextResponse.json({
        ok: true,
        path: filePath,
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
          filePath,
        })
      }
      if (err.code === "EISDIR") {
        return createErrorResponse(ErrorCodes.PATH_IS_DIRECTORY, 400, {
          requestId,
          filePath,
        })
      }
      console.error(`[Files/Read ${requestId}] Error reading file:`, fsError)
      Sentry.captureException(fsError)
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, 500, {
        requestId,
        filePath,
        error: err.message,
      })
    }
  } catch (error) {
    console.error("Files/Read API error:", error)
    Sentry.captureException(error)
    return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
