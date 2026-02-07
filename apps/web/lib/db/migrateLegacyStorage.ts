"use client"

/**
 * Legacy localStorage Migration
 *
 * Migrates conversations from the old localStorage-based messageStore
 * to the new Dexie-based storage.
 *
 * Key behaviors:
 * - One-time migration (tracked via localStorage flag)
 * - All migrated conversations are PRIVATE
 * - Sets origin: "migration" on all migrated data
 * - Idempotent - safe to re-run if interrupted
 * - Preserves existing timestamps where available
 */

import { queueSync } from "./conversationSync"
import { CURRENT_MESSAGE_VERSION, type DbMessageContent, type DbMessageType, getMessageDb } from "./messageDb"
import { safeDb } from "./safeDb"

// =============================================================================
// Legacy Types (for parsing old localStorage data)
// =============================================================================

const LEGACY_STORAGE_KEY = "claude-message-storage"

interface LegacyMessage {
  id: string
  type: string
  content: unknown
  timestamp?: Date | string | number
  isStreaming?: boolean
}

interface LegacyConversation {
  id: string
  workspace?: string
  title?: string
  createdAt?: number
  lastActivity?: number
  messages?: LegacyMessage[]
}

interface LegacyState {
  state: {
    conversationId?: string | null
    conversations?: Record<string, LegacyConversation>
    // v1 format
    messages?: LegacyMessage[]
  }
  version?: number
}

// =============================================================================
// Migration Status
// =============================================================================

interface MigrationStatus {
  version: number
  completedAt: number
  conversationsMigrated: number
  messagesMigrated: number
}

const MIGRATION_KEY = "dexie-migration-status"
const CURRENT_MIGRATION_VERSION = 3

function getMigrationStatus(): MigrationStatus | null {
  if (typeof window === "undefined") return null

  const raw = localStorage.getItem(MIGRATION_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as MigrationStatus
  } catch {
    return null
  }
}

function saveMigrationStatus(conversationsMigrated: number, messagesMigrated: number): void {
  const status: MigrationStatus = {
    version: CURRENT_MIGRATION_VERSION,
    completedAt: Date.now(),
    conversationsMigrated,
    messagesMigrated,
  }
  localStorage.setItem(MIGRATION_KEY, JSON.stringify(status))
}

// =============================================================================
// Type Conversion
// =============================================================================

/**
 * Convert legacy message type to DbMessageType.
 */
function toDbMessageType(legacyType: string): DbMessageType {
  switch (legacyType) {
    case "user":
      return "user"
    case "assistant":
      return "assistant"
    case "tool_use":
      return "tool_use"
    case "tool_result":
      return "tool_result"
    case "thinking":
      return "thinking"
    case "sdk_message":
      return "sdk_message"
    default:
      return "system"
  }
}

/**
 * Convert legacy message content to DbMessageContent.
 */
function toDbMessageContent(legacyType: string, content: unknown): DbMessageContent {
  // User messages are always text
  if (legacyType === "user") {
    return { kind: "text", text: typeof content === "string" ? content : JSON.stringify(content) }
  }

  // SDK messages are passed through
  if (legacyType === "sdk_message") {
    return { kind: "sdk_message", data: content }
  }

  // Everything else stored as SDK message to preserve structure
  return { kind: "sdk_message", data: content }
}

/**
 * Parse a timestamp from various formats.
 */
function parseTimestamp(ts: Date | string | number | undefined, fallback: number): number {
  if (!ts) return fallback
  if (typeof ts === "number") return ts
  if (ts instanceof Date) return ts.getTime()
  if (typeof ts === "string") {
    const parsed = new Date(ts).getTime()
    return Number.isNaN(parsed) ? fallback : parsed
  }
  return fallback
}

// =============================================================================
// Migration Logic
// =============================================================================

/**
 * Migrate from localStorage to Dexie (one-time operation).
 *
 * @returns true if migration was performed, false if skipped
 */
export async function migrateLegacyStorage(userId: string, orgId: string): Promise<boolean> {
  if (typeof window === "undefined") return false

  // Check if already migrated
  const status = getMigrationStatus()
  if (status && status.version >= CURRENT_MIGRATION_VERSION) {
    console.log(`[migration] Already migrated (v${status.version})`)
    return false
  }

  // Check for legacy data
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) {
    console.log("[migration] No legacy data found")
    saveMigrationStatus(0, 0)
    return false
  }

  let legacy: LegacyState
  try {
    legacy = JSON.parse(raw) as LegacyState
  } catch (error) {
    console.error("[migration] Failed to parse legacy data:", error)
    saveMigrationStatus(0, 0)
    return false
  }

  // Validate structure
  if (!legacy.state) {
    console.log("[migration] Legacy data has no state")
    saveMigrationStatus(0, 0)
    return false
  }

  console.log("[migration] Starting localStorage -> Dexie migration...")

  const db = getMessageDb(userId)
  let conversationCount = 0
  let messageCount = 0

  try {
    await safeDb(() =>
      db.transaction("rw", [db.conversations, db.messages, db.tabs], async () => {
        // Handle v2 format (conversations object)
        if (legacy.state.conversations && typeof legacy.state.conversations === "object") {
          for (const [id, convo] of Object.entries(legacy.state.conversations)) {
            await migrateConversation(db, id, convo, userId, orgId)
            conversationCount++
            messageCount += convo.messages?.length ?? 0
          }
        }

        // Handle v1 format (single conversation with messages array)
        if (legacy.state.conversationId && legacy.state.messages && Array.isArray(legacy.state.messages)) {
          const v1Convo: LegacyConversation = {
            id: legacy.state.conversationId,
            messages: legacy.state.messages,
            workspace: "unknown",
          }
          await migrateConversation(db, legacy.state.conversationId, v1Convo, userId, orgId)
          conversationCount++
          messageCount += legacy.state.messages.length
        }
      }),
    )

    console.log(`[migration] Migrated ${conversationCount} conversations, ${messageCount} messages`)
    saveMigrationStatus(conversationCount, messageCount)

    return true
  } catch (error) {
    // On failure, do NOT save status - allow retry
    console.error("[migration] Failed:", error)
    return false
  }
}

/**
 * Migrate a single conversation.
 */
async function migrateConversation(
  db: ReturnType<typeof getMessageDb>,
  id: string,
  convo: LegacyConversation,
  userId: string,
  orgId: string,
): Promise<void> {
  const now = Date.now()
  const baseTime = convo.createdAt ?? now

  // Check if conversation already exists (idempotency)
  const existing = await db.conversations.get(id)
  if (existing) {
    console.log(`[migration] Conversation ${id} already exists, skipping`)
    return
  }

  // Extract title from first user message if not set
  let title = convo.title || "Migrated conversation"
  if (title === "New conversation" && convo.messages?.length) {
    const firstUserMsg = convo.messages.find(m => m.type === "user")
    if (firstUserMsg && typeof firstUserMsg.content === "string") {
      title = firstUserMsg.content.slice(0, 50).replace(/\n/g, " ").trim() || title
    }
  }

  // Create conversation
  await db.conversations.put({
    id,
    workspace: convo.workspace || "unknown",
    orgId,
    creatorId: userId,
    title,
    visibility: "private", // All migrated conversations are private
    createdAt: baseTime,
    updatedAt: convo.lastActivity ?? baseTime,
    // Metadata
    messageCount: convo.messages?.length ?? 0,
    lastMessageAt: convo.lastActivity ?? baseTime,
    autoTitleSet: true, // Don't overwrite migrated titles
    // Sync
    pendingSync: true,
  })

  // Create default tab
  const defaultTabId = crypto.randomUUID()
  await db.tabs.put({
    id: defaultTabId,
    conversationId: id,
    name: "Tab 1",
    position: 0,
    createdAt: baseTime,
    messageCount: convo.messages?.length ?? 0,
    lastMessageAt: convo.lastActivity ?? baseTime,
    pendingSync: true,
  })

  // Migrate messages with sequence numbers
  const messages = convo.messages ?? []
  let seq = 0
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    // Use message timestamp if available, otherwise derive from position
    const msgTime = parseTimestamp(msg.timestamp, baseTime + i)

    // Skip streaming messages (incomplete)
    if (msg.isStreaming) {
      console.log(`[migration] Skipping streaming message ${msg.id}`)
      continue
    }

    seq++ // Increment sequence for each non-skipped message

    await db.messages.put({
      id: msg.id,
      tabId: defaultTabId,
      type: toDbMessageType(msg.type),
      content: toDbMessageContent(msg.type, msg.content),
      createdAt: msgTime,
      updatedAt: msgTime,
      version: CURRENT_MESSAGE_VERSION,
      status: "complete",
      origin: "migration", // Mark origin for debugging
      seq, // Sequence number for reliable ordering
      pendingSync: true,
    })
  }

  // Queue for sync
  queueSync(id, userId)
}

/**
 * Check if migration is needed.
 */
export function needsMigration(): boolean {
  if (typeof window === "undefined") return false

  const status = getMigrationStatus()
  if (status && status.version >= CURRENT_MIGRATION_VERSION) {
    return false
  }

  return localStorage.getItem(LEGACY_STORAGE_KEY) !== null
}

/**
 * Clear legacy storage after successful migration.
 * Only call this after confirming Dexie data is correct.
 */
export function clearLegacyStorage(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(LEGACY_STORAGE_KEY)
  console.log("[migration] Cleared legacy storage")
}
