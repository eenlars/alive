import { randomUUID } from "node:crypto"
import * as Sentry from "@sentry/nextjs"
import { hash } from "bcrypt"
import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { getRequestId } from "@/lib/request-id"
import { createIamClient } from "@/lib/supabase/iam"

/**
 * POST /api/manager/users/create - Create a new user account
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
    const { email, password, displayName, orgType, orgId, orgName } = body

    // Validate required fields
    if (!email || !password || !orgType) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    // Validate orgType
    if (orgType !== "new" && orgType !== "existing") {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    // Validate org-specific requirements
    if (orgType === "new" && !orgName) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    if (orgType === "existing" && !orgId) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    const iam = await createIamClient("service")

    // Check if user already exists
    const { data: existingUser } = await iam.from("users").select("user_id").eq("email", email).single()

    if (existingUser) {
      return createCorsErrorResponse(origin, ErrorCodes.EMAIL_ALREADY_REGISTERED, 409, { requestId })
    }

    // Hash password
    const passwordHash = await hash(password, 10)

    // Create user
    const userId = randomUUID()
    const { error: userError } = await iam
      .from("users")
      .insert({
        user_id: userId,
        email,
        password_hash: passwordHash,
        display_name: displayName || null,
        status: "active",
        is_test_env: false,
      })
      .select("user_id")
      .single()

    if (userError) {
      console.error("[Manager Users] Failed to create user:", userError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    let finalOrgId: string

    if (orgType === "new") {
      // Create new organization
      const newOrgId = randomUUID()
      const { error: orgError } = await iam
        .from("orgs")
        .insert({
          org_id: newOrgId,
          name: orgName,
          credits: 0,
          is_test_env: false,
        })
        .select("org_id")
        .single()

      if (orgError) {
        console.error("[Manager Users] Failed to create org:", orgError)
        // Cleanup user if org creation fails
        await iam.from("users").delete().eq("user_id", userId)
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }

      finalOrgId = newOrgId
    } else {
      // Verify org exists
      const { data: org, error: orgCheckError } = await iam.from("orgs").select("org_id").eq("org_id", orgId).single()

      if (orgCheckError || !org) {
        console.error("[Manager Users] Organization not found:", orgId)
        // Cleanup user if org verification fails
        await iam.from("users").delete().eq("user_id", userId)
        return createCorsErrorResponse(origin, ErrorCodes.ORG_NOT_FOUND, 404, { requestId })
      }

      finalOrgId = orgId
    }

    // Add user to organization as owner
    const { error: membershipError } = await iam.from("org_memberships").insert({
      org_id: finalOrgId,
      user_id: userId,
      role: "owner",
    })

    if (membershipError) {
      console.error("[Manager Users] Failed to create org membership:", membershipError)
      // Cleanup user and org if membership creation fails
      await iam.from("users").delete().eq("user_id", userId)
      if (orgType === "new") {
        await iam.from("orgs").delete().eq("org_id", finalOrgId)
      }
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    console.log(`[Manager Users] Created user ${email} (${userId}) in org ${finalOrgId}`)

    return createCorsSuccessResponse(origin, {
      user: {
        userId,
        email,
        displayName: displayName || null,
      },
      orgId: finalOrgId,
      requestId,
    })
  } catch (error) {
    console.error("[Manager Users] Unexpected error:", error)
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
