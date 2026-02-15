/**
 * Sites API
 *
 * List sites (domains) for the current user's organizations.
 * Returns domain_id and hostname for use in automation configuration.
 */

import { protectedRoute } from "@/features/auth/lib/protectedRoute"
import { structuredErrorResponse } from "@/lib/api/responses"
import { alrighty } from "@/lib/api/server"
import { ErrorCodes } from "@/lib/error-codes"
import { createRLSAppClient, createRLSIamClient } from "@/lib/supabase/server-rls"

export const GET = protectedRoute(async ({ user, req }) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("org_id")

  // Get user's org memberships
  const iam = await createRLSIamClient()
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
  const app = await createRLSAppClient()
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
})
