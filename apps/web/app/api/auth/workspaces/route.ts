import { randomUUID } from "node:crypto"
import { SECURITY, SUPERADMIN, TEST_CONFIG } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { filterLocalDomains } from "@/lib/domains"
import { ErrorCodes } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")
  const requestId = randomUUID()

  try {
    // Get optional org filter from query params
    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get("org_id")

    const user = await getSessionUser()
    if (!user) {
      return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
    }

    // Test mode
    if (process.env.BRIDGE_ENV === "local" && user.id === SECURITY.LOCAL_TEST.SESSION_VALUE) {
      return createCorsSuccessResponse(origin, {
        workspaces: [`test.${TEST_CONFIG.EMAIL_DOMAIN}`, `demo.${TEST_CONFIG.EMAIL_DOMAIN}`],
      })
    }

    // Get user's org memberships
    const iam = await createIamClient("service")
    const { data: memberships } = await iam.from("org_memberships").select("org_id").eq("user_id", user.id)

    if (!memberships || memberships.length === 0) {
      return createCorsSuccessResponse(origin, {
        workspaces: [],
      })
    }

    let orgIds = memberships.map(m => m.org_id)

    // If org filter provided, validate user has access and filter
    if (orgId) {
      if (!orgIds.includes(orgId)) {
        return createCorsErrorResponse(origin, ErrorCodes.ORG_ACCESS_DENIED, 403, { requestId })
      }
      orgIds = [orgId]
    }

    // Get all domains for these orgs (include is_test_env to handle test domains)
    const app = await createAppClient("service")
    const { data: domains } = await app.from("domains").select("hostname, is_test_env").in("org_id", orgIds)

    // Filter to only include domains that exist on THIS server
    // Exception: test domains (is_test_env=true) are always included - they don't exist on filesystem
    const realDomains = domains?.filter(d => !d.is_test_env).map(d => d.hostname) || []
    const testDomains = domains?.filter(d => d.is_test_env).map(d => d.hostname) || []
    let workspaces = [...filterLocalDomains(realDomains), ...testDomains]

    // SECURITY: claude-bridge workspace is only visible to superadmins
    // Non-superadmins should never see it in the list
    if (!user.isSuperadmin) {
      workspaces = workspaces.filter(w => w !== SUPERADMIN.WORKSPACE_NAME)
    }

    return createCorsSuccessResponse(origin, {
      workspaces,
    })
  } catch (_error) {
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
