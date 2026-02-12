/**
 * User Preferences API
 *
 * GET: Fetch user's preferences (workspace selection, recent workspaces)
 * PUT: Update user's preferences
 *
 * Used for cross-device sync of workspace selection.
 */

import * as Sentry from "@sentry/nextjs"
import type { Json } from "@webalive/database"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"

// =============================================================================
// Types
// =============================================================================

interface RecentWorkspace {
  domain: string
  orgId: string
  lastAccessed: number
}

interface UserPreferencesPayload {
  currentWorkspace?: string | null
  selectedOrgId?: string | null
  recentWorkspaces?: RecentWorkspace[]
}

// =============================================================================
// GET /api/user/preferences
// =============================================================================

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const iam = await createIamClient("service")

    const { data, error } = await iam
      .from("user_preferences")
      .select("current_workspace, selected_org_id, recent_workspaces, updated_at")
      .eq("user_id", user.id)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned (user has no preferences yet)
      console.error("[preferences] Failed to fetch:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    // Return defaults if no preferences exist yet
    if (!data) {
      return NextResponse.json({
        currentWorkspace: null,
        selectedOrgId: null,
        recentWorkspaces: [],
        updatedAt: null,
      })
    }

    return NextResponse.json({
      currentWorkspace: data.current_workspace,
      selectedOrgId: data.selected_org_id,
      recentWorkspaces: data.recent_workspaces ?? [],
      updatedAt: data.updated_at,
    })
  } catch (error) {
    console.error("[preferences] Unexpected error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}

// =============================================================================
// PUT /api/user/preferences
// =============================================================================

export async function PUT(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const body: UserPreferencesPayload = await request.json()
    const iam = await createIamClient("service")

    // Build upsert payload
    const upsertData = {
      user_id: user.id,
      current_workspace: body.currentWorkspace ?? null,
      selected_org_id: body.selectedOrgId ?? null,
      recent_workspaces: (body.recentWorkspaces ?? []) as unknown as Json,
    }

    const { error } = await iam.from("user_preferences").upsert(upsertData, { onConflict: "user_id" })

    if (error) {
      console.error("[preferences] Failed to update:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[preferences] Unexpected error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
