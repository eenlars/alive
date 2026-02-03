/**
 * Dexie Database Module
 *
 * Exports for the new Dexie.js-based message storage system.
 *
 * Usage:
 * ```typescript
 * import {
 *   useDexieMessageStore,
 *   useDexieConversations,
 *   useDexieMessages,
 *   migrateLegacyStorage,
 * } from "@/lib/db"
 * ```
 */

// Sync service
export {
  deleteConversation,
  fetchConversations,
  fetchTabMessages,
  forceSyncNow,
  queueSync,
  shareConversation,
  subscribeToSharedConversations,
  unshareConversation,
} from "./conversationSync"
// Zustand store (new implementation)
export {
  type DexieSessionContext,
  useDexieConversation,
  // Re-exported hooks with Dexie prefix
  useDexieConversations,
  useDexieCurrentConversationId,
  useDexieCurrentConversationSafe,
  useDexieCurrentTabGroupId,
  useDexieCurrentTabId,
  useDexieCurrentWorkspace,
  useDexieIsLoading,
  useDexieIsSyncing,
  useDexieMessageActions,
  useDexieMessageStore,
  useDexieMessages,
  useDexieSession,
  useDexieSharedConversations,
  useDexieTabs,
} from "./dexieMessageStore"

// Type adapters
export {
  extractTitle,
  isEmptyContent,
  toDbMessage,
  toDbMessageContent,
  toDbMessageType,
  toUIMessage,
  toUIMessages,
} from "./messageAdapters"
// Core database
export {
  type ConversationVisibility,
  CURRENT_MESSAGE_VERSION,
  type DbConversation,
  type DbMessage,
  type DbMessageContent,
  type DbMessageOrigin,
  type DbMessageStatus,
  type DbMessageType,
  type DbTab,
  getMessageDb,
  getMessageDbName,
  resetMessageDb,
} from "./messageDb"
// Migration
export { clearLegacyStorage, migrateLegacyStorage, needsMigration } from "./migrateLegacyStorage"
// Safe operations wrapper
export { type DbError, safeDb, safeDbWithHandler } from "./safeDb"
// React hooks
export {
  type SessionContext,
  useConversation,
  useConversationMessageCount,
  useConversations,
  useCurrentConversationSafe,
  useHasPendingSyncs,
  useMessages,
  usePendingMessages,
  useSharedConversations,
  useTab,
  useTabs,
} from "./useMessageDb"
// Tab messages hook (merges Dexie + streaming buffers)
export {
  type TabMessage,
  useActiveStreamId,
  useIsTabStreaming,
  useStreamingText,
  useTabMessages,
} from "./useTabMessages"
