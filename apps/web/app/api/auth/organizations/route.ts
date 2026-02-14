import { randomUUID } from "node:crypto"
import * as Sentry from "@sentry/nextjs"
import { buildSessionOrgClaims, isOrgAdminRole, SECURITY } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { COOKIE_NAMES, getClearCookieOptions } from "@/lib/auth/cookies"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"
import { createRLSAppClient, createRLSIamClient } from "@/lib/supabase/server-rls"

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")
  const host = req.headers.get("host") || undefined
  const requestId = randomUUID()

  try {
    // Get authenticated user
    const user = await getSessionUser()
    if (!user) {
      // Clear stale/invalid session cookie to prevent infinite 401 loops
      const res = createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })

      // Clear invalid session cookie (auto-cleanup for stuck mobile sessions)
      res.cookies.set(COOKIE_NAMES.SESSION, "", getClearCookieOptions(host))

      return res
    }

    // Test mode
    if (process.env.STREAM_ENV === "local" && user.id === SECURITY.LOCAL_TEST.SESSION_VALUE) {
      return createCorsSuccessResponse(origin, {
        organizations: [
          {
            org_id: "test-org-1",
            name: "Test Organization",
            credits: 1000,
            workspace_count: 2,
            role: "owner",
          },
        ],
        current_user_id: user.id,
      })
    }

    // Get user's org memberships with roles
    const iam = await createRLSIamClient()
    const { data: memberships, error: membershipError } = await iam
      .from("org_memberships")
      .select("org_id, role")
      .eq("user_id", user.id)

    if (membershipError) {
      console.error("[Organizations API] Error fetching memberships:", membershipError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    if (!memberships || memberships.length === 0) {
      return createCorsSuccessResponse(origin, {
        organizations: [],
      })
    }

    // Normalize memberships: filter invalid roles, deduplicate org IDs
    const { orgIds, orgRoles } = buildSessionOrgClaims(memberships)

    // Log skipped invalid memberships
    for (const membership of memberships) {
      if (membership.org_id && !orgRoles[membership.org_id]) {
        console.warn(
          `[Organizations API] Skipping org ${membership.org_id} with invalid role "${membership.role}" for user ${user.id}`,
        )
      }
    }

    if (orgIds.length === 0) {
      return createCorsSuccessResponse(origin, {
        organizations: [],
      })
    }

    // Get org details
    const { data: orgs, error: orgsError } = await iam
      .from("orgs")
      .select("org_id, name, credits")
      .in("org_id", orgIds)
      .order("name")

    if (orgsError) {
      console.error("[Organizations API] Error fetching orgs:", orgsError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    // Get workspace counts for each org
    const app = await createRLSAppClient()
    const { data: domains, error: domainsError } = await app.from("domains").select("org_id").in("org_id", orgIds)

    if (domainsError) {
      console.error("[Organizations API] Error fetching domains:", domainsError)
      // Continue without workspace counts
    }

    // Calculate workspace counts
    const workspaceCounts = new Map<string, number>()
    if (domains) {
      for (const domain of domains) {
        if (domain.org_id) {
          workspaceCounts.set(domain.org_id, (workspaceCounts.get(domain.org_id) || 0) + 1)
        }
      }
    }

    // Combine org data with workspace counts and user roles
    const organizations = (orgs || []).map(org => ({
      org_id: org.org_id,
      name: org.name,
      credits: org.credits,
      workspace_count: workspaceCounts.get(org.org_id) || 0,
      role: orgRoles[org.org_id],
    }))

    return createCorsSuccessResponse(origin, {
      organizations,
      current_user_id: user.id, // Include current user ID for permission checks
    })
  } catch (error) {
    console.error("[Organizations API] Unexpected error:", error)
    Sentry.captureException(error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

export async function PATCH(req: NextRequest) {
  const origin = req.headers.get("origin")
  const requestId = randomUUID()

  try {
    // Get authenticated user
    const user = await getSessionUser()
    if (!user) {
      return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
    }

    // Parse request body
    const body = await req.json()
    const { org_id, name } = body

    if (!org_id || !name) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    // Validate name
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      return createCorsErrorResponse(origin, ErrorCodes.VALIDATION_ERROR, 400, { requestId })
    }

    if (trimmedName.length > 100) {
      return createCorsErrorResponse(origin, ErrorCodes.VALIDATION_ERROR, 400, { requestId })
    }

    // Check if user has permission to update this org
    const iam = await createIamClient("service")
    const { data: membership, error: membershipError } = await iam
      .from("org_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", org_id)
      .single()

    if (membershipError || !membership) {
      return createCorsErrorResponse(origin, ErrorCodes.ORG_ACCESS_DENIED, 403, { requestId })
    }

    // Only owners and admins can update org name
    if (!isOrgAdminRole(membership.role)) {
      return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 403, { requestId })
    }

    // Update organization name
    const rlsIam = await createRLSIamClient()
    const { data: updatedOrg, error: updateError } = await rlsIam
      .from("orgs")
      .update({ name: trimmedName })
      .eq("org_id", org_id)
      .select("org_id, name, credits")
      .single()

    if (updateError) {
      console.error("[Organizations API] Error updating org:", updateError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    return createCorsSuccessResponse(origin, {
      organization: updatedOrg,
    })
  } catch (error) {
    console.error("[Organizations API] Unexpected error in PATCH:", error)
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
