import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { validateRequest } from "@/features/auth/lib/auth"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

export async function POST(req: Request) {
  const requestId = generateRequestId()
  console.log(`[Verify API ${requestId}] === VERIFICATION START ===`)

  try {
    // Validate session, body, and workspace authorization in one step
    const result = await validateRequest(req, requestId)
    if ("error" in result) return result.error

    const { body } = result.data
    console.log(`[Verify API ${requestId}] Raw body:`, body)

    const host = (await headers()).get("host") || "localhost"
    console.log(`[Verify API ${requestId}] Host: ${host}`)

    // Only after authorization, check if workspace directory exists
    const workspaceResult = await getWorkspace({ host, body, requestId })

    if (!workspaceResult.success) {
      console.log(`[Verify API ${requestId}] Workspace verification failed`)
      const errorResponse = await workspaceResult.response.json()
      return NextResponse.json(
        {
          ok: false,
          verified: false,
          ...errorResponse,
        },
        { status: 200 },
      )
    }

    console.log(`[Verify API ${requestId}] Workspace verification successful: ${workspaceResult.workspace}`)

    return NextResponse.json({
      ok: true,
      verified: true,
      workspace: workspaceResult.workspace,
      message: "Workspace directory found and accessible",
      requestId,
    })
  } catch (error) {
    console.error(`[Verify API ${requestId}] Verification failed:`, error)
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
