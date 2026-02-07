/**
 * Conversations API
 *
 * GET: Fetch user's conversations for a workspace
 */

import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { getOrgIdForUser } from "@/lib/deployment/org-resolver"
import { ErrorCodes } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"

// =============================================================================
// GET /api/conversations?workspace=xxx
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }
    const userId = user.id

    const { searchParams } = new URL(request.url)
    const workspace = searchParams.get("workspace")

    if (!workspace) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, { status: 400, details: { field: "workspace" } })
    }

    // Get user's org
    const orgId = await getOrgIdForUser(userId)
    if (!orgId) {
      return structuredErrorResponse(ErrorCodes.ORG_NOT_FOUND, { status: 404 })
    }

    const supabase = await createAppClient("service")

    // Fetch user's own conversations
    const { data: ownConversations, error: ownError } = await supabase
      .from("conversations")
      .select(`
        conversation_id,
        workspace,
        org_id,
        title,
        visibility,
        message_count,
        last_message_at,
        first_user_message_id,
        auto_title_set,
        created_at,
        updated_at,
        deleted_at,
        archived_at,
        conversation_tabs (
          tab_id,
          conversation_id,
          name,
          position,
          message_count,
          last_message_at,
          created_at,
          closed_at
        )
      `)
      .eq("workspace", workspace)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })

    if (ownError) {
      console.error("[conversations] Failed to fetch own conversations:", ownError)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    // Fetch shared conversations from org
    const { data: sharedConversations, error: sharedError } = await supabase
      .from("conversations")
      .select(`
        conversation_id,
        workspace,
        org_id,
        user_id,
        title,
        visibility,
        message_count,
        last_message_at,
        first_user_message_id,
        auto_title_set,
        created_at,
        updated_at,
        deleted_at,
        archived_at,
        conversation_tabs (
          tab_id,
          conversation_id,
          name,
          position,
          message_count,
          last_message_at,
          created_at,
          closed_at
        )
      `)
      .eq("workspace", workspace)
      .eq("org_id", orgId)
      .eq("visibility", "shared")
      .neq("user_id", userId) // Exclude own conversations (already fetched)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })

    if (sharedError) {
      console.error("[conversations] Failed to fetch shared conversations:", sharedError)
      // Don't fail - return own conversations at least
    }

    // Transform to client format
    const transform = (c: (typeof ownConversations)[0], isOwn: boolean) => ({
      id: c.conversation_id,
      workspace: c.workspace,
      orgId: c.org_id,
      creatorId: isOwn ? userId : (c as { user_id?: string }).user_id,
      title: c.title,
      visibility: c.visibility,
      messageCount: c.message_count,
      lastMessageAt: c.last_message_at ? new Date(c.last_message_at).getTime() : null,
      firstUserMessageId: c.first_user_message_id,
      autoTitleSet: c.auto_title_set,
      createdAt: new Date(c.created_at).getTime(),
      updatedAt: new Date(c.updated_at).getTime(),
      deletedAt: c.deleted_at ? new Date(c.deleted_at).getTime() : null,
      archivedAt: c.archived_at ? new Date(c.archived_at).getTime() : null,
      tabs: (c.conversation_tabs || []).map(
        (t: {
          tab_id: string
          conversation_id: string
          name: string
          position: number
          message_count: number
          last_message_at: string | null
          created_at: string
          closed_at: string | null
        }) => ({
          id: t.tab_id,
          conversationId: t.conversation_id,
          name: t.name,
          position: t.position,
          messageCount: t.message_count,
          lastMessageAt: t.last_message_at ? new Date(t.last_message_at).getTime() : null,
          createdAt: new Date(t.created_at).getTime(),
          closedAt: t.closed_at ? new Date(t.closed_at).getTime() : null,
        }),
      ),
    })

    return NextResponse.json({
      own: (ownConversations || []).map(c => transform(c, true)),
      shared: (sharedConversations || []).map(c => transform(c, false)),
    })
  } catch (error) {
    console.error("[conversations] Unexpected error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
