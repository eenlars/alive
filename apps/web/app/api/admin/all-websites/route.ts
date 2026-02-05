import { randomUUID } from "node:crypto"
import type { NextRequest } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { getAllDomains } from "@/lib/deployment/domain-registry"
import { ErrorCodes } from "@/lib/error-codes"

/**
 * Superadmin-only endpoint to fetch ALL websites across all users/organizations.
 * Used in the website viewer to give superadmins visibility into all deployed sites.
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")
  const requestId = randomUUID()

  const user = await getSessionUser()
  if (!user) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  if (!user.isSuperadmin) {
    return createCorsErrorResponse(origin, ErrorCodes.FORBIDDEN, 403, {
      requestId,
      details: { message: "Superadmin access required" },
    })
  }

  // Get all domains with full info (including owner email, org name, etc.)
  const allDomains = await getAllDomains()

  // Group by org for easier display
  const websitesByOrg: Record<string, { orgName: string; websites: typeof allDomains }> = {}

  for (const domain of allDomains) {
    const orgId = domain.orgId || "no-org"
    if (!websitesByOrg[orgId]) {
      websitesByOrg[orgId] = {
        orgName: domain.orgName || "Unknown Organization",
        websites: [],
      }
    }
    websitesByOrg[orgId].websites.push(domain)
  }

  return createCorsSuccessResponse(origin, {
    total: allDomains.length,
    websitesByOrg,
  })
}
