import * as Sentry from "@sentry/nextjs"
import { isOrgRole } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { getRequestId } from "@/lib/request-id"
import { createIamClient } from "@/lib/supabase/iam"

/**
 * POST /api/manager/orgs/members - Add or update org member
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const body = await req.json()
    const { org_id, user_id, role } = body

    if (!org_id || !user_id || !role) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    // Validate role
    if (!isOrgRole(role)) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    const iam = await createIamClient("service")

    // Check if membership already exists
    const { data: existing } = await iam
      .from("org_memberships")
      .select("*")
      .eq("org_id", org_id)
      .eq("user_id", user_id)
      .single()

    if (existing) {
      // Update existing membership
      const { error: updateError } = await iam
        .from("org_memberships")
        .update({ role })
        .eq("org_id", org_id)
        .eq("user_id", user_id)

      if (updateError) {
        console.error("[Manager Org Members] Failed to update membership:", updateError)
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }
    } else {
      // Create new membership
      const { error: insertError } = await iam.from("org_memberships").insert({
        org_id,
        user_id,
        role,
      })

      if (insertError) {
        console.error("[Manager Org Members] Failed to create membership:", insertError)
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }
    }

    return createCorsSuccessResponse(origin, { requestId })
  } catch (error) {
    console.error("[Manager Org Members] Unexpected error:", error)
    Sentry.captureException(error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

/**
 * DELETE /api/manager/orgs/members - Remove org member
 */
export async function DELETE(req: NextRequest) {
  const requestId = getRequestId(req)
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const body = await req.json()
    const { org_id, user_id } = body

    if (!org_id || !user_id) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    const iam = await createIamClient("service")

    // Delete the membership
    const { error: deleteError } = await iam
      .from("org_memberships")
      .delete()
      .eq("org_id", org_id)
      .eq("user_id", user_id)

    if (deleteError) {
      console.error("[Manager Org Members] Failed to delete membership:", deleteError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    return createCorsSuccessResponse(origin, { requestId })
  } catch (error) {
    console.error("[Manager Org Members] Unexpected error:", error)
    Sentry.captureException(error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
