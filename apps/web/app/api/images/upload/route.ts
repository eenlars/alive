import * as Sentry from "@sentry/nextjs"
import { uploadImage } from "@webalive/images"
import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { resolveWorkspace } from "@/features/workspace/lib/workspace-utils"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { imageStorage } from "@/lib/storage"
import { workspaceToTenantId } from "@/lib/tenant-utils"
import { generateRequestId } from "@/lib/utils"

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  console.log(`[Image Upload ${requestId}] ⬆️ Request started`)

  try {
    // 1. Get authenticated user
    console.log(`[Image Upload ${requestId}] Step 1: Getting authenticated user`)
    const user = await requireSessionUser()
    console.log(`[Image Upload ${requestId}] ✓ User authenticated: ${user.id}`)

    // 2. Parse form data
    console.log(`[Image Upload ${requestId}] Step 2: Parsing form data`)
    const formData = await request.formData()
    const host = request.headers.get("host") || "localhost"
    console.log(`[Image Upload ${requestId}] ✓ Form data parsed, host: ${host}`)

    // 3. Security: Verify workspace authorization BEFORE any operations
    console.log(`[Image Upload ${requestId}] Step 3: Verifying workspace access`)
    const workspaceParam = formData.get("workspace") as string | null
    const worktreeParam = formData.get("worktree") as string | null

    // Build body object with optional worktree
    const body: { workspace?: string; worktree?: string } = {}
    if (workspaceParam) {
      body.workspace = workspaceParam
      if (worktreeParam) {
        body.worktree = worktreeParam
      }
    }

    console.log(
      `[Image Upload ${requestId}] Workspace param: ${workspaceParam || "(none)"}, Worktree param: ${worktreeParam || "(none)"}`,
    )

    const workspace = await verifyWorkspaceAccess(user, body, `[Upload ${requestId}]`)
    if (!workspace) {
      console.log(`[Image Upload ${requestId}] ✗ Workspace access denied`)
      return structuredErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, { status: 401, details: { requestId } })
    }
    console.log(`[Image Upload ${requestId}] ✓ Workspace access verified: ${workspace}`)

    // 4. Resolve workspace path (after authorization)
    console.log(`[Image Upload ${requestId}] Step 4: Resolving workspace path`)
    const workspaceResult = await resolveWorkspace(host, body, requestId)
    if (!workspaceResult.success) {
      console.log(`[Image Upload ${requestId}] ✗ Workspace resolution failed`)
      return workspaceResult.response
    }
    console.log(`[Image Upload ${requestId}] ✓ Workspace resolved: ${workspaceResult.workspace}`)

    // 5. Convert workspace to tenant ID
    const tenantId = workspaceToTenantId(workspaceResult.workspace)
    console.log(`[Image Upload ${requestId}] ✓ Tenant ID: ${tenantId}`)

    // 6. Parse file from FormData (already parsed above)
    console.log(`[Image Upload ${requestId}] Step 6: Getting file from form data`)
    const file = formData.get("file") as File

    if (!file) {
      console.log(`[Image Upload ${requestId}] ✗ No file in request`)
      return structuredErrorResponse(ErrorCodes.NO_FILE, { status: 400, details: { requestId } })
    }
    console.log(
      `[Image Upload ${requestId}] ✓ File received: ${file.name}, size: ${file.size} bytes, type: ${file.type}`,
    )

    // 7. Convert to Buffer
    console.log(`[Image Upload ${requestId}] Step 7: Converting to buffer`)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    console.log(`[Image Upload ${requestId}] ✓ Buffer created: ${buffer.length} bytes`)

    // 8. Get options
    const compress = formData.get("compress") !== "false"
    const variantsParam = formData.get("variants")
    const variants = variantsParam
      ? (variantsParam as string).split(",").map(v => v.trim())
      : ["orig", "w640", "w1280", "thumb"]
    console.log(`[Image Upload ${requestId}] Options: compress=${compress}, variants=${variants.join(",")}`)

    // 9. Upload via storage adapter
    console.log(`[Image Upload ${requestId}] Step 9: Uploading via storage adapter`)
    const uploadStart = Date.now()
    const result = await uploadImage(imageStorage, tenantId, buffer, {
      visibility: "public",
      variants: variants as any,
      compress,
      maxWidth: 2560,
      targetSize: 500 * 1024,
    })
    const uploadDuration = Date.now() - uploadStart
    console.log(`[Image Upload ${requestId}] Upload completed in ${uploadDuration}ms`)

    if (result.error) {
      console.error(`[Image Upload ${requestId}] ✗ Upload failed:`, result.error)
      Sentry.captureException(new Error(`Image upload failed: ${result.error}`))
      return structuredErrorResponse(ErrorCodes.IMAGE_UPLOAD_FAILED, { status: 500 })
    }

    console.log(`[Image Upload ${requestId}] ✓ Upload successful: hash=${result.data.contentHash}`)

    // 10. Return success with photobook key format (tenantId/contentHash)
    return NextResponse.json({
      ok: true,
      data: {
        key: `${tenantId}/${result.data.contentHash}`,
        ...result.data,
      },
    })
  } catch (error) {
    console.error(`[Image Upload ${requestId}] ✗ Unexpected error:`, error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.IMAGE_UPLOAD_FAILED, { status: 500 })
  }
}
