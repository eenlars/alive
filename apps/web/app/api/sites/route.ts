/**
 * Sites API
 *
 * List sites (domains) for the current user's organizations.
 * Returns domain_id and hostname for use in automation configuration.
 */

import { isAliveWorkspace, SUPERADMIN } from "@webalive/shared"
import { protectedRoute } from "@/features/auth/lib/protectedRoute"
import { structuredErrorResponse } from "@/lib/api/responses"
import { alrighty } from "@/lib/api/server"
import { ErrorCodes } from "@/lib/error-codes"
import { createRLSAppClient, createRLSIamClient } from "@/lib/supabase/server-rls"
import { createServiceAppClient } from "@/lib/supabase/service"

export const GET = protectedRoute(async ({ user, req }) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("org_id")

  // Get user's org memberships
  const iam = await createRLSIamClient()
  const { data: memberships } = await iam.from("org_memberships").select("org_id").eq("user_id", user.id)

  if (!memberships || memberships.length === 0) {
    return alrighty("sites", { sites: [] })
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

  // For superadmins, include the alive platform domain (if not already present)
  if (user.isSuperadmin && !sites.some(s => isAliveWorkspace(s.hostname))) {
    const serviceApp = createServiceAppClient()
    const { data: aliveDomain, error: aliveDomainError } = await serviceApp
      .from("domains")
      .select("domain_id, hostname, org_id")
      .eq("hostname", SUPERADMIN.WORKSPACE_NAME)
      .maybeSingle()

    if (aliveDomainError) {
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
        status: 500,
        details: { message: "Failed to load alive workspace domain" },
      })
    }

    if (!aliveDomain) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 500,
        details: { message: `Reserved alive domain "${SUPERADMIN.WORKSPACE_NAME}" not found in database` },
      })
    }

    if (!aliveDomain.org_id) {
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
        status: 500,
        details: { message: "Alive domain has no org_id configured" },
      })
    }

    if (!orgId || aliveDomain.org_id === orgId) {
      sites.unshift({
        id: aliveDomain.domain_id,
        hostname: aliveDomain.hostname,
        org_id: aliveDomain.org_id,
      })
    }
  }

  return alrighty("sites", { sites })
})
