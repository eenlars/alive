import { randomUUID } from "node:crypto"
import { SECURITY, SUPERADMIN, TEST_CONFIG } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

/**
 * Batch endpoint to fetch all workspaces for all organizations in one request
 * This is much faster than fetching each org individually
 * Returns: { org_id -> [workspace1, workspace2, ...] }
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")
  const requestId = randomUUID()

  try {
    const user = await getSessionUser()
    if (!user) {
      return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
    }

    // Test mode
    if (process.env.STREAM_ENV === "local" && user.id === SECURITY.LOCAL_TEST.SESSION_VALUE) {
      return createCorsSuccessResponse(origin, {
        workspaces: {
          "test-org": [`test.${TEST_CONFIG.EMAIL_DOMAIN}`, `demo.${TEST_CONFIG.EMAIL_DOMAIN}`],
        },
      })
    }

    // Get user's org memberships
    const iam = await createIamClient("service")
    const { data: memberships } = await iam.from("org_memberships").select("org_id").eq("user_id", user.id)

    if (!memberships || memberships.length === 0) {
      return createCorsSuccessResponse(origin, {
        workspaces: {},
      })
    }

    const orgIds = memberships.map(m => m.org_id)

    // Get all domains for these orgs
    const app = await createAppClient("service")
    const { data: domains } = await app.from("domains").select("hostname,org_id").in("org_id", orgIds)

    // Group workspaces by org_id
    const workspacesByOrg: Record<string, string[]> = {}
    for (const org of orgIds) {
      workspacesByOrg[org] = []
    }

    if (domains) {
      for (const domain of domains) {
        if (domain.org_id && domain.hostname) {
          // SECURITY: Never include claude-bridge workspace unless user is superadmin
          if (domain.hostname === SUPERADMIN.WORKSPACE_NAME && !user.isSuperadmin) {
            continue
          }

          if (!workspacesByOrg[domain.org_id]) {
            workspacesByOrg[domain.org_id] = []
          }
          workspacesByOrg[domain.org_id].push(domain.hostname)
        }
      }
    }

    return createCorsSuccessResponse(origin, {
      workspaces: workspacesByOrg,
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
