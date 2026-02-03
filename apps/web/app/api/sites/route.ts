/**
 * Sites API
 *
 * List sites (domains) for the current user's organizations.
 * Returns domain_id and hostname for use in automation configuration.
 */

import type { NextRequest } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { structuredErrorResponse } from "@/lib/api/responses"
import { alrighty } from "@/lib/api/server"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get("org_id")

    // Get user's org memberships
    const iam = await createIamClient("service")
    const { data: memberships } = await iam.from("org_memberships").select("org_id").eq("user_id", user.id)

    if (!memberships || memberships.length === 0) {
      return alrighty("sites", { ok: true, sites: [] })
    }

    let orgIds = memberships.map(m => m.org_id)

    // Filter by org if provided
    if (orgId) {
      if (!orgIds.includes(orgId)) {
        return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, { status: 403 })
      }
      orgIds = [orgId]
    }

    // Get all domains for these orgs
    const app = await createAppClient("service")
    const { data: domains } = await app
      .from("domains")
      .select("domain_id, hostname, org_id")
      .in("org_id", orgIds)
      .order("hostname")

    const sites =
      domains
        ?.filter(d => d.org_id !== null)
        .map(d => ({
          id: d.domain_id,
          hostname: d.hostname,
          org_id: d.org_id as string, // filtered above
        })) || []

    return alrighty("sites", { ok: true, sites })
  } catch (error) {
    console.error("[Sites API] GET error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
