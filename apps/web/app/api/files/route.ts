import { readdir } from "node:fs/promises"
import path from "node:path"
import * as Sentry from "@sentry/nextjs"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { hasSessionCookie } from "@/features/auth/types/guards"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { structuredErrorResponse } from "@/lib/api/responses"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { ErrorCodes } from "@/lib/error-codes"
import { getRequestId } from "@/lib/request-id"

interface FileInfo {
  name: string
  type: "file" | "directory"
  size: number
  modified: string
  path: string
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request)

  try {
    const jar = await cookies()
    if (!hasSessionCookie(jar.get(COOKIE_NAMES.SESSION))) {
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401, details: { requestId } })
    }

    const body = await request.json()
    const host = request.headers.get("host") || "localhost"

    const workspaceResult = await getWorkspace({ host, body, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    const targetPath = body.path || ""
    const fullPath = path.join(workspaceResult.workspace, targetPath)

    // Security check: ensure path is within workspace
    const resolvedPath = path.resolve(fullPath)
    const resolvedWorkspace = path.resolve(workspaceResult.workspace)
    if (!isPathWithinWorkspace(resolvedPath, resolvedWorkspace, path.sep)) {
      console.warn(`[Files ${requestId}] Path traversal blocked: ${resolvedPath} outside ${resolvedWorkspace}`)
      return structuredErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, {
        status: 403,
        details: {
          requestId,
        },
      })
    }

    try {
      // Use withFileTypes to avoid separate stat calls
      const entries = await readdir(fullPath, { withFileTypes: true })

      // Build file list without extra stat calls - we don't need size/modified for tree view
      const files: FileInfo[] = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        size: 0, // Skip stat call - not needed for tree view
        modified: "", // Skip stat call - not needed for tree view
        path: path.join(targetPath, entry.name),
      }))

      // Skip sorting - client handles it for better caching
      return NextResponse.json({
        ok: true,
        path: targetPath,
        workspace: workspaceResult.workspace,
        files,
      })
    } catch (fsError) {
      console.error(`[Files ${requestId}] Error reading directory:`, fsError)
      Sentry.captureException(fsError)
      return structuredErrorResponse(ErrorCodes.FILE_READ_ERROR, {
        status: 500,
        details: {
          requestId,
          filePath: targetPath,
          error: fsError instanceof Error ? fsError.message : "Unknown error",
        },
      })
    }
  } catch (error) {
    console.error("Files API error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, {
      status: 500,
      details: {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}
