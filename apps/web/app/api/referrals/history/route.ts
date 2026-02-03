// apps/web/app/api/referrals/history/route.ts

import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }
  const userId = user.id

  // Parse pagination params
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT), MAX_LIMIT)
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0)

  const iam = await createIamClient("service")

  // Get total count
  const { count: total } = await iam
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_id", userId)

  if (!total) {
    return NextResponse.json({ ok: true, data: { referrals: [], total: 0, hasMore: false } })
  }

  // Get paginated referrals
  const { data: referrals } = await iam
    .from("referrals")
    .select("referral_id, status, credits_awarded, created_at, completed_at, referred_id")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (!referrals?.length) {
    return NextResponse.json({ ok: true, data: { referrals: [], total, hasMore: false } })
  }

  // Get referred users
  const referredIds = referrals.map(r => r.referred_id)
  const { data: users } = await iam.from("users").select("user_id, email, display_name").in("user_id", referredIds)

  const userMap = new Map(users?.map(u => [u.user_id, u]) ?? [])

  const hasMore = offset + referrals.length < total

  return NextResponse.json({
    ok: true,
    data: {
      referrals: referrals.map(r => {
        const referredUser = userMap.get(r.referred_id)
        return {
          id: r.referral_id,
          status: r.status,
          creditsAwarded: r.credits_awarded,
          createdAt: r.created_at,
          completedAt: r.completed_at,
          referredEmail: referredUser?.email,
          referredName: referredUser?.display_name,
        }
      }),
      total,
      hasMore,
    },
  })
}
