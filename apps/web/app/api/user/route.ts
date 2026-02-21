import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { handleBody, isHandleBodyError } from "@/lib/api/server"
import { ErrorCodes } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"

/**
 * GET /api/user
 * Returns current user info from session
 */
export async function GET() {
  const user = await getSessionUser()

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 })
  }

  return NextResponse.json({ user }, { status: 200 })
}

/**
 * PATCH /api/user
 * Update user profile (name, email)
 */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  const parsed = await handleBody("user/update", req)
  if (isHandleBodyError(parsed)) return parsed

  const updates: Record<string, string> = {}
  if (parsed.name !== undefined) updates.display_name = parsed.name
  if (parsed.email !== undefined) updates.email = parsed.email

  if (Object.keys(updates).length === 0) {
    return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400)
  }

  const iam = await createIamClient("service")
  const { error } = await iam.from("users").update(updates).eq("user_id", user.id)

  if (error) {
    // Unique constraint violation (e.g. duplicate email) → 409 Conflict
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 409)
    }
    console.error("[User API] Update error:", error)
    Sentry.captureException(error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }

  return NextResponse.json({ ok: true })
}
