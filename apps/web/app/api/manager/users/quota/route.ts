import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { getRequestId } from "@/lib/request-id"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

interface UpdateQuotaRequest {
  userId: string
  maxSites: number
}

/**
 * PATCH /api/manager/users/quota - Update user site quota
 */
export async function PATCH(req: NextRequest) {
  const requestId = getRequestId(req)
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const body: UpdateQuotaRequest = await req.json()
    const { userId, maxSites } = body

    // Validate input
    if (!userId) {
      return createCorsErrorResponse(origin, ErrorCodes.VALIDATION_ERROR, 400, {
        requestId,
        details: { message: "userId is required" },
      })
    }

    if (typeof maxSites !== "number" || maxSites < 0 || !Number.isInteger(maxSites)) {
      return createCorsErrorResponse(origin, ErrorCodes.VALIDATION_ERROR, 400, {
        requestId,
        details: { message: "maxSites must be a non-negative integer" },
      })
    }

    const iam = await createIamClient("service")
    const app = await createAppClient("service")

    // Verify user exists
    const { data: user, error: userError } = await iam
      .from("users")
      .select("user_id, email")
      .eq("user_id", userId)
      .single()

    if (userError || !user) {
      console.error("[Manager Users Quota] User not found:", userId)
      return createCorsErrorResponse(origin, ErrorCodes.USER_NOT_FOUND, 404, { requestId })
    }

    // Check if quota record exists
    const { data: existingQuota } = await app.from("user_quotas").select("user_id").eq("user_id", userId).single()

    if (existingQuota) {
      // Update existing record
      const { error: updateError } = await app.from("user_quotas").update({ max_sites: maxSites }).eq("user_id", userId)

      if (updateError) {
        console.error("[Manager Users Quota] Failed to update quota:", updateError)
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }
    } else {
      // Insert new record
      const { error: insertError } = await app.from("user_quotas").insert({
        user_id: userId,
        max_sites: maxSites,
      })

      if (insertError) {
        console.error("[Manager Users Quota] Failed to create quota:", insertError)
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }
    }

    console.log(`[Manager Users Quota] Updated quota for ${user.email} to ${maxSites} sites`)

    return createCorsSuccessResponse(origin, {
      message: `Quota updated for ${user.email}`,
      userId,
      maxSites,
      requestId,
    })
  } catch (error) {
    console.error("[Manager Users Quota] Unexpected error:", error)
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
