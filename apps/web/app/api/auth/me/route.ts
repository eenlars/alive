/**
 * GET /api/auth/me
 *
 * Returns current user info from session.
 * Used by client-side hooks for feature flags.
 */

import { NextResponse } from "next/server"
import { protectedRoute } from "@/features/auth/lib/protectedRoute"

export const GET = protectedRoute(async ({ user }) => {
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
})
