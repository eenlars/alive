import { readFile } from "node:fs/promises"
import path from "node:path"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { hasSessionCookie } from "@/features/auth/types/guards"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { isPathWithinWorkspace } from "@/features/workspace/types/workspace"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

// Supported image extensions for OCR
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif"])

// Max file size for OCR (10MB)
const MAX_OCR_FILE_SIZE = 10 * 1024 * 1024

// OCR MCP server endpoint
const OCR_SERVER_URL = "http://localhost:8084"

interface OcrBlock {
  text: string
  confidence: number
  bbox: [number, number, number, number]
}

interface OcrResponse {
  text: string
  blocks: OcrBlock[]
  error?: string
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

    const workspaceResult = getWorkspace({ host, body, requestId })
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

    // Check file extension
    const ext = filePath.toLowerCase().split(".").pop() || ""
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        message: `Unsupported file type for OCR: .${ext}. Supported: ${[...IMAGE_EXTENSIONS].join(", ")}`,
      })
    }

    // Read the file
    let fileBuffer: Buffer
    try {
      fileBuffer = await readFile(fullPath)
    } catch (fsError) {
      const err = fsError as NodeJS.ErrnoException
      if (err.code === "ENOENT") {
        return createErrorResponse(ErrorCodes.FILE_NOT_FOUND, 404, {
          requestId,
          filePath,
        })
      }
      console.error(`[OCR ${requestId}] Error reading file:`, fsError)
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, 500, {
        requestId,
        filePath,
        error: err.message,
      })
    }

    // Check file size
    if (fileBuffer.length > MAX_OCR_FILE_SIZE) {
      return createErrorResponse(ErrorCodes.FILE_TOO_LARGE_TO_READ, 400, {
        requestId,
        filePath,
        size: fileBuffer.length,
        maxSize: MAX_OCR_FILE_SIZE,
      })
    }

    // Convert to base64
    const base64Data = fileBuffer.toString("base64")

    // Call OCR MCP server
    const ocrResponse = await fetch(`${OCR_SERVER_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/call",
        params: {
          name: "ocr_from_base64",
          arguments: { image_base64: base64Data },
        },
      }),
    })

    if (!ocrResponse.ok) {
      console.error(`[OCR ${requestId}] MCP server error: ${ocrResponse.status}`)
      return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
        requestId,
        message: "OCR service unavailable",
      })
    }

    // MCP server returns SSE format: "event: message\ndata: {...}\n\n"
    const responseText = await ocrResponse.text()
    const dataMatch = responseText.match(/^data: (.+)$/m)
    if (!dataMatch) {
      console.error(`[OCR ${requestId}] Invalid SSE response:`, responseText)
      return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
        requestId,
        message: "Invalid response from OCR service",
      })
    }

    const mpcResult = JSON.parse(dataMatch[1])

    // Extract the actual result from MCP response
    if (mpcResult.error) {
      console.error(`[OCR ${requestId}] MCP error:`, mpcResult.error)
      return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
        requestId,
        message: mpcResult.error.message || "OCR processing failed",
      })
    }

    // MCP tools/call returns result in content array
    const content = mpcResult.result?.content?.[0]
    if (!content || content.type !== "text") {
      return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
        requestId,
        message: "Invalid response from OCR service",
      })
    }

    const ocrResult: OcrResponse = JSON.parse(content.text)

    if (ocrResult.error) {
      return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
        requestId,
        message: ocrResult.error,
      })
    }

    return NextResponse.json({
      ok: true,
      path: filePath,
      text: ocrResult.text,
      blocks: ocrResult.blocks,
    })
  } catch (error) {
    console.error(`[OCR ${requestId}] API error:`, error)
    return createErrorResponse(ErrorCodes.REQUEST_PROCESSING_FAILED, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
