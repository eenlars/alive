import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"
import { generateRequestId } from "@/lib/utils"

/**
 * POST /api/manager/orgs/create - Create a new organization
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
    const { name, credits = 0, ownerUserId } = body

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    // Validate credits
    if (typeof credits !== "number" || credits < 0) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    const iam = await createIamClient("service")

    // If ownerUserId is provided, verify the user exists
    if (ownerUserId) {
      const { data: user, error: userError } = await iam
        .from("users")
        .select("user_id")
        .eq("user_id", ownerUserId)
        .single()

      if (userError || !user) {
        console.error("[Manager Orgs] Owner user not found:", ownerUserId)
        return createCorsErrorResponse(origin, ErrorCodes.USER_NOT_FOUND, 404, { requestId })
      }
    }

    // Create the organization
    const { data: org, error: orgError } = await iam
      .from("orgs")
      .insert({
        name: name.trim(),
        credits: credits,
        is_test_env: false,
      })
      .select()
      .single()

    if (orgError) {
      console.error("[Manager Orgs] Failed to create org:", orgError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    // If an owner user ID is provided, add them as owner
    if (ownerUserId) {
      const { error: membershipError } = await iam.from("org_memberships").insert({
        org_id: org.org_id,
        user_id: ownerUserId,
        role: "owner",
      })

      if (membershipError) {
        console.error("[Manager Orgs] Failed to add owner membership:", membershipError)
        // Rollback: delete the org since we couldn't add the owner
        await iam.from("orgs").delete().eq("org_id", org.org_id)
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }
    }

    console.log(`[Manager Orgs] Created org ${org.name} (${org.org_id})`)

    return createCorsSuccessResponse(origin, {
      org: {
        org_id: org.org_id,
        name: org.name,
        credits: org.credits,
      },
      requestId,
    })
  } catch (error) {
    console.error("[Manager Orgs] Unexpected error:", error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
