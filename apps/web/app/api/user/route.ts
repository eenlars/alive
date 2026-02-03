import { NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"

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
