/**
 * Conversations API
 *
 * GET: Fetch user's conversations for a workspace
 */

import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { createRLSAppClient } from "@/lib/supabase/server-rls"

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

    const supabase = await createRLSAppClient()

    // Fetch all visible conversations in this workspace.
    // RLS guarantees only user-owned and shared-in-org records are returned.
    const { data: conversations, error } = await supabase
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
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("[conversations] Failed to fetch conversations:", error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    // Transform to client format
    const transform = (c: NonNullable<typeof conversations>[number], isOwn: boolean) => ({
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

    const own = (conversations || []).filter(c => c.user_id === userId)
    const shared = (conversations || []).filter(c => c.user_id !== userId)

    return NextResponse.json({ own: own.map(c => transform(c, true)), shared: shared.map(c => transform(c, false)) })
  } catch (error) {
    console.error("[conversations] Unexpected error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
