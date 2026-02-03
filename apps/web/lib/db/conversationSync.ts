"use client"

/**
 * Conversation Sync Service
 *
 * Handles syncing between local Dexie database and remote Supabase via API.
 *
 * Key behaviors:
 * - Debounced sync (2 second delay)
 * - Batch sync (multiple conversations in one request)
 * - Conflict detection (server rejects stale writes)
 * - Lazy loading (metadata first, messages per-tab)
 * - Exponential backoff on failure
 * - Soft deletes only (never hard delete)
 * - Cross-device sync: populates localStorage tabStore from Dexie on fetch
 */

import { type DbConversation, type DbMessage, type DbTab, getMessageDb } from "./messageDb"
import { syncDexieTabsToLocalStorage } from "./tabSync"

// =============================================================================
// Configuration
// =============================================================================

const SYNC_DEBOUNCE_MS = 2000
const INITIAL_RETRY_MS = 5000
const MAX_RETRY_MS = 60000
const BATCH_SIZE = 10 // Max conversations per batch request

// =============================================================================
// Types
// =============================================================================

interface ConflictInfo {
  conversationId: string
  localUpdatedAt: number
  serverUpdatedAt: number
}

interface SyncResult {
  success: boolean
  synced: {
    conversations: number
    tabs: number
    messages: number
  }
  conflicts?: ConflictInfo[]
  errors?: string[]
}

// =============================================================================
// Sync Queue (Debounced)
// =============================================================================

let syncTimeout: ReturnType<typeof setTimeout> | null = null
const pendingSyncConversationIds = new Set<string>()

/**
 * Queue a conversation for sync (debounced).
 * Multiple calls within SYNC_DEBOUNCE_MS are batched together.
 */
export function queueSync(conversationId: string, userId: string): void {
  pendingSyncConversationIds.add(conversationId)

  if (syncTimeout) clearTimeout(syncTimeout)
  syncTimeout = setTimeout(() => {
    const ids = Array.from(pendingSyncConversationIds)
    pendingSyncConversationIds.clear()
    syncConversations(ids, userId)
  }, SYNC_DEBOUNCE_MS)
}

/**
 * Force immediate sync (bypasses debounce).
 * Use sparingly - only for critical operations like share/unshare.
 */
export function forceSyncNow(conversationId: string, userId: string): void {
  syncConversations([conversationId], userId)
}

// =============================================================================
// Online/Offline Handling
// =============================================================================

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("[sync] Online - will retry pending syncs on next operation")
    // Note: We don't auto-retry here because we don't have userId in scope.
    // The next user action will trigger a sync.
  })
}

// =============================================================================
// Core Sync Operations
// =============================================================================

/**
 * Build sync payload for a conversation
 */
async function buildConversationPayload(db: ReturnType<typeof getMessageDb>, conversation: DbConversation) {
  // Get all tabs for this conversation
  const tabs = await db.tabs.where("conversationId").equals(conversation.id).toArray()
  const tabIds = tabs.map(t => t.id)

  // Get pending messages (not streaming)
  const pendingMessages = await db.messages
    .where("tabId")
    .anyOf(tabIds)
    .and(m => m.pendingSync === true && m.status !== "streaming")
    .toArray()

  // Get pending tabs
  const pendingTabs = tabs.filter(t => t.pendingSync === true)

  return {
    conversation: {
      id: conversation.id,
      workspace: conversation.workspace,
      orgId: conversation.orgId,
      title: conversation.title,
      visibility: conversation.visibility,
      messageCount: conversation.messageCount ?? 0,
      lastMessageAt: conversation.lastMessageAt ?? null,
      firstUserMessageId: conversation.firstUserMessageId ?? null,
      autoTitleSet: conversation.autoTitleSet ?? false,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      deletedAt: conversation.deletedAt ?? null,
      archivedAt: conversation.archivedAt ?? null,
      remoteUpdatedAt: conversation.remoteUpdatedAt ?? null,
    },
    tabs: pendingTabs.map(t => ({
      id: t.id,
      conversationId: t.conversationId,
      name: t.name,
      position: t.position,
      messageCount: t.messageCount ?? 0,
      lastMessageAt: t.lastMessageAt ?? null,
      createdAt: t.createdAt,
      closedAt: t.closedAt ?? null,
    })),
    messages: pendingMessages.map(m => ({
      id: m.id,
      tabId: m.tabId,
      type: m.type,
      content: m.content,
      version: m.version,
      status: m.status,
      seq: m.seq,
      abortedAt: m.abortedAt ?? null,
      errorCode: m.errorCode ?? null,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
    pendingTabs,
    pendingMessages,
  }
}

/**
 * Handle sync conflict by fetching fresh server data
 */
async function handleConflict(db: ReturnType<typeof getMessageDb>, conflict: ConflictInfo): Promise<void> {
  console.warn(`[sync] Conflict detected for ${conflict.conversationId}`, {
    local: new Date(conflict.localUpdatedAt).toISOString(),
    server: new Date(conflict.serverUpdatedAt).toISOString(),
  })

  // Mark conversation as needing refresh from server
  await db.conversations.update(conflict.conversationId, {
    pendingSync: false,
    lastSyncError: "Conflict: server has newer data. Will refresh on next fetch.",
    // Clear remoteUpdatedAt to force full refresh
    remoteUpdatedAt: undefined,
  })
}

/**
 * Sync conversations to server via API.
 * Uses batch API when syncing multiple conversations.
 */
async function syncConversations(conversationIds: string[], userId: string): Promise<void> {
  // Skip sync if offline
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("[sync] Offline - skipping sync")
    return
  }

  const db = getMessageDb(userId)

  // Gather all payloads first
  const payloads: Array<{
    conversationId: string
    payload: Awaited<ReturnType<typeof buildConversationPayload>>
  }> = []

  for (const id of conversationIds) {
    const conversation = await db.conversations.get(id)
    if (!conversation) continue
    payloads.push({
      conversationId: id,
      payload: await buildConversationPayload(db, conversation),
    })
  }

  if (payloads.length === 0) return

  // Use batch API for multiple conversations
  if (payloads.length > 1) {
    // Split into batches
    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      const batch = payloads.slice(i, i + BATCH_SIZE)
      await syncBatch(db, batch)
    }
  } else {
    // Single conversation - use direct endpoint
    await syncSingle(db, payloads[0])
  }
}

/**
 * Sync a batch of conversations
 */
async function syncBatch(
  db: ReturnType<typeof getMessageDb>,
  batch: Array<{ conversationId: string; payload: Awaited<ReturnType<typeof buildConversationPayload>> }>,
): Promise<void> {
  try {
    const response = await fetch("/api/conversations/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversations: batch.map(b => ({
          conversation: b.payload.conversation,
          tabs: b.payload.tabs,
          messages: b.payload.messages,
        })),
      }),
      credentials: "include",
    })

    const result: SyncResult = await response.json()
    const now = Date.now()

    // Handle conflicts
    if (result.conflicts) {
      for (const conflict of result.conflicts) {
        await handleConflict(db, conflict)
      }
    }

    // Mark successful syncs
    for (const item of batch) {
      // Skip if this conversation had a conflict
      if (result.conflicts?.some(c => c.conversationId === item.conversationId)) {
        continue
      }

      // Skip if there was an error for this conversation
      if (result.errors?.some(e => e.includes(item.conversationId))) {
        const error = result.errors.find(e => e.includes(item.conversationId))
        await db.conversations.update(item.conversationId, {
          lastSyncError: error,
          lastSyncAttemptAt: now,
        })
        continue
      }

      // Mark as synced
      if (item.payload.pendingMessages.length > 0) {
        await db.messages.bulkPut(item.payload.pendingMessages.map(m => ({ ...m, syncedAt: now, pendingSync: false })))
      }
      if (item.payload.pendingTabs.length > 0) {
        await db.tabs.bulkPut(item.payload.pendingTabs.map(t => ({ ...t, syncedAt: now, pendingSync: false })))
      }
      await db.conversations.update(item.conversationId, {
        syncedAt: now,
        remoteUpdatedAt: item.payload.conversation.updatedAt,
        pendingSync: false,
        lastSyncError: undefined,
        lastSyncAttemptAt: undefined,
        nextRetryAt: undefined,
      })
    }

    console.log(`[sync] Batch synced ${result.synced.conversations} conversations`, result.synced)
  } catch (error) {
    // Mark all as failed with backoff
    const now = Date.now()
    for (const item of batch) {
      const conversation = await db.conversations.get(item.conversationId)
      const lastAttempt = conversation?.lastSyncAttemptAt ?? 0
      const timeSinceLastAttempt = now - lastAttempt
      const backoff = Math.min(
        INITIAL_RETRY_MS * 2 ** Math.floor(timeSinceLastAttempt / INITIAL_RETRY_MS),
        MAX_RETRY_MS,
      )

      await db.conversations.update(item.conversationId, {
        lastSyncError: error instanceof Error ? error.message : String(error),
        lastSyncAttemptAt: now,
        nextRetryAt: now + backoff,
      })
    }

    console.error("[sync] Batch sync failed", error)
  }
}

/**
 * Sync a single conversation
 */
async function syncSingle(
  db: ReturnType<typeof getMessageDb>,
  item: { conversationId: string; payload: Awaited<ReturnType<typeof buildConversationPayload>> },
): Promise<void> {
  try {
    const response = await fetch("/api/conversations/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: item.payload.conversation,
        tabs: item.payload.tabs,
        messages: item.payload.messages,
      }),
      credentials: "include",
    })

    if (response.status === 409) {
      // Conflict
      const { conflict } = await response.json()
      await handleConflict(db, conflict)
      return
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(error.error || `Sync failed: ${response.status}`)
    }

    const now = Date.now()

    // Mark as synced
    if (item.payload.pendingMessages.length > 0) {
      await db.messages.bulkPut(item.payload.pendingMessages.map(m => ({ ...m, syncedAt: now, pendingSync: false })))
    }
    if (item.payload.pendingTabs.length > 0) {
      await db.tabs.bulkPut(item.payload.pendingTabs.map(t => ({ ...t, syncedAt: now, pendingSync: false })))
    }
    await db.conversations.update(item.conversationId, {
      syncedAt: now,
      remoteUpdatedAt: item.payload.conversation.updatedAt,
      pendingSync: false,
      lastSyncError: undefined,
      lastSyncAttemptAt: undefined,
      nextRetryAt: undefined,
    })

    console.log(`[sync] Synced conversation ${item.conversationId}`, {
      tabs: item.payload.pendingTabs.length,
      messages: item.payload.pendingMessages.length,
    })
  } catch (error) {
    const conversation = await db.conversations.get(item.conversationId)
    const lastAttempt = conversation?.lastSyncAttemptAt ?? 0
    const timeSinceLastAttempt = Date.now() - lastAttempt
    const backoff = Math.min(INITIAL_RETRY_MS * 2 ** Math.floor(timeSinceLastAttempt / INITIAL_RETRY_MS), MAX_RETRY_MS)

    await db.conversations.update(item.conversationId, {
      lastSyncError: error instanceof Error ? error.message : String(error),
      lastSyncAttemptAt: Date.now(),
      nextRetryAt: Date.now() + backoff,
    })

    console.error("[sync] Failed to sync conversation", {
      conversationId: item.conversationId,
      error,
    })
  }
}

// =============================================================================
// Fetch Operations (Lazy Loading)
// =============================================================================

/**
 * Sync from server: Fetch all conversations for a workspace.
 * Call this when entering a workspace to get the latest data.
 *
 * Returns stats about what was synced.
 */
export async function syncFromServer(
  workspace: string,
  userId: string,
  orgId: string,
): Promise<{ conversations: number; tabs: number; isOffline: boolean }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("[sync] Offline - using local data only")
    return { conversations: 0, tabs: 0, isOffline: true }
  }

  await fetchConversations(workspace, userId, orgId)

  // Count what we have locally now
  const db = getMessageDb(userId)
  const conversations = await db.conversations.where("workspace").equals(workspace).count()
  const tabs = await db.tabs.count() // Approximate, not filtered by workspace

  return { conversations, tabs, isOffline: false }
}

/**
 * Fetch user's conversations from server.
 *
 * CRITICAL: This fetches METADATA ONLY, not messages!
 * Messages are loaded lazily per-tab via fetchTabMessages.
 */
export async function fetchConversations(workspace: string, userId: string, _orgId: string): Promise<void> {
  // Skip fetch if offline
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("[sync] Offline - using local data only")
    return
  }

  try {
    const response = await fetch(`/api/conversations?workspace=${encodeURIComponent(workspace)}`, {
      credentials: "include",
    })

    if (!response.ok) {
      console.error("[sync] Failed to fetch conversations:", response.status)
      return
    }

    const { own, shared } = await response.json()
    const db = getMessageDb(userId)

    // Merge server data with local data
    // Server is source of truth for synced conversations
    // Local changes take precedence if pendingSync is true

    // Collect tabs and conversations for cross-device sync to localStorage
    const allServerTabs: DbTab[] = []
    const allConversations: Array<{ id: string; title: string }> = []

    for (const convo of [...own, ...shared]) {
      const local = await db.conversations.get(convo.id)

      // If local has pending changes, skip server update
      if (local?.pendingSync) {
        console.log(`[sync] Skipping server update for ${convo.id} - local changes pending`)
        continue
      }

      // Track conversation for tab sync
      allConversations.push({ id: convo.id, title: convo.title })

      // Upsert conversation from server
      const dbConvo: DbConversation = {
        id: convo.id,
        workspace: convo.workspace,
        orgId: convo.orgId,
        creatorId: convo.creatorId,
        title: convo.title,
        visibility: convo.visibility,
        createdAt: convo.createdAt,
        updatedAt: convo.updatedAt,
        messageCount: convo.messageCount,
        lastMessageAt: convo.lastMessageAt,
        firstUserMessageId: convo.firstUserMessageId,
        autoTitleSet: convo.autoTitleSet,
        deletedAt: convo.deletedAt,
        archivedAt: convo.archivedAt,
        syncedAt: Date.now(),
        remoteUpdatedAt: convo.updatedAt,
        pendingSync: false,
      }

      await db.conversations.put(dbConvo)

      // Upsert tabs from server
      for (const tab of convo.tabs || []) {
        const localTab = await db.tabs.get(tab.id)
        if (localTab?.pendingSync) continue

        const dbTab: DbTab = {
          id: tab.id,
          conversationId: tab.conversationId,
          name: tab.name,
          position: tab.position,
          createdAt: tab.createdAt,
          messageCount: tab.messageCount,
          lastMessageAt: tab.lastMessageAt,
          closedAt: tab.closedAt,
          syncedAt: Date.now(),
          pendingSync: false,
        }

        await db.tabs.put(dbTab)
        allServerTabs.push(dbTab)
      }
    }

    // Cross-device sync: populate localStorage tabStore with server tabs
    // This enables clicking synced conversations in the sidebar to load correctly
    syncDexieTabsToLocalStorage(workspace, allServerTabs, allConversations)

    console.log(`[sync] Fetched conversations for ${workspace}`, {
      own: own.length,
      shared: shared.length,
    })
  } catch (error) {
    console.error("[sync] Failed to fetch conversations:", error)
  }
}

/**
 * Fetch messages for a specific tab (lazy loading).
 * Call this when user opens a conversation/tab.
 */
export async function fetchTabMessages(
  tabId: string,
  userId: string,
  cursor?: string, // ISO timestamp for pagination
): Promise<{ messages: DbMessage[]; hasMore: boolean }> {
  const db = getMessageDb(userId)

  // First return local messages
  const localMessages = await db.messages.where("[tabId+seq]").between([tabId, -Infinity], [tabId, Infinity]).toArray()

  // Skip server fetch if offline
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { messages: localMessages, hasMore: false }
  }

  try {
    const url = new URL("/api/conversations/messages", window.location.origin)
    url.searchParams.set("tabId", tabId)
    if (cursor) url.searchParams.set("cursor", cursor)

    const response = await fetch(url.toString(), { credentials: "include" })

    if (!response.ok) {
      console.error("[sync] Failed to fetch messages:", response.status)
      return { messages: localMessages, hasMore: false }
    }

    const { messages: serverMessages, hasMore, nextCursor: _nextCursor } = await response.json()

    // Merge server messages with local
    // Local pending messages take precedence
    for (const msg of serverMessages) {
      const local = await db.messages.get(msg.id)
      if (local?.pendingSync) continue

      const dbMessage: DbMessage = {
        id: msg.id,
        tabId: msg.tabId,
        type: msg.type,
        content: msg.content,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        version: msg.version,
        status: msg.status,
        origin: "remote",
        seq: msg.seq,
        abortedAt: msg.abortedAt,
        errorCode: msg.errorCode,
        syncedAt: Date.now(),
        pendingSync: false,
      }

      await db.messages.put(dbMessage)
    }

    // Get updated local messages
    const updatedMessages = await db.messages
      .where("[tabId+seq]")
      .between([tabId, -Infinity], [tabId, Infinity])
      .toArray()

    return {
      messages: updatedMessages,
      hasMore,
    }
  } catch (error) {
    console.error("[sync] Failed to fetch messages:", error)
    return { messages: localMessages, hasMore: false }
  }
}

// =============================================================================
// Conversation Operations
// =============================================================================

/**
 * Share a conversation with the organization.
 */
export async function shareConversation(conversationId: string, userId: string): Promise<void> {
  const db = getMessageDb(userId)
  await db.conversations.update(conversationId, {
    visibility: "shared",
    updatedAt: Date.now(),
    pendingSync: true,
  })

  // Immediate sync for visibility changes
  forceSyncNow(conversationId, userId)
}

/**
 * Make a conversation private again.
 */
export async function unshareConversation(conversationId: string, userId: string): Promise<void> {
  const db = getMessageDb(userId)
  await db.conversations.update(conversationId, {
    visibility: "private",
    updatedAt: Date.now(),
    pendingSync: true,
  })

  // Immediate sync for visibility changes
  forceSyncNow(conversationId, userId)
}

/**
 * Archive a conversation (hide from sidebar, restorable later).
 *
 * Sets archivedAt instead of deletedAt - conversation can be restored.
 */
export async function archiveConversation(conversationId: string, userId: string): Promise<void> {
  const db = getMessageDb(userId)
  await db.conversations.update(conversationId, {
    archivedAt: Date.now(),
    updatedAt: Date.now(),
    pendingSync: true,
  })

  // Immediate sync for archive operations
  forceSyncNow(conversationId, userId)
}

/**
 * Restore a conversation from archive.
 *
 * Clears archivedAt to show conversation in sidebar again.
 */
export async function unarchiveConversation(conversationId: string, userId: string): Promise<void> {
  const db = getMessageDb(userId)
  const conversation = await db.conversations.get(conversationId)
  if (!conversation) return

  // Dexie doesn't support setting to undefined, so we need to read-modify-write
  const { archivedAt: _, ...rest } = conversation
  await db.conversations.put({
    ...rest,
    updatedAt: Date.now(),
    pendingSync: true,
  })

  // Immediate sync for unarchive operations
  forceSyncNow(conversationId, userId)
}

/**
 * Rename a conversation.
 *
 * Also sets autoTitleSet to true to prevent auto-title from overwriting.
 */
export async function renameConversation(conversationId: string, userId: string, title: string): Promise<void> {
  const db = getMessageDb(userId)
  const trimmed = title.trim()
  const newTitle = trimmed.length > 0 ? trimmed : "Untitled"

  await db.conversations.update(conversationId, {
    title: newTitle,
    autoTitleSet: true, // Prevent auto-title from overwriting manual rename
    updatedAt: Date.now(),
    pendingSync: true,
  })

  // Queue sync (not immediate - rename is not critical)
  queueSync(conversationId, userId)
}

/**
 * Soft delete a conversation (NEVER hard delete!).
 *
 * Hard deletes cause permanent desync on multi-device setups.
 */
export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  const db = getMessageDb(userId)
  await db.conversations.update(conversationId, {
    deletedAt: Date.now(),
    updatedAt: Date.now(),
    pendingSync: true,
  })

  // Immediate sync for delete operations
  forceSyncNow(conversationId, userId)
}

// =============================================================================
// Realtime Subscriptions (TODO: Implement with Supabase Realtime)
// =============================================================================

/**
 * Subscribe to realtime updates for shared conversations.
 * Call this when entering a workspace.
 *
 * TODO: Implement with Supabase Realtime when needed.
 */
export function subscribeToSharedConversations(
  workspace: string,
  _orgId: string,
  _userId: string,
  _onMessage: (message: DbMessage) => void,
): () => void {
  console.log(`[sync] Realtime subscriptions not yet implemented for ${workspace}`)

  // Return no-op unsubscribe for now
  return () => {
    console.log(`[sync] Unsubscribe (no-op) from ${workspace}`)
  }
}
