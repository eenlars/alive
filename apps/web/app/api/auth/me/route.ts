/**
 * GET /api/auth/me
 *
 * Returns current user info from session.
 * Used by client-side hooks for feature flags.
 */

import { NextResponse } from "next/server"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"

export async function GET() {
  const user = await getSessionUser()

  if (!user) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperadmin: user.isSuperadmin,
      isAdmin: user.isAdmin,
    },
  })
}
