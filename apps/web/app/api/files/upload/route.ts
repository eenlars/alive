import { chown, mkdir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, getSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { writeAsWorkspaceOwner } from "@/features/workspace/lib/workspace-secure"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

/**
 * Maximum file size for uploads (10MB)
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/**
 * Allowed MIME types for uploads
 * Images: Claude's Read tool returns visual content
 * Documents: Claude's Read tool extracts text
 */
const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  // Documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
])

/**
 * Uploads directory name within workspace
 */
const UPLOADS_DIR = ".uploads"

/**
 * Sanitize filename to prevent directory traversal and special characters.
 * Preserves the file extension.
 */
function sanitizeFilename(filename: string): string {
  // Get extension
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)

  // Remove any path separators and dangerous characters
  const sanitizedBase = base
    .replace(/[/\\]/g, "") // Remove path separators
    .replace(/\.\./g, "") // Remove parent directory references
    .replace(/[^a-zA-Z0-9_\-. ]/g, "_") // Replace special chars with underscore
    .replace(/\s+/g, "_") // Replace spaces with underscore
    .replace(/_+/g, "_") // Collapse multiple underscores
    .slice(0, 100) // Limit length

  // If filename is empty after sanitization, use a default
  const finalBase = sanitizedBase || "file"

  // Add timestamp to prevent collisions
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).slice(2, 6)

  return `${finalBase}-${timestamp}-${randomSuffix}${ext.toLowerCase()}`
}

/**
 * POST /api/files/upload
 *
 * Uploads a file to the workspace's .uploads/ directory for Claude to read.
 *
 * Security:
 * - Requires session authentication AND workspace authorization
 * - File is saved within workspace boundary only
 * - Filename is sanitized to prevent path traversal
 * - File type and size are validated
 * - Uses writeAsWorkspaceOwner for correct file ownership
 *
 * Request: multipart/form-data
 * - file: File (required)
 * - workspace: string (required) - workspace identifier
 * - worktree: string (optional) - worktree slug
 *
 * Response:
 * - ok: true
 * - path: string - relative path within workspace (for Claude's Read tool)
 * - originalName: string - original filename
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    // 1. Authentication check
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    // 2. Parse multipart form data
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

    // 3. Validate file
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

    // 4. Verify workspace access
    const body = workspaceParam
      ? { workspace: String(workspaceParam), worktree: worktreeParam ? String(worktreeParam) : undefined }
      : {}
    const authorizedWorkspace = await verifyWorkspaceAccess(user, body, `[Upload ${requestId}]`)

    if (!authorizedWorkspace) {
      console.warn(`[Upload ${requestId}] User ${user.id} denied access to workspace: ${workspaceParam}`)
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, {
        requestId,
        workspace: workspaceParam,
      })
    }

    // 5. Resolve workspace path
    const host = request.headers.get("host") || "localhost"
    const workspaceResult = await getWorkspace({ host, body, requestId })

    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    // 6. Resolve to real path (prevents symlink attacks)
    let resolvedWorkspace: string
    try {
      resolvedWorkspace = await realpath(workspaceResult.workspace)
    } catch {
      console.error(`[Upload ${requestId}] Failed to resolve workspace: ${workspaceResult.workspace}`)
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_FOUND, 404, { requestId })
    }

    // 7. Get workspace ownership info
    const workspaceStats = await stat(resolvedWorkspace)
    const { uid, gid } = workspaceStats

    // 8. Prepare uploads directory
    const uploadsDir = path.join(resolvedWorkspace, UPLOADS_DIR)

    // Create uploads directory if it doesn't exist
    try {
      await mkdir(uploadsDir, { recursive: true })
      await chown(uploadsDir, uid, gid)
    } catch (err) {
      // Ignore EEXIST, rethrow others
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
        console.error(`[Upload ${requestId}] Failed to create uploads directory:`, err)
        Sentry.captureException(err)
        return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, 500, {
          requestId,
          reason: "Failed to create uploads directory",
        })
      }
    }

    // 9. Sanitize filename and create full path
    const sanitizedName = sanitizeFilename(file.name)
    const savePath = path.join(uploadsDir, sanitizedName)
    const resolvedSavePath = path.resolve(savePath)

    // 10. Security: verify save path is within workspace
    if (!isPathWithinWorkspace(resolvedSavePath, resolvedWorkspace, path.sep)) {
      console.warn(`[Upload ${requestId}] Path traversal blocked: ${sanitizedName} -> ${resolvedSavePath}`)
      return createErrorResponse(ErrorCodes.PATH_OUTSIDE_WORKSPACE, 403, {
        requestId,
        attemptedPath: sanitizedName,
      })
    }

    // 11. Convert file to buffer and write
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    try {
      writeAsWorkspaceOwner(resolvedSavePath, buffer, { uid, gid })
    } catch (err) {
      console.error(`[Upload ${requestId}] Failed to write file:`, err)
      Sentry.captureException(err)
      return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, 500, {
        requestId,
        reason: "Failed to write uploaded file",
      })
    }

    // 12. Return success with relative path for SDK Read tool
    const relativePath = `${UPLOADS_DIR}/${sanitizedName}`

    console.log(`[Upload ${requestId}] Successfully uploaded: ${file.name} -> ${relativePath} (${file.size} bytes)`)

    return NextResponse.json({
      ok: true,
      path: relativePath,
      originalName: file.name,
      size: file.size,
      mimeType: file.type,
    })
  } catch (error) {
    console.error(`[Upload ${requestId}] Unexpected error:`, error)
    Sentry.captureException(error)
    return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
