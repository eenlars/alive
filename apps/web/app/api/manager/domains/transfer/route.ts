import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"
import { generateRequestId } from "@/lib/utils"

const TransferDomainSchema = z.object({
  hostname: z.string().min(1, "hostname is required"),
  targetOrgId: z.string().min(1, "targetOrgId is required"),
})

/**
 * POST /api/manager/domains/transfer
 * Transfer a domain to a different organization
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const body = await req.json()
    const result = TransferDomainSchema.safeParse(body)

    if (!result.success) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, {
        requestId,
        details: result.error.issues,
      })
    }

    const { hostname, targetOrgId } = result.data

    // Verify target org exists
    const iam = await createIamClient("service")
    const { data: org, error: orgError } = await iam
      .from("orgs")
      .select("org_id, name")
      .eq("org_id", targetOrgId)
      .single()

    if (orgError || !org) {
      console.error("[Manager Domain Transfer] Target org not found:", targetOrgId)
      return createCorsErrorResponse(origin, ErrorCodes.ORG_NOT_FOUND, 404, {
        requestId,
        details: { message: `Organization ${targetOrgId} not found` },
      })
    }

    // Get current domain state
    const app = await createAppClient("service")
    const { data: domain, error: domainError } = await app.from("domains").select("*").eq("hostname", hostname).single()

    if (domainError || !domain) {
      console.error("[Manager Domain Transfer] Domain not found:", hostname)
      return createCorsErrorResponse(origin, ErrorCodes.SITE_NOT_FOUND, 404, {
        requestId,
        details: { message: `Domain ${hostname} not found` },
      })
    }

    const previousOrgId = domain.org_id

    // Update domain's org_id
    const { data: updated, error: updateError } = await app
      .from("domains")
      .update({ org_id: targetOrgId })
      .eq("hostname", hostname)
      .select()
      .single()

    if (updateError) {
      console.error("[Manager Domain Transfer] Failed to transfer domain:", updateError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
        requestId,
        details: { message: updateError.message },
      })
    }

    console.log(
      `[Manager Domain Transfer] Transferred ${hostname} from org ${previousOrgId || "none"} to ${targetOrgId} (${org.name})`,
    )

    return createCorsSuccessResponse(origin, {
      requestId,
      domain: updated,
      transfer: {
        hostname,
        previousOrgId,
        newOrgId: targetOrgId,
        newOrgName: org.name,
      },
    })
  } catch (error) {
    console.error("[Manager Domain Transfer] Unexpected error:", error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
      requestId,
      details: {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}

/**
 * OPTIONS /api/manager/domains/transfer
 * CORS preflight
 */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin")
  const res = new NextResponse(null, { status: 204 })
  addCorsHeaders(res, origin)
  return res
}
