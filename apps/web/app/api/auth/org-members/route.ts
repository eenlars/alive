import * as Sentry from "@sentry/nextjs"
import { isOrgRole } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { canRemoveMember } from "@/lib/permissions/org-permissions"
import { createIamClient } from "@/lib/supabase/iam"
import { generateRequestId } from "@/lib/utils"

/**
 * GET /api/auth/org-members?orgId=xxx
 * Fetches all members of an organization with their roles
 */
export async function GET(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check authentication
  const user = await getSessionUser()
  if (!user) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  try {
    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get("orgId")

    if (!orgId) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    const iam = await createIamClient("service")

    // Get all members of the organization with user details
    const { data: members, error: membersError } = await iam
      .from("org_memberships")
      .select(
        `
        user_id,
        role,
        users!inner(
          email,
          display_name
        )
      `,
      )
      .eq("org_id", orgId)
      .order("role", { ascending: true })

    if (membersError) {
      console.error("[Org Members] Failed to fetch members:", membersError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    // Transform the data to a flatter structure, filtering invalid roles, and sort by email
    const formattedMembers = (members || [])
      .flatMap(m => {
        if (!isOrgRole(m.role)) {
          console.warn(`[Org Members] Skipping membership with invalid role "${m.role}" for user ${m.user_id}`)
          return []
        }
        return [
          {
            user_id: m.user_id,
            role: m.role,
            email: m.users?.email || "Unknown",
            display_name: m.users?.display_name || null,
          },
        ]
      })
      .sort((a, b) => a.email.localeCompare(b.email))

    return createCorsSuccessResponse(origin, {
      members: formattedMembers,
      requestId,
    })
  } catch (error) {
    console.error("[Org Members] Unexpected error:", error)
    Sentry.captureException(error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
  }
}

/**
 * DELETE /api/auth/org-members
 * Remove a member from an organization (owner/admin only)
 */
export async function DELETE(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")

  // Check authentication
  const user = await getSessionUser()
  if (!user) {
    return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
  }

  const userId = user.id

  try {
    const body = await req.json()
    const { orgId, targetUserId } = body

    if (!orgId || !targetUserId) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    const iam = await createIamClient("service")

    // Get current user's role in the organization
    const { data: currentUserMembership, error: currentUserError } = await iam
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .single()

    if (currentUserError || !currentUserMembership) {
      return createCorsErrorResponse(origin, ErrorCodes.ORG_ACCESS_DENIED, 403, { requestId })
    }

    // Get target user's role
    const { data: targetMembership, error: targetError } = await iam
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .single()

    if (targetError || !targetMembership) {
      return createCorsErrorResponse(origin, ErrorCodes.ORG_NOT_FOUND, 404, { requestId })
    }

    // Permission check
    if (!isOrgRole(currentUserMembership.role) || !isOrgRole(targetMembership.role)) {
      return createCorsErrorResponse(origin, ErrorCodes.ORG_ACCESS_DENIED, 403, { requestId })
    }

    const currentRole = currentUserMembership.role
    const targetRole = targetMembership.role
    const isLeavingOrg = userId === targetUserId

    if (!canRemoveMember(currentRole, targetRole, isLeavingOrg)) {
      return createCorsErrorResponse(origin, ErrorCodes.ORG_ACCESS_DENIED, 403, { requestId })
    }

    // Allow users to leave (remove themselves), but prevent admins/owners from removing themselves if they're the only one
    if (userId === targetUserId && currentRole === "owner") {
      // Check if there are other owners
      const { data: otherOwners, error: otherOwnersError } = await iam
        .from("org_memberships")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("role", "owner")
        .neq("user_id", userId)

      if (otherOwnersError) {
        console.error("[Org Members] Failed to check for other owners:", otherOwnersError)
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }

      if (!otherOwners || otherOwners.length === 0) {
        return createCorsErrorResponse(origin, ErrorCodes.ORG_ACCESS_DENIED, 403, { requestId })
      }
    }

    // Remove the member
    const { error: deleteError } = await iam
      .from("org_memberships")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)

    if (deleteError) {
      console.error("[Org Members] Failed to remove member:", deleteError)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
    }

    console.log(`[Org Members] User ${userId} removed ${targetUserId} from org ${orgId}`)

    return createCorsSuccessResponse(origin, {
      message: "Member removed successfully",
      requestId,
    })
  } catch (error) {
    console.error("[Org Members] Unexpected error:", error)
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
