import { LIMITS } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"
import { generateRequestId } from "@/lib/utils"

interface UserWithQuota {
  user_id: string
  email: string | null
  display_name: string | null
  created_at: string
  status: string
  site_count: number
  max_sites: number
}

/**
 * GET /api/manager/users - Fetch all users with site counts and quotas
 */
export async function GET(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const iam = await createIamClient("service")
    const app = await createAppClient("service")

    // Fetch all users (excluding test users)
    const { data: users, error: usersError } = await iam
      .from("users")
      .select("user_id, email, display_name, created_at, status")
      .eq("is_test_env", false)
      .order("created_at", { ascending: false })

    if (usersError) {
      console.error("[Manager Users] Failed to fetch users:", usersError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    if (!users || users.length === 0) {
      return createCorsSuccessResponse(origin, {
        users: [],
        requestId,
      })
    }

    // Get all user IDs
    const userIds = users.map(u => u.user_id)

    // Fetch quotas for all users
    const { data: quotas } = await app.from("user_quotas").select("user_id, max_sites").in("user_id", userIds)

    // Create a map of user_id -> max_sites
    const quotaMap = new Map<string, number>()
    if (quotas) {
      for (const q of quotas) {
        quotaMap.set(q.user_id, q.max_sites)
      }
    }

    // Fetch org memberships where user is owner
    const { data: memberships } = await iam
      .from("org_memberships")
      .select("user_id, org_id")
      .in("user_id", userIds)
      .eq("role", "owner")

    // Group org_ids by user_id
    const userOrgMap = new Map<string, string[]>()
    if (memberships) {
      for (const m of memberships) {
        const orgs = userOrgMap.get(m.user_id) || []
        orgs.push(m.org_id)
        userOrgMap.set(m.user_id, orgs)
      }
    }

    // Get all unique org_ids
    const allOrgIds = [...new Set(memberships?.map(m => m.org_id) || [])]

    // Count domains per org
    const orgDomainCounts = new Map<string, number>()
    if (allOrgIds.length > 0) {
      const { data: domains } = await app.from("domains").select("org_id").in("org_id", allOrgIds)

      if (domains) {
        for (const d of domains) {
          if (d.org_id) {
            orgDomainCounts.set(d.org_id, (orgDomainCounts.get(d.org_id) || 0) + 1)
          }
        }
      }
    }

    // Build final user list with site counts and quotas
    const usersWithQuota: UserWithQuota[] = users.map(user => {
      const userOrgs = userOrgMap.get(user.user_id) || []
      const siteCount = userOrgs.reduce((sum, orgId) => sum + (orgDomainCounts.get(orgId) || 0), 0)

      return {
        ...user,
        site_count: siteCount,
        max_sites: quotaMap.get(user.user_id) ?? LIMITS.MAX_SITES_PER_USER,
      }
    })

    console.log(`[Manager Users] Fetched ${usersWithQuota.length} users with quotas`)

    return createCorsSuccessResponse(origin, {
      users: usersWithQuota,
      requestId,
    })
  } catch (error) {
    console.error("[Manager Users] Unexpected error:", error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
