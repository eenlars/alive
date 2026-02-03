import type { NextResponse } from "next/server"
import { getWorkspace, type WorkspaceResult } from "@/features/chat/lib/workspaceRetriever"
import { addCorsHeaders } from "@/lib/cors-utils"

export interface WorkspaceRequest {
  workspace?: string
  [key: string]: unknown
}

export interface ResolvedWorkspace {
  success: true
  workspace: string
}

export interface WorkspaceError {
  success: false
  response: NextResponse
}

export function resolveWorkspace(
  host: string,
  body: WorkspaceRequest,
  requestId: string,
  origin: string | null = null,
): WorkspaceResult {
  const workspaceResult = getWorkspace({ host, body, requestId })

  if (!workspaceResult.success) {
    // Pass through the original error response from workspaceRetriever
    // which contains more detailed error information
    if (origin) {
      addCorsHeaders(workspaceResult.response, origin)
    }
    return { success: false, response: workspaceResult.response }
  }

  return { success: true, workspace: workspaceResult.workspace }
}
