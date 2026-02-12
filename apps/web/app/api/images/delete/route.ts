import * as Sentry from "@sentry/nextjs"
import type { NextRequest } from "next/server"
import { createErrorResponse, requireSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { resolveWorkspace } from "@/features/workspace/lib/workspace-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { imageStorage } from "@/lib/storage"
import { workspaceToTenantId } from "@/lib/tenant-utils"
import { generateRequestId } from "@/lib/utils"

export async function DELETE(request: NextRequest) {
  const requestId = generateRequestId()
  try {
    // 1. Get authenticated user
    const user = await requireSessionUser()

    // 2. Parse request body
    const body = await request.json()
    const { key } = body

    if (!key || typeof key !== "string") {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        field: "key",
        requestId,
      })
    }

    // 3. Security: Verify workspace authorization BEFORE any operations
    const workspace = await verifyWorkspaceAccess(user, body, `[Delete ${requestId}]`)
    if (!workspace) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, { requestId })
    }

    // 4. Resolve workspace path (after authorization)
    const host = request.headers.get("host") || ""
    const workspaceResult = await resolveWorkspace(host, body, requestId)
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    // 5. Convert workspace to tenant ID
    const tenantId = workspaceToTenantId(workspaceResult.workspace)

    // 6. Validate key belongs to this tenant
    // Key format: {tenantId}/{contentHash}
    if (!key.startsWith(`${tenantId}/`)) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 403, { requestId })
    }

    const contentHash = key.replace(`${tenantId}/`, "")

    // 7. List all variants for this content hash
    const listResult = await imageStorage.list(tenantId, contentHash)
    if (listResult.error) {
      return createErrorResponse(ErrorCodes.IMAGE_DELETE_FAILED, 404, { requestId })
    }

    // 8. Delete all variants
    const deletePromises = listResult.data.map(async variantKey => {
      const deleteResult = await imageStorage.delete(variantKey)
      if (deleteResult.error) {
        console.error(`Failed to delete variant ${variantKey}:`, deleteResult.error)
        Sentry.captureException(new Error(`Image delete failed for variant ${variantKey}: ${deleteResult.error}`))
      }
      return deleteResult
    })

    await Promise.all(deletePromises)

    return Response.json({
      ok: true,
      message: `Deleted ${listResult.data.length} variants`,
    })
  } catch (error) {
    console.error("Delete image error:", error)
    Sentry.captureException(error)
    return createErrorResponse(ErrorCodes.IMAGE_DELETE_FAILED, 500, {
      exception: error instanceof Error ? error.message : "Failed to delete image",
      requestId,
    })
  }
}
