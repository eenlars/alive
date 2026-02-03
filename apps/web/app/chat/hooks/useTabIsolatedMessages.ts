"use client"

import { useActiveSession } from "@/features/chat/hooks/useActiveSession"
import { useDexieSession } from "@/lib/db/dexieMessageStore"
import { useTabMessages } from "@/lib/db/useTabMessages"

interface UseTabIsolatedMessagesOptions {
  workspace: string | null
}

/**
 * Hook for tab-isolated message display and session management
 *
 * Uses useActiveSession as the SINGLE SOURCE OF TRUTH for:
 * - Which tab's messages to display (via tabId, the Claude SDK session key)
 * - Whether the session is streaming (busy)
 * - Session actions (addTabToGroup, startNewTabGroup, switchTab)
 *
 * INVARIANT: Messages returned MUST belong to session.tabId.
 * Any violation indicates a cross-tab contamination bug.
 */
export function useTabIsolatedMessages({ workspace }: UseTabIsolatedMessagesOptions) {
  // Single source of truth for active session
  const session = useActiveSession(workspace)
  const dexieSession = useDexieSession()

  // Messages are fetched for the active session's tabId
  // If no active session, no messages are shown
  const messages = useTabMessages(session.tabId, dexieSession?.userId ?? null)

  return {
    messages,
    busy: session.isStreaming,
    tabId: session.tabId,
    tabGroupId: session.tabGroupId,
    isReady: session.isReady,
    activeTab: session.activeTab,
    workspaceTabs: session.workspaceTabs,
    actions: session.actions,
  }
}
