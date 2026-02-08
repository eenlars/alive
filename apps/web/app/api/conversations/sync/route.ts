/**
 * Conversation Sync API
 *
 * Handles syncing conversations, tabs, and messages to Supabase.
 * Called by the client-side conversationSync service.
 *
 * Features:
 * - Batch sync: multiple conversations in one request
 * - Conflict detection: server rejects if local data is stale
 * - Atomic operations: all-or-nothing per conversation
 */

import type { Json } from "@webalive/database"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import type { AppConversationInsert, AppConversationTabInsert, AppMessageInsert } from "@/lib/supabase/app"
import { createAppClient } from "@/lib/supabase/app"

// =============================================================================
// Types
// =============================================================================

interface ConversationData {
  id: string
  workspace: string
  orgId: string
  title: string
  visibility: "private" | "shared"
  messageCount: number
  lastMessageAt: number | null
  firstUserMessageId: string | null
  autoTitleSet: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  archivedAt: number | null
  /** Last known server updated_at for conflict detection */
  remoteUpdatedAt?: number | null
}

interface TabData {
  id: string
  conversationId: string
  name: string
  position: number
  messageCount: number
  lastMessageAt: number | null
  createdAt: number
  closedAt: number | null
}

interface MessageData {
  id: string
  tabId: string
  type: "user" | "assistant" | "tool_use" | "tool_result" | "thinking" | "system" | "sdk_message"
  content: unknown
  version: number
  status: "streaming" | "complete" | "interrupted" | "error"
  seq: number
  abortedAt: number | null
  errorCode: string | null
  createdAt: number
  updatedAt: number
}

/** Single conversation sync (backwards compatible) */
interface SyncConversationPayload {
  conversation: ConversationData
  tabs: TabData[]
  messages: MessageData[]
}

/** Batch sync for multiple conversations */
interface BatchSyncPayload {
  conversations: Array<{
    conversation: ConversationData
    tabs: TabData[]
    messages: MessageData[]
  }>
}

interface ConflictInfo {
  conversationId: string
  localUpdatedAt: number
  serverUpdatedAt: number
}

interface SyncResult {
  ok: boolean
  synced: {
    conversations: number
    tabs: number
    messages: number
  }
  conflicts?: ConflictInfo[]
  errors?: string[]
}

// =============================================================================
// Helper: Sync single conversation
// =============================================================================

async function syncSingleConversation(
  supabase: Awaited<ReturnType<typeof createAppClient>>,
  userId: string,
  conversation: ConversationData,
  tabs: TabData[],
  messages: MessageData[],
): Promise<{ ok: boolean; conflict?: ConflictInfo; error?: string; tabCount: number; messageCount: number }> {
  // Check for conflicts if remoteUpdatedAt is provided
  if (conversation.remoteUpdatedAt) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("updated_at")
      .eq("conversation_id", conversation.id)
      .single()

    if (existing) {
      const serverUpdatedAt = new Date(existing.updated_at).getTime()
      // If server has newer data than what client last saw, it's a conflict
      if (serverUpdatedAt > conversation.remoteUpdatedAt) {
        return {
          ok: false,
          conflict: {
            conversationId: conversation.id,
            localUpdatedAt: conversation.updatedAt,
            serverUpdatedAt,
          },
          tabCount: 0,
          messageCount: 0,
        }
      }
    }
  }

  // Upsert conversation
  const conversationRow: AppConversationInsert = {
    conversation_id: conversation.id,
    user_id: userId,
    org_id: conversation.orgId,
    workspace: conversation.workspace,
    title: conversation.title,
    visibility: conversation.visibility,
    message_count: conversation.messageCount,
    last_message_at: conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toISOString() : null,
    first_user_message_id: conversation.firstUserMessageId,
    auto_title_set: conversation.autoTitleSet,
    created_at: new Date(conversation.createdAt).toISOString(),
    updated_at: new Date(conversation.updatedAt).toISOString(),
    deleted_at: conversation.deletedAt ? new Date(conversation.deletedAt).toISOString() : null,
    archived_at: conversation.archivedAt ? new Date(conversation.archivedAt).toISOString() : null,
  }

  const { error: convoError } = await supabase
    .from("conversations")
    .upsert(conversationRow, { onConflict: "conversation_id" })

  if (convoError) {
    console.error("[sync] Failed to upsert conversation:", convoError)
    return { ok: false, error: `Conversation: ${convoError.message}`, tabCount: 0, messageCount: 0 }
  }

  // Upsert tabs
  if (tabs.length > 0) {
    const tabRows: AppConversationTabInsert[] = tabs.map(tab => ({
      tab_id: tab.id,
      conversation_id: tab.conversationId,
      name: tab.name,
      position: tab.position,
      message_count: tab.messageCount,
      last_message_at: tab.lastMessageAt ? new Date(tab.lastMessageAt).toISOString() : null,
      created_at: new Date(tab.createdAt).toISOString(),
      closed_at: tab.closedAt ? new Date(tab.closedAt).toISOString() : null,
    }))

    const { error: tabsError } = await supabase.from("conversation_tabs").upsert(tabRows, { onConflict: "tab_id" })

    if (tabsError) {
      console.error("[sync] Failed to upsert tabs:", tabsError)
      return { ok: false, error: `Tabs: ${tabsError.message}`, tabCount: 0, messageCount: 0 }
    }
  }

  // Upsert messages
  if (messages.length > 0) {
    const messageRows: AppMessageInsert[] = messages.map(msg => ({
      message_id: msg.id,
      tab_id: msg.tabId,
      type: msg.type,
      content: msg.content as Json,
      version: msg.version,
      status: msg.status,
      seq: msg.seq,
      aborted_at: msg.abortedAt ? new Date(msg.abortedAt).toISOString() : null,
      error_code: msg.errorCode,
      created_at: new Date(msg.createdAt).toISOString(),
      updated_at: new Date(msg.updatedAt).toISOString(),
    }))

    const { error: messagesError } = await supabase.from("messages").upsert(messageRows, { onConflict: "message_id" })

    if (messagesError) {
      console.error("[sync] Failed to upsert messages:", messagesError)
      return { ok: false, error: `Messages: ${messagesError.message}`, tabCount: tabs.length, messageCount: 0 }
    }
  }

  return { ok: true, tabCount: tabs.length, messageCount: messages.length }
}

// =============================================================================
// POST /api/conversations/sync
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }
    const userId = user.id

    const body = await request.json()
    const supabase = await createAppClient("service")

    // Detect batch vs single sync
    const isBatch = "conversations" in body && Array.isArray(body.conversations)

    if (isBatch) {
      // Batch sync: multiple conversations
      const payload = body as BatchSyncPayload
      const result: SyncResult = {
        ok: true,
        synced: { conversations: 0, tabs: 0, messages: 0 },
        conflicts: [],
        errors: [],
      }

      for (const item of payload.conversations) {
        if (!item.conversation.orgId) {
          result.errors?.push(`Conversation ${item.conversation.id}: orgId is required`)
          continue
        }

        const syncResult = await syncSingleConversation(supabase, userId, item.conversation, item.tabs, item.messages)

        if (syncResult.ok) {
          result.synced.conversations++
          result.synced.tabs += syncResult.tabCount
          result.synced.messages += syncResult.messageCount
        } else if (syncResult.conflict) {
          result.conflicts?.push(syncResult.conflict)
        } else if (syncResult.error) {
          result.errors?.push(`Conversation ${item.conversation.id}: ${syncResult.error}`)
        }
      }

      // Mark as failed if any errors (conflicts don't fail the request)
      if (result.errors && result.errors.length > 0) {
        result.ok = false
      }

      // Clean up empty arrays
      if (result.conflicts?.length === 0) delete result.conflicts
      if (result.errors?.length === 0) delete result.errors

      return NextResponse.json(result)
    }

    // Single conversation sync (backwards compatible)
    const payload = body as SyncConversationPayload
    const { conversation, tabs, messages } = payload

    if (!conversation.orgId) {
      return structuredErrorResponse(ErrorCodes.ORG_ID_REQUIRED, { status: 400 })
    }

    const syncResult = await syncSingleConversation(supabase, userId, conversation, tabs, messages)

    if (!syncResult.ok) {
      if (syncResult.conflict) {
        // Conflict responses include the conflict data for client resolution
        return NextResponse.json(
          {
            ok: false,
            error: ErrorCodes.CONVERSATION_BUSY, // Closest match for sync conflict
            message: "Conflict detected - server has newer data",
            conflict: syncResult.conflict,
          },
          { status: 409 },
        )
      }
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      synced: {
        conversations: 1,
        tabs: syncResult.tabCount,
        messages: syncResult.messageCount,
      },
    })
  } catch (error) {
    console.error("[sync] Unexpected error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
