# Session Management

Session persistence, conversation locking, and context resumption patterns.

## Overview

Sessions enable:
- **Persistence** - Resume conversations after browser close
- **Context preservation** - Maintain conversation history
- **Tool skip** - Avoid re-executing tools on resume
- **Concurrency safety** - Prevent race conditions

## Session Store Interface

```typescript
interface SessionStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}
```

**Session Key Format:** `${userId}::${workspace}::${tabId}` (built via `tabKey()` from `features/auth/lib/sessionStore.ts`)

## Current Implementation

**Location:** `features/auth/lib/sessionStore.ts`

The session store is backed by Supabase IAM (`iam.sessions` table) with domain_id caching for performance. Sessions persist across server restarts.

```typescript
import { tabKey, sessionStore } from '@/features/auth/lib/sessionStore'

// Build key: each browser tab = one independent session
const key = tabKey({ userId, workspace, tabId })

// Get/set/delete SDK session IDs
await sessionStore.get(key)
await sessionStore.set(key, sdkSessionId)
await sessionStore.delete(key)
```

**Key parsing:** `userId::workspaceDomain::tabId` - workspace domain is resolved to `domain_id` via cached lookup.

## Session Lifecycle

### 1. New Conversation (New Tab)

```typescript
import { tabKey, sessionStore } from '@/features/auth/lib/sessionStore'

// No session exists yet for this tab
const key = tabKey({ userId, workspace, tabId })
const sessionId = await sessionStore.get(key)  // null

// Run SDK query without sessionId
const response = await sdk.query(prompt, {
  // no sessionId parameter
  ...options
})

// Store session ID from response
await sessionStore.set(key, response.sessionId)
```

### 2. Resume Conversation (Same Tab)

```typescript
// Session exists from previous message in this tab
const key = tabKey({ userId, workspace, tabId })
const sessionId = await sessionStore.get(key)  // "session_abc123"

// Resume with existing session
const response = await sdk.query(prompt, {
  sessionId,  // SDK restores context, skips tool re-execution
  ...options
})

// Update with new session ID (if changed)
await sessionStore.set(key, response.sessionId)
```

### 3. Session Cleanup

```typescript
// Delete session when tab is closed or conversation reset
await sessionStore.delete(key)
```

## SDK Session Behavior

**With sessionId:**
- ✅ Restores conversation context
- ✅ Skips tool re-execution (results cached)
- ✅ Maintains message history
- ⚡ Faster response (no redundant work)

**Without sessionId:**
- Starts fresh conversation
- Executes all tools
- No previous context

## Conversation Locking

### Problem

Concurrent requests to same conversation cause:
- Message order corruption
- Session ID conflicts
- Duplicate tool executions
- Race conditions in sessionStore

### Solution

```typescript
const activeConversations = new Set<string>()

export async function POST(req: Request) {
  const { userId, workspace, conversationId } = await parseRequest(req)
  const conversationKey = `${userId}::${workspace}::${conversationId}`

  // 1. Check if conversation in progress
  if (activeConversations.has(conversationKey)) {
    return Response.json(
      { error: 'Conversation in progress' },
      { status: 409 }
    )
  }

  // 2. Lock conversation
  activeConversations.add(conversationKey)

  try {
    // 3. Resume session
    const sessionId = await sessionStore.get(conversationKey)

    // 4. Run SDK query
    const response = await sdk.query(prompt, { sessionId, ...options })

    // 5. Update session
    await sessionStore.set(conversationKey, response.sessionId)

    return Response.json({ ok: true, result: response })

  } finally {
    // 6. Always unlock, even on error
    activeConversations.delete(conversationKey)
  }
}
```

**Guarantees:**
- ✅ Only one request per conversation at a time
- ✅ Lock released even if error occurs
- ✅ 409 Conflict returned to concurrent requests

## Client-Side Handling

### Disable Send Button

```typescript
const [isStreaming, setIsStreaming] = useState(false)

function handleSend() {
  setIsStreaming(true)
  // ... send request
}

// In JSX
<Button disabled={isStreaming}>
  Send
</Button>
```

### Handle 409 Conflict

```typescript
const response = await fetch('/api/claude/stream', {
  method: 'POST',
  body: JSON.stringify({ message, conversationId })
})

if (response.status === 409) {
  // Show message: "Please wait for current message to complete"
  return
}
```

## Session Key Patterns

### Per-Workspace Sessions

```typescript
// Different workspaces = different sessions
const key1 = tabKey({ userId: 'user123', workspace: 'example.com', tabId: 'tab1' })
const key2 = tabKey({ userId: 'user123', workspace: 'demo.com', tabId: 'tab1' })
// "user123::example.com::tab1" !== "user123::demo.com::tab1"
```

### Per-Tab Sessions

```typescript
// Same workspace, different tabs = different sessions
const key1 = tabKey({ userId: 'user123', workspace: 'example.com', tabId: 'tab1' })
const key2 = tabKey({ userId: 'user123', workspace: 'example.com', tabId: 'tab2' })
// "user123::example.com::tab1" !== "user123::example.com::tab2"
```

### Same Tab = Same Session

```typescript
// Same user, workspace, tab = shared session
const key1 = tabKey({ userId: 'user123', workspace: 'example.com', tabId: 'tab1' })
const key2 = tabKey({ userId: 'user123', workspace: 'example.com', tabId: 'tab1' })
// key1 === key2 (shares session)
```

## Production Session Store

**Status**: Implemented via Supabase IAM (`iam.sessions` table).

The session store uses Supabase with upsert on `(user_id, domain_id, tab_id)` composite key. Sessions have a 24-hour expiry. Domain hostname-to-ID lookups are cached in-memory with 5-minute TTL.

See `features/auth/lib/sessionStore.ts` for the full implementation.

## Session Debugging

### Logging

```typescript
console.log('[Session] Lookup:', {
  key: sessionKey,
  found: !!sessionId,
  sessionId: sessionId?.slice(0, 8)
})

console.log('[Session] Stored:', {
  key: sessionKey,
  sessionId: response.sessionId.slice(0, 8)
})
```

### Inspect Session Store

```typescript
// In dev tools console
fetch('/api/debug/sessions')
  .then(r => r.json())
  .then(console.log)
```

## Common Issues

**Sessions not persisting across worker restarts:**
- Session ID exists in DB but conversation data file is missing
- Cause: Workers used ephemeral temp HOME directories
- Solution: Workers now use stable HOME at `/var/lib/claude-sessions/<workspace>/`
- Automatic recovery: "No conversation found" triggers session clear and fresh start

**Conversation locked indefinitely:**
- Server crashed without releasing lock
- Solution: Add lock timeout or use Redis locks with TTL

**Session ID not updating:**
- Check `sessionStore.set()` called after SDK response
- Verify session key format matches

**Multiple users sharing session:**
- Missing userId in session key
- Solution: Ensure key includes `${userId}::`

## Testing Sessions

### Unit Tests

```typescript
describe('SessionStore', () => {
  it('stores and retrieves sessions', async () => {
    const store = new InMemorySessionStore()
    await store.set('test-key', 'session-123')
    const result = await store.get('test-key')
    expect(result).toBe('session-123')
  })

  it('returns null for missing sessions', async () => {
    const store = new InMemorySessionStore()
    const result = await store.get('nonexistent')
    expect(result).toBeNull()
  })
})
```

### Integration Tests

```typescript
describe('Session Resumption', () => {
  it('resumes conversation with sessionId', async () => {
    // First request
    const res1 = await fetch('/api/claude/stream', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello', conversationId: 'test' })
    })
    const sessionId1 = await extractSessionId(res1)

    // Second request (should resume)
    const res2 = await fetch('/api/claude/stream', {
      method: 'POST',
      body: JSON.stringify({ message: 'Continue', conversationId: 'test' })
    })

    // Verify session resumed (check logs or response)
  })
})
```

## See Also

- [Architecture: Message Handling](./message-handling.md) - SSE streaming patterns
- [Security: Authentication](../security/authentication.md) - JWT sessions
- [Testing: Integration Tests](../testing/integration-testing.md) - Test session flows
