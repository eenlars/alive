# Session Persistence Implementation

**Status**: ✅ Implemented
**Date**: 2025-11-07
**Feature**: Workspace-scoped conversation session persistence with automatic resumption

## Overview

Implemented Zustand-based session management that enables conversation resumption across page reloads. Each workspace maintains its own conversation history, allowing users to close the browser and resume exactly where they left off.

## Architecture

### Components

1. **Session Store** (`lib/stores/sessionStore.ts`)
   - Persists conversationId per workspace to localStorage
   - Maintains session history (up to 10 recent conversations)
   - Tracks last activity timestamps
   - Provides atomic selectors and stable actions

2. **Conversation Session Hook** (`features/chat/hooks/useConversationSession.ts`)
   - Encapsulates session logic away from chat UI
   - Auto-initializes/resumes conversations on workspace change
   - Provides activity tracking
   - Handles new conversation creation

3. **New Chat Button** (`features/chat/components/NewChatButton.tsx`)
   - UI component for starting fresh conversations
   - Reusable across different contexts

### Integration Points

**Chat Page** (`app/chat/page.tsx`):
- Minimal changes to keep code clean
- Replaced `useState(() => crypto.randomUUID())` with `useConversationSession()`
- Added automatic activity tracking on message updates
- Updated new conversation handler

## How It Works

### Session Flow

```
1. User visits chat page → workspace detected
2. Hook calls initConversation(workspace)
3. Store checks for existing session:
   - Found: Returns existing conversationId
   - Not found: Creates new UUID and persists
4. conversationId sent to API
5. Backend checks sessionStore:
   - Found: Resumes with existing session
   - Not found: Starts new conversation
```

### Data Persistence

**Frontend (Zustand):**
```typescript
localStorage['claude-session-storage'] = {
  sessions: [
    {
      conversationId: "uuid-1",
      workspace: "demo.alive.best",
      lastActivity: 1699564800000
    },
    // ... up to 10 sessions
  ],
  currentConversationId: "uuid-1",
  currentWorkspace: "demo.alive.best"
}
```

**Backend (Supabase IAM):**
```typescript
import { tabKey, sessionStore } from '@/features/auth/lib/sessionStore'
const key = tabKey({ userId, workspace, tabId })
sessionStore.get(key)
// Returns: Claude SDK session_id (persisted in iam.sessions table)
```

## API

### Session Store

```typescript
// Atomic selectors
useConversationId()       // Current conversationId
useCurrentWorkspace()     // Current workspace
useSessions()             // All session history

// Actions
const {
  initConversation,       // Resume or create
  newConversation,        // Force new
  updateActivity,         // Touch timestamp
  clearWorkspaceConversation,
  clearAll
} = useSessionActions()
```

### Conversation Session Hook

```typescript
const {
  conversationId,         // Current ID (persisted)
  isInitialized,          // Ready to use
  startNewConversation,   // Create new session
  markActivity            // Update timestamp
} = useConversationSession(workspace, mounted)
```

## Benefits

✅ **Seamless Resumption**: Close browser, reopen → conversation continues
✅ **Workspace Isolation**: Each domain gets independent sessions
✅ **History Tracking**: Last 10 conversations preserved
✅ **Clean Code**: Logic extracted to reusable hooks
✅ **Type Safety**: Full TypeScript support
✅ **SSR Compatible**: Handles hydration correctly

## Limitations

⚠️ **No Cross-Tab Sync**: Each browser tab has its own independent session (by design -- tab = conversation)
⚠️ **Local Only**: Frontend session tracking stored in browser localStorage/Dexie

## Storage Architecture

### Two-Tier Persistence

| Component | Storage Location | Survives Restart? |
|-----------|------------------|-------------------|
| Session ID mapping | Supabase `iam.sessions` table | ✅ Yes |
| Conversation data | `/var/lib/claude-sessions/<workspace>/.claude/projects/*.jsonl` | ✅ Yes |
| Frontend tab state | Browser localStorage/Dexie | ✅ Yes |

### Session Recovery

If a worker restarts and the session file is missing:
1. Database still has the session ID
2. Claude SDK returns "No conversation found"
3. Stream route automatically clears stale session
4. Retries as fresh conversation (graceful degradation)

## Current State

### Backend Storage -- Implemented
Backend session store is Supabase IAM backed (`iam.sessions` table). Sessions persist across server restarts with 24-hour expiry. Domain hostname-to-ID lookups are cached in-memory with 5-minute TTL.

### Tab-Based Sessions
Each browser tab gets its own independent chat session via `tabId`. This is the intended design -- tabs are conversations, not shared state.

### Session Metadata

Add to store:
- Message count
- Start time
- Last message preview
- Token usage

## Testing

**Manual Test Flow:**
1. Visit chat page (e.g., `demo.alive.best/chat`)
2. Send a message → note conversationId in DevTools
3. Close browser completely
4. Reopen chat page
5. ✅ conversationId matches → session resumed
6. Send another message → conversation continues

**Verification:**
```javascript
// In browser DevTools
localStorage.getItem('claude-session-storage')
```

## Migration Notes

**Breaking Changes**: None
**Backwards Compatibility**: ✅ Full
- Old code still works (legacy exports)
- No database migrations required
- No API changes

## Related Files

**New Files:**
- `lib/stores/sessionStore.ts` - Zustand store
- `features/chat/hooks/useConversationSession.ts` - Custom hook
- `features/chat/components/NewChatButton.tsx` - UI component
- `docs/features/session-persistence.md` - This file

**Modified Files:**
- `app/chat/page.tsx` - Integration (~5 lines changed)

## References

- [Zustand Patterns Guide](../guides/zustand-nextjs-ssr-patterns.md)
- [Session Management](../sessions/session-management.md)
- [Backend SessionStore](../../apps/web/features/auth/lib/sessionStore.ts)
