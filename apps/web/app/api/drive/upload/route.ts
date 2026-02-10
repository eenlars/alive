import { stat } from "node:fs/promises"
import path from "node:path"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, getSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { ensureDriveDir } from "@/features/chat/lib/drivePath"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { writeAsWorkspaceOwner } from "@/features/workspace/lib/workspace-secure"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

const MAX_FILE_SIZE = 10 * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
])

function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)

  const sanitizedBase = base
    .replace(/[/\\]/g, "")
    .replace(/\.\./g, "")
    .replace(/[^a-zA-Z0-9_\-. ]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100)

  const finalBase = sanitizedBase || "file"
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).slice(2, 6)

  return `${finalBase}-${timestamp}-${randomSuffix}${ext.toLowerCase()}`
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        message: "Failed to parse form data",
      })
    }

    const file = formData.get("file")
    const workspaceParam = formData.get("workspace")
    const worktreeParam = formData.get("worktree")

    if (!file || !(file instanceof File)) {
      return createErrorResponse(ErrorCodes.NO_FILE, 400, { requestId })
    }

    if (file.size > MAX_FILE_SIZE) {
      return createErrorResponse(ErrorCodes.FILE_TOO_LARGE, 400, {
        requestId,
        maxSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
      })
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return createErrorResponse(ErrorCodes.INVALID_FILE_TYPE, 400, {
        requestId,
        fileType: file.type,
        allowed: Array.from(ALLOWED_MIME_TYPES),
      })
    }

    if (!workspaceParam || typeof workspaceParam !== "string") {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        message: "Missing required field: workspace",
      })
    }

    const body = { workspace: workspaceParam, worktree: worktreeParam ? String(worktreeParam) : undefined }
    const authorizedWorkspace = await verifyWorkspaceAccess(user, body, `[Drive Upload ${requestId}]`)
    if (!authorizedWorkspace) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, {
        requestId,
        workspace: workspaceParam,
      })
    }

    const host = request.headers.get("host")
    if (!host) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        message: "Missing host header",
      })
    }

    const workspaceResult = await getWorkspace({ host, body, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    const drivePath = await ensureDriveDir(workspaceResult.workspace)
    const resolvedDrive = path.resolve(drivePath)

    // Get ownership info from workspace
    const workspaceStats = await stat(workspaceResult.workspace)
    const { uid, gid } = workspaceStats

    const sanitizedName = sanitizeFilename(file.name)
    const savePath = path.join(resolvedDrive, sanitizedName)
    const resolvedSavePath = path.resolve(savePath)

    if (!isPathWithinWorkspace(resolvedSavePath, resolvedDrive, path.sep)) {
      return createErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, 403, {
        requestId,
        attemptedPath: sanitizedName,
      })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    try {
      writeAsWorkspaceOwner(resolvedSavePath, buffer, { uid, gid })
    } catch (err) {
      console.error(`[Drive Upload ${requestId}] Failed to write file:`, err)
      return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, 500, {
        requestId,
        reason: "Failed to write uploaded file",
      })
    }

    console.log(`[Drive Upload ${requestId}] Uploaded: ${file.name} -> ${sanitizedName} (${file.size} bytes)`)

    return NextResponse.json({
      ok: true,
      path: sanitizedName,
      originalName: file.name,
      size: file.size,
      mimeType: file.type,
    })
  } catch (error) {
    console.error(`[Drive Upload ${requestId}] Unexpected error:`, error)
    return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
