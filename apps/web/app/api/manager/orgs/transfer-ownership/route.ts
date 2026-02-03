import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"
import { generateRequestId } from "@/lib/utils"

const TransferOwnershipSchema = z.object({
  orgId: z.string().startsWith("org_"),
  newOwnerId: z.string().startsWith("user_"),
})

/**
 * POST /api/manager/orgs/transfer-ownership
 * Transfer organization ownership to another member
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const body = await req.json()
    const result = TransferOwnershipSchema.safeParse(body)

    if (!result.success) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        details: result.error.issues,
      })
    }

    const { orgId, newOwnerId } = result.data
    const iam = await createIamClient("service")

    // Verify new owner is a member of the org
    const { data: membership, error: membershipError } = await iam
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", newOwnerId)
      .single()

    if (membershipError || !membership) {
      return createCorsErrorResponse(origin, ErrorCodes.ORG_NOT_FOUND, 404, { requestId })
    }

    // Get current owner
    const { data: currentOwner } = await iam
      .from("org_memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("role", "owner")
      .single()

    // Update current owner to admin
    if (currentOwner) {
      const { error: demoteError } = await iam
        .from("org_memberships")
        .update({ role: "admin" })
        .eq("org_id", orgId)
        .eq("user_id", currentOwner.user_id)

      if (demoteError) {
        console.error("[Manager] Failed to demote current owner:", demoteError)
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }
    }

    // Update new owner's role
    const { error: promoteError } = await iam
      .from("org_memberships")
      .update({ role: "owner" })
      .eq("org_id", orgId)
      .eq("user_id", newOwnerId)

    if (promoteError) {
      console.error("[Manager] Failed to promote new owner:", promoteError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    console.log(`[Manager] Transferred ownership of org ${orgId} to user ${newOwnerId}`)

    return createCorsSuccessResponse(origin, { requestId })
  } catch (error) {
    console.error("[Manager] Transfer ownership error:", error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin)
  return res
}
