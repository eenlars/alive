import * as Sentry from "@sentry/nextjs"
import { createClient } from "@supabase/supabase-js"
import type { AppDatabase } from "@webalive/database"
import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { getAllFeedback } from "@/lib/feedback"
import { createIamClient } from "@/lib/supabase/iam"
import { generateRequestId } from "@/lib/utils"

// Type for membership with nested user data from Supabase join
interface MembershipWithUser {
  org_id: string
  user_id: string
  role: string
  created_at: string | null
  users: {
    user_id: string
    email: string
    display_name: string | null
  } | null
}

/**
 * GET /api/manager/orgs - Fetch all organizations with their members
 */
export async function GET(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const startTime = performance.now()
    const timings: Record<string, number> = {}

    const iam = await createIamClient("service")

    // Fetch all orgs (excluding test orgs)
    const orgsStart = performance.now()
    const { data: orgs, error: orgsError } = await iam
      .from("orgs")
      .select("*")
      .eq("is_test_env", false)
      .order("created_at", { ascending: false })
    timings.orgs_fetch = performance.now() - orgsStart

    if (orgsError) {
      console.error("[Manager Orgs] Failed to fetch orgs:", orgsError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    // Fetch all memberships with user details
    const { data: memberships, error: membershipsError } = await iam
      .from("org_memberships")
      .select(
        `
        org_id,
        user_id,
        role,
        created_at,
        users:user_id (
          user_id,
          email,
          display_name
        )
      `,
      )
      .order("created_at", { ascending: false })

    if (membershipsError) {
      console.error("[Manager Orgs] Failed to fetch memberships:", membershipsError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    // Group memberships by org_id
    const membersByOrg = (memberships as MembershipWithUser[] | null)?.reduce(
      (acc, membership) => {
        if (!acc[membership.org_id]) {
          acc[membership.org_id] = []
        }
        acc[membership.org_id].push({
          user_id: membership.user_id,
          email: membership.users?.email || "Unknown",
          display_name: membership.users?.display_name || null,
          role: membership.role,
          created_at: membership.created_at,
        })
        return acc
      },
      {} as Record<
        string,
        Array<{
          user_id: string
          email: string
          display_name: string | null
          role: string
          created_at: string | null
        }>
      >,
    )

    // Fetch domains from app schema
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials")
    }

    const app = createClient<AppDatabase>(supabaseUrl, supabaseKey, {
      db: { schema: "app" },
    })

    const { data: domains } = await app
      .from("domains")
      .select("*")
      .eq("is_test_env", false)
      .order("created_at", { ascending: false })

    // Group domains by org_id
    const domainsByOrg = domains?.reduce(
      (acc, domain) => {
        if (domain.org_id) {
          if (!acc[domain.org_id]) {
            acc[domain.org_id] = []
          }
          acc[domain.org_id].push(domain)
        }
        return acc
      },
      {} as Record<string, typeof domains>,
    )

    // Combine orgs with their members and domains
    const orgsWithMembers = orgs?.map(org => ({
      org_id: org.org_id,
      name: org.name,
      credits: org.credits,
      created_at: org.created_at,
      updated_at: org.updated_at,
      members: membersByOrg?.[org.org_id] || [],
      member_count: membersByOrg?.[org.org_id]?.length || 0,
      domains: domainsByOrg?.[org.org_id] || [],
      domain_count: domainsByOrg?.[org.org_id]?.length || 0,
    }))

    // Fetch feedback
    const feedbackStart = performance.now()
    const feedback = await getAllFeedback()
    timings.feedback_fetch = performance.now() - feedbackStart

    timings.total = performance.now() - startTime

    return createCorsSuccessResponse(origin, {
      orgs: orgsWithMembers || [],
      feedback: feedback || [],
      requestId,
      debug: {
        timings: {
          orgs_fetch_ms: Math.round(timings.orgs_fetch * 100) / 100,
          feedback_fetch_ms: Math.round(timings.feedback_fetch * 100) / 100,
          total_ms: Math.round(timings.total * 100) / 100,
        },
      },
    })
  } catch (error) {
    console.error("[Manager Orgs] Unexpected error:", error)
    Sentry.captureException(error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

/**
 * POST /api/manager/orgs - Update org credits or delete org
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
    const { org_id, credits } = body

    if (!org_id) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    const iam = await createIamClient("service")

    // Update org credits
    if (credits !== undefined) {
      const { error: updateError } = await iam.from("orgs").update({ credits }).eq("org_id", org_id)

      if (updateError) {
        console.error("[Manager Orgs] Failed to update org credits:", updateError)
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }
    }

    return createCorsSuccessResponse(origin, { requestId })
  } catch (error) {
    console.error("[Manager Orgs] Unexpected error:", error)
    Sentry.captureException(error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

/**
 * DELETE /api/manager/orgs - Delete an organization
 */
export async function DELETE(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check manager authentication
  if (!(await isManagerAuthenticated())) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const body = await req.json()
    const { org_id } = body

    if (!org_id) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    const iam = await createIamClient("service")

    // Update domains to remove org reference (nullify org_id in app schema)
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    const app = createClient<AppDatabase>(supabaseUrl, supabaseKey, {
      db: { schema: "app" },
    })

    const { error: domainsError } = await app.from("domains").update({ org_id: null }).eq("org_id", org_id)

    if (domainsError) {
      console.error("[Manager Orgs] Failed to nullify domain org references:", domainsError)
      // Don't fail the whole operation for this, just log it
    }

    // Delete org invites first (foreign key constraint)
    const { error: invitesError } = await iam.from("org_invites").delete().eq("org_id", org_id)

    if (invitesError) {
      console.error("[Manager Orgs] Failed to delete org invites:", invitesError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    // Delete org memberships (foreign key constraint)
    const { error: membershipsError } = await iam.from("org_memberships").delete().eq("org_id", org_id)

    if (membershipsError) {
      console.error("[Manager Orgs] Failed to delete org memberships:", membershipsError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    // Delete the org
    const { error: orgError } = await iam.from("orgs").delete().eq("org_id", org_id)

    if (orgError) {
      console.error("[Manager Orgs] Failed to delete org:", orgError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    return createCorsSuccessResponse(origin, { requestId })
  } catch (error) {
    console.error("[Manager Orgs] Unexpected error:", error)
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
