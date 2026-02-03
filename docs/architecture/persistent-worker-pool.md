# Persistent Worker Architecture for Claude SDK

## Problem Statement

Current architecture spawns a new Node.js child process for every message:
- ~50-100ms process spawn overhead
- ~200-500ms MCP server reconnection overhead per message
- Lock released only after process fully exits → causes delay for next message
- Total overhead: 300-600ms per message

## Solution: Persistent Workers

Keep worker processes alive per workspace, reuse for multiple messages, terminate after 15 minutes of inactivity.

## Architecture

```
                              +------------------------------------------+
                              |         WORKER POOL MANAGER               |
                              |    (runs in main Next.js process)        |
                              |                                          |
                              |  workers: Map<workspaceKey, Worker>      |
                              |  lastActivity: Map<workspaceKey, Date>   |
                              +------------------+------------------------+
                                                 |
          +--------------------------------------+--------------------------------------+
          |                                      |                                      |
          v                                      v                                      v
+-------------------+                 +-------------------+                 +-------------------+
| Worker: site-a    |                 | Worker: site-b    |                 | Worker: site-c    |
| UID: 1001         |                 | UID: 1002         |                 | UID: 1003         |
|                   |                 |                   |                 |                   |
| - MCP connections |                 | - MCP connections |                 | - MCP connections |
| - Claude SDK      |                 | - Claude SDK      |                 | - Claude SDK      |
|                   |                 |                   |                 |                   |
| IPC: Unix socket  |                 | IPC: Unix socket  |                 | IPC: Unix socket  |
+-------------------+                 +-------------------+                 +-------------------+
```

## Message Flow

```
POST /api/claude/stream
     |
     +-> workerPool.getOrCreateWorker(workspace)
     |        |
     |        +-> (if exists) return existing worker
     |        +-> (if not) spawn new, wait for "ready"
     |
     +-> workerPool.sendQuery(workspaceKey, payload)
     |        |
     |        +-> IPC: { type: "query", requestId, payload }
     |        +-> Worker executes Claude SDK query()
     |        +-> IPC: { type: "message", ... } (streamed)
     |        +-> IPC: { type: "complete", ... }
     |
     +-> unlockConversation()  // INSTANT - no wait for process exit!
     |
     +-> Worker stays alive for next message
```

## IPC Protocol (Unix Domain Sockets + NDJSON)

**Parent → Worker:**
```typescript
| { type: "query"; requestId: string; payload: AgentRequest }
| { type: "cancel"; requestId: string }
| { type: "shutdown"; graceful: boolean }
| { type: "health_check" }
```

**Worker → Parent:**
```typescript
| { type: "ready" }
| { type: "session"; requestId: string; sessionId: string }
| { type: "message"; requestId: string; content: unknown }
| { type: "complete"; requestId: string; result: unknown }
| { type: "error"; requestId: string; error: string }
| { type: "shutdown_ack" }
```

## Package Structure

New package: `packages/worker-pool/`

```
packages/worker-pool/
├── package.json              # @webalive/worker-pool
├── tsconfig.json
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # TypeScript interfaces
│   ├── manager.ts            # WorkerPoolManager class
│   ├── ipc.ts                # Unix socket IPC utilities
│   ├── config.ts             # Configuration constants
│   └── worker-entry.mjs      # Persistent worker entry point
└── __tests__/
    ├── manager.test.ts
    └── ipc.test.ts
```

**Why a separate package?**
- Isolated concern (worker lifecycle management)
- Independent testing
- Clear API boundary
- Follows existing pattern (`@webalive/site-controller`, `@alive-brug/tools`)
- Next.js just imports and uses: `import { WorkerPoolManager } from '@webalive/worker-pool'`

## Files to Modify in apps/web

| File | Changes |
|------|---------|
| `app/api/claude/stream/route.ts` | Import and use `@webalive/worker-pool` |
| `lib/stream/cancellation-registry.ts` | Target workers instead of processes |

## Files to Deprecate (after migration)

| File | Replacement |
|------|-------------|
| `lib/workspace-execution/agent-child-runner.ts` | `@webalive/worker-pool` |
| `scripts/run-agent.mjs` | `@webalive/worker-pool/worker-entry.mjs` |

## Worker Lifecycle

### Eviction Policy
```typescript
const CONFIG = {
  maxWorkers: 20,                       // Hard limit (~2GB memory overhead)
  inactivityTimeoutMs: 15 * 60 * 1000,  // 15 minutes (better warm hit rate)
  maxAgeMs: 60 * 60 * 1000,             // 1 hour max lifetime
  evictionStrategy: "lru",              // Least recently used
}
```

### Graceful Shutdown
1. Inactivity timer fires (15 min no activity)
2. Send `{ type: "shutdown", graceful: true }`
3. Worker finishes active query (if any)
4. Worker closes MCP connections
5. Worker sends `{ type: "shutdown_ack" }` and exits

### Crash Recovery
1. Worker crashes unexpectedly
2. Main detects via process 'exit' event
3. Active requests get error message
4. Next request spawns new worker
5. Sessions resume normally (see Session Persistence below)

## Session Persistence

### Two-Tier Storage

| What | Where | Survives Restart? |
|------|-------|-------------------|
| Session ID mapping | Supabase `iam.sessions` table | ✅ Yes |
| Conversation data (`.jsonl`) | `/var/lib/claude-sessions/<workspace>/.claude/projects/` | ✅ Yes |

### How It Works

Each worker uses a **stable HOME directory** per workspace instead of ephemeral temp directories:

```
/var/lib/claude-sessions/
├── example-com/
│   └── .claude/
│       ├── .credentials.json
│       └── projects/
│           └── <hash>/
│               └── session_abc123.jsonl  ← Conversation history
├── demo-goalive-nl/
│   └── .claude/
│       └── projects/
│           └── ...
```

**Implementation**: `packages/worker-pool/src/worker-entry.mjs`

```javascript
const SESSIONS_BASE_DIR = "/var/lib/claude-sessions"

function ensureStableSessionHome(workspaceKey, uid, gid) {
  const sanitizedKey = sanitizeWorkspaceKey(workspaceKey)
  const stableHome = join(SESSIONS_BASE_DIR, sanitizedKey)
  // Create with proper ownership, fallback to temp if fails
  ...
}
```

### Session Recovery Fallback

If a session file is missing despite having a session ID in the database (e.g., manual deletion), the stream route automatically recovers:

1. Worker returns "No conversation found with session ID"
2. Route detects this error pattern
3. Clears stale session ID from database
4. Retries query without resume → starts fresh conversation

**Implementation**: `apps/web/app/api/claude/stream/route.ts`

```typescript
if (isSessionNotFound && existingSessionId && sessionKey) {
  await sessionStore.delete(sessionKey)  // Clear stale
  await runQuery(undefined)              // Retry fresh
}
```

### Systemd Integration

The base directory is created on service start:

```ini
# In ops/systemd/claude-bridge-*.service
ExecStartPre=/usr/bin/mkdir -p /var/lib/claude-sessions
ExecStartPre=/usr/bin/chmod 755 /var/lib/claude-sessions
```

## Security (Unchanged)

- Each worker drops privileges to workspace uid/gid (same as current)
- OAuth tokens passed fresh per-query (not cached in worker)
- Unix sockets with restricted permissions

## Migration Strategy

### Phase 1: Feature Flag
```typescript
// In @webalive/shared/src/constants.ts
export const WORKER_POOL = {
  ENABLED: false,  // Set to true to enable
  // ... other config
}

// In route.ts
import { WORKER_POOL } from "@webalive/shared"
if (WORKER_POOL.ENABLED) {
  // Use worker pool
} else {
  // Use spawn-per-request (current)
}
```

### Phase 2: Testing
- Set `ENABLED: true` in constants
- Deploy to staging
- Monitor error rates and latency

### Phase 3: Production Rollout
- Deploy with `ENABLED: true`
- Monitor closely for first hour

### Rollback
- Set `ENABLED: false` in constants
- Deploy
- Instant fallback to spawn-per-request

## Expected Performance

| Metric | Before | After |
|--------|--------|-------|
| Time to first byte (warm) | 300-600ms | 50-100ms |
| Time to first byte (cold) | 300-600ms | 300-600ms |
| Worker hit rate | N/A | ~90% |

## Implementation Order

1. **Phase 1: Package Setup**
   - [ ] Create `packages/worker-pool/` directory structure
   - [ ] Create `package.json` with `@webalive/worker-pool` name
   - [ ] Create `tsconfig.json` extending root config
   - [ ] Add to turbo.json build pipeline

2. **Phase 2: Core Package Implementation**
   - [ ] Create `src/types.ts` (interfaces)
   - [ ] Create `src/config.ts` (constants)
   - [ ] Create `src/ipc.ts` (Unix socket utilities)
   - [ ] Create `src/manager.ts` (WorkerPoolManager class)
   - [ ] Create `src/index.ts` (public exports)

3. **Phase 3: Worker Entry Point**
   - [ ] Create `src/worker-entry.mjs` (based on run-agent.mjs)
   - [ ] Implement persistent event loop
   - [ ] Implement query handling
   - [ ] Implement graceful shutdown

4. **Phase 4: Integration with apps/web**
   - [ ] Add `@webalive/worker-pool` to apps/web dependencies
   - [ ] Add feature flag `USE_PERSISTENT_WORKERS`
   - [ ] Modify `route.ts` to use worker pool
   - [ ] Update cancellation registry

5. **Phase 5: Testing**
   - [ ] Unit tests for package (`packages/worker-pool/__tests__/`)
   - [ ] Integration tests in apps/web
   - [ ] Manual testing with feature flag

6. **Phase 6: Rollout & Cleanup**
   - [ ] Staged rollout (10% → 100%)
   - [ ] Remove feature flag
   - [ ] Delete deprecated files
   - [ ] Update documentation

## Current Limitations

1. **MCP Connection Caching: NOT IMPLEMENTED**
   - The design doc promises MCP connections are cached per-worker
   - Currently, MCP servers are recreated fresh on every query
   - This means the main performance benefit (avoiding reconnection) is NOT yet realized
   - To implement: Cache MCP connections in worker state, only reconnect on failure

2. **No Request Queuing**
   - If a worker is busy, the manager throws immediately
   - This is by design: conversation locking at the API layer prevents concurrent requests to same workspace
   - If you see "Worker busy" errors, it indicates a bug in conversation locking

3. **Agent Config Must Be Passed**
   - Worker does NOT import from `apps/web`
   - Most agent configuration (tools, etc.) must be passed via `agentConfig` in the payload
   - The parent (route.ts) is responsible for building this config

4. **Internal MCP Servers Created Locally in Worker**
   - `createSdkMcpServer()` returns function objects that CANNOT be JSON serialized
   - Internal MCP servers (alive-workspace, alive-tools) are imported directly in worker-entry.mjs
   - Only OAuth HTTP servers (Stripe, Linear, etc.) are passed via `oauthMcpServers` in agentConfig
   - This is a fundamental IPC limitation, not a bug

## Implementation Details

### Crash Recovery: pendingQueries Pattern

Each worker tracks active queries in a `Map<requestId, PendingQuery>`:

```typescript
interface PendingQuery {
  requestId: string
  resolve: (result: QueryResult) => void
  reject: (error: Error) => void
  onMessage: (msg: WorkerToParentMessage) => void
  cleanup: () => void
  sessionId?: string
  result?: unknown
}
```

On worker crash/disconnect/exit, `rejectPendingQueries()` is called to reject all pending promises, preventing hanging requests.

### Socket Security

Unix sockets are created in a directory with `chmod 0o700` permissions:
- Only the owner (root) can access the socket directory
- Prevents other users from connecting to worker sockets
- Each workspace still runs with dropped privileges (uid/gid)

### Timer Cleanup

The eviction timer uses `.unref()` to prevent blocking process exit:
```typescript
this.evictionTimer = setInterval(() => { ... }, 60_000)
this.evictionTimer.unref()
```

## Design Decisions

1. **Concurrent queries per worker?**
   - Decision: No, one at a time (simpler, matches current behavior)
   - Worker rejects with error if query arrives while busy

2. **MCP connection caching scope?**
   - Design: Per-worker (shared across queries to same workspace)
   - Status: NOT YET IMPLEMENTED - see limitations above

3. **Session caching in worker?**
   - Decision: No, use Supabase session_id for resumption (already works)

## Critical Constraints

### ⚠️ IMPORT ORDER: All Imports MUST Be At Top Level

**This caused a production outage. Read carefully.**

**The Bug:**
```javascript
// ❌ WRONG - This was inside handleQuery() function
async function handleQuery(ipc, requestId, payload) {
  const { query } = await import("@anthropic-ai/claude-agent-sdk")  // FAILS!
  // Error: EACCES: permission denied, open '.../node_modules/zod/index.js'
}
```

**Why It Fails:**
1. Worker starts as root to read node_modules and connect to Unix socket
2. Worker drops privileges to workspace user (e.g., UID 986) via `setuid()`
3. After privilege drop, worker can't read `/root/webalive/claude-bridge/node_modules/`
4. Any `import()` or `require()` inside functions happens AFTER privilege drop → EACCES

**The Fix:**
```javascript
// ✅ CORRECT - All imports at module level, BEFORE privilege drop
import { query } from "@anthropic-ai/claude-agent-sdk"
import { isOAuthMcpTool } from "@webalive/shared"
import { workspaceInternalMcp, toolsInternalMcp } from "@alive-brug/tools"

// ... later in the file ...
dropPrivileges()  // Now running as workspace user

async function handleQuery(ipc, requestId, payload) {
  // Use the already-imported modules - no new imports here!
  const agentQuery = query({ ... })
}
```

**Automated Check:**
```bash
# This runs in CI to prevent the bug from recurring
bun run check:imports  # in packages/worker-pool
```

The check script (`scripts/check-import-order.mjs`) verifies:
1. No `import()` or `require()` inside function bodies
2. All required packages are imported at module level

**Timeline Order in Worker:**
1. ✅ Module-level imports (while running as root)
2. ✅ Connect to Unix socket (while running as root, socket dir is 0o700)
3. ✅ Drop privileges (`setuid()`/`setgid()`)
4. ✅ Handle queries using already-imported modules

**Never:**
- ❌ Dynamic `import()` inside functions
- ❌ `require()` calls after privilege drop
- ❌ Lazy loading of modules in worker entry point

## Stream Cancellation Architecture

### The Problem: 409 Errors After Stop Button

When a user clicks "Stop" during streaming, they expect to immediately send a new message. However, we had a bug where:
1. User clicks Stop
2. Lock is released
3. Worker is still "busy" processing the abort
4. User sends new message
5. Worker rejects with "busy" error → UI shows 409 CONVERSATION_BUSY

### Two-Phase Abort Strategy (Inspired by ChatGPT)

Modern streaming UIs use a **two-phase abort** pattern:

1. **Client-side abort**: `AbortController.abort()` closes the connection immediately
2. **Server-side cancel**: POST request to `/api/claude/stream/cancel` with request ID

```
User clicks Stop
    │
    ├──▶ fetch.abort() ─────────▶ Connection closes immediately (good UX)
    │                            Stream's cancel() is called
    │
    └──▶ POST /cancel ─────────▶ Server marks stream as cancelled
                                 Worker receives abort signal
                                 Worker cleanup timeout (500ms)
```

### Critical Insight: Lock Release Must Wait for Worker

**❌ WRONG - Lock released before worker ready:**
```typescript
cancel() {
  cancelState.requested = true
  cancelState.reader?.cancel()
  onStreamComplete() // WRONG! Worker still busy!
}
```

**✅ CORRECT - Lock released by finally block after abort completes:**
```typescript
async start(controller) {
  try {
    while (true) {
      if (cancelState.requested) break
      const { done } = await reader.read() // Unblocked when cancelled
      if (done) break
    }
  } finally {
    // This runs AFTER reader.cancel() completes
    // The worker has finished cleanup by now
    onStreamComplete() // NOW safe to release lock
  }
}

cancel() {
  cancelState.requested = true
  cancelState.reader?.cancel() // Unblocks the read() in start()
  // DO NOT release lock here - let finally handle it
}
```

### Controller.close() May Throw on Cancelled Streams

When a stream is cancelled, the controller is already closed. Calling `controller.close()` throws an error that can prevent cleanup:

```typescript
// ❌ WRONG - throws "Invalid state: Controller is already closed"
finally {
  controller.close()
  onStreamComplete() // NEVER REACHED if close() throws!
}

// ✅ CORRECT - wrap close() to ensure cleanup always runs
finally {
  try {
    controller.close()
  } catch {
    // Expected on cancel - controller already closed
  }
  onStreamComplete() // ALWAYS runs
}
```

### Cancel Timeout Configuration

The `CANCEL_TIMEOUT_MS` setting controls how long we wait for worker cleanup:

```typescript
// In @webalive/shared/src/constants.ts
CANCEL_TIMEOUT_MS: 500, // 500ms max wait for worker cleanup
```

**Key considerations:**
- Keep it SHORT (<1s) for good UX - users shouldn't wait after clicking Stop
- The SDK may block on API calls that don't respect abort signals
- After timeout, we force cleanup even if worker hasn't responded

### Immediate Resolution Pattern (WorkerPoolManager)

**Critical Bug Fix**: The worker pool's `query()` Promise must resolve IMMEDIATELY when abort is triggered, not wait for worker cleanup.

**❌ WRONG - Wait for timeout before resolving:**
```typescript
const abortHandler = () => {
  this.sendToWorker(worker, { type: "cancel", requestId })
  // Wait up to 500ms for worker to respond
  setTimeout(() => {
    pending.resolve({ cancelled: true }) // TOO LATE!
  }, 500)
}
```

This blocks the NDJSON stream for 500ms, which blocks the finally block, which blocks lock release.

**✅ CORRECT - Resolve immediately, cleanup in background:**
```typescript
const abortHandler = () => {
  // Send cancel (background - don't wait)
  this.sendToWorker(worker, { type: "cancel", requestId })

  // IMMEDIATELY resolve so caller can proceed
  pending.resolve({ cancelled: true })

  // Worker cleanup timeout: Reset to "ready" after 500ms
  // Worker stays "busy" during cleanup to prevent new requests hitting it
  setTimeout(() => {
    if (worker.state === "busy") {
      worker.state = "ready"
    }
  }, 500)
}
```

**Flow:**
1. Abort triggered → Promise resolves immediately
2. `childStream.start()` completes → `controller.close()` called
3. NDJSON stream sees `done: true` → breaks loop → finally runs
4. Lock released → user can send new message
5. (In background) 500ms later → worker state reset to "ready"

The worker stays "busy" for 500ms after cancel, preventing a race where:
- User cancels request to workspace A
- User immediately sends new request to workspace A
- Same worker gets both requests simultaneously

### Cancellation Registry Flow

The cancellation registry tracks active streams for server-side cancel:

```
1. Stream starts
   └──▶ registerCancellation(requestId, userId, convKey, cancelCallback)

2. User clicks Stop
   └──▶ POST /api/claude/stream/cancel { requestId }
        └──▶ cancelStream(requestId, userId)
             └──▶ cancelCallback()
                  ├── cancelState.requested = true
                  ├── cancelState.reader.cancel() → unblocks read()
                  └── workerAbortController.abort() → signals worker

3. Stream cleanup (finally block)
   └──▶ unregisterCancellation(requestId)
   └──▶ unlockConversation(convKey)

4. User sends new message
   └──▶ tryLockConversation(convKey) → success!
```

### Testing Stream Cancellation

Key tests in `lib/stream/__tests__/explicit-cancellation-integration.test.ts`:

1. **The 409 Bug Test**: Verify lock is released after cancel, second request succeeds
2. **Rapid Stop → Send cycles**: 10 consecutive Stop/Send without 409 errors
3. **Double-unlock prevention**: `onStreamComplete` called exactly once
4. **Early cancel**: Cancel before stream starts reading
5. **Error recovery**: Lock released even when child process crashes

### ReadableStream Spec Gotchas

1. **start() is async but begins synchronously**: `cancelState.reader` is set before any `await`
2. **cancel() doesn't wait for start() to complete**: Both run concurrently
3. **reader.cancel() unblocks pending reads**: `read()` resolves with `{ done: true }`
4. **controller.close() is idempotent-ish**: Throws on already-closed controllers

### Debugging Cancellation Issues

Check these logs in sequence:

```
[NDJSON Stream req-1] Stream cancelled by client (abort)    ← cancel() called
[NDJSON Stream req-1] Child process stream complete         ← while loop exited
[NDJSON Stream req-1] Controller already closed (expected)  ← close() threw, caught
[NDJSON Stream req-1] Stream finalized and cleaned up       ← finally completed
```

If "Stream finalized and cleaned up" is missing, the finally block didn't complete. Check:
- Is `controller.close()` throwing uncaught?
- Is there a hanging promise in the finally block?
