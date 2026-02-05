# Claude Stream Orchestrator - Critical Analysis

**Date**: 2025-11-20
**Scope**: Backend streaming architecture analysis
**Status**: Production system analysis

---

## Executive Summary

The Claude stream orchestrator is a **multi-layered, production-ready system** that manages AI conversations with strict isolation, security, and resource management. This analysis reveals a well-architected system with clear separation of concerns, but also identifies several critical areas requiring attention.

### Key Strengths
✅ **Conversation isolation** via distributed locking with stale detection
✅ **Security-first design** with workspace authorization before path resolution
✅ **Cancellation architecture** that works without request.signal dependency
✅ **Guaranteed cleanup** via try/finally patterns and cleanup flags
✅ **Fire-and-forget credit charging** that doesn't block streams

### Critical Concerns
❌ **In-memory session store** - NOT production-ready, data loss on restart
❌ **Lock timeout edge cases** - 5-minute timeout may be too long for stuck processes
❌ **No distributed lock support** - Won't work across multiple server instances
❌ **Missing backpressure handling** - NDJSON stream can overwhelm slow clients
❌ **Credit charging failures are silent** - No retry mechanism or alerting

---

## 1. Architecture Overview

### Component Hierarchy

```
HTTP Request (POST /api/claude/stream)
    ↓
Stream Endpoint (route.ts)
    ├─ Authentication & Validation
    ├─ Workspace Authorization
    ├─ Conversation Locking
    └─ Child Process Spawn
        ↓
Agent Child Runner (agent-child-runner.ts)
    ├─ Privilege Dropping (UID/GID)
    ├─ Process Isolation
    └─ Claude Agent SDK
        ↓
NDJSON Stream Handler (ndjson-stream-handler.ts)
    ├─ Event Parsing
    ├─ Session Persistence
    ├─ Credit Charging
    └─ Cancellation Detection
        ↓
HTTP Response (NDJSON over SSE-like transport)
```

### Data Flow Separation

The architecture clearly separates **what the SDK does** from **what our orchestration does**:

| SDK Responsibility | Our Orchestration |
|-------------------|-------------------|
| Agentic loop (think/act/observe) | Authentication & authorization |
| Tool execution (Read/Write/Edit/Glob/Grep) | Conversation locking |
| Conversation context tracking | Session persistence |
| Token usage tracking | Credit charging |
| Streaming SDK messages | NDJSON transport |
| Session resumption (resume parameter) | Cancellation registry |
| JSON event emission | Error transformation |

**Critical insight**: The SDK is stateless from our perspective - it emits events, we manage lifecycle.

---

## 2. Request Lifecycle - Critical Path Analysis

### Phase 1: Request Initiation (Lines 41-127)

**Purpose**: Validate request before expensive operations

**Steps**:
1. Generate `requestId` (UUID v4)
2. Extract session cookie (`COOKIE_NAMES.SESSION`)
3. Parse JSON body
4. Validate against zod schema (`BodySchema`)
5. Check input safety (`isInputSafe()`)

**Critical observations**:
- ✅ **Defense-in-depth**: E2E test protection prevents real API calls during tests
- ✅ **Early validation**: Schema validation before workspace operations
- ⚠️ **Missing rate limiting**: No per-user request throttling at this layer

**Error handling**: 401 (no session), 400 (bad schema), 403 (unsafe input)

### Phase 2: Workspace Authorization (Lines 128-199)

**SECURITY-CRITICAL ORDERING**:

```typescript
// 1. AUTHORIZATION FIRST (line 139)
await verifyWorkspaceAccess(user.id, workspace)

// 2. PATH RESOLUTION AFTER (line 147)
const workspacePath = await resolveWorkspace(workspace, user.id)
```

**Why this matters**:
- Path resolution could be expensive (filesystem access)
- Must verify user ownership BEFORE touching filesystem
- Prevents unauthorized workspace enumeration

**Token source determination** (lines 154-182):
```
IF org credits >= 1:
    Use "workspace" token source (charge org)
ELSE IF user provided API key:
    Use "user_provided" token source (no charge)
ELSE:
    Return 402 INSUFFICIENT_TOKENS
```

**Critical observation**:
- ✅ **Clear precedence**: Org credits prioritized over user API keys
- ⚠️ **No credit reservation**: Credits checked but not reserved (race condition possible)
- ❌ **No credit hold**: User could exhaust credits mid-stream

### Phase 3: Conversation Locking (Lines 233-256)

**Lock key format**: `userId::workspaceDomain::conversationId`

**Atomicity analysis**:

```typescript
// TOCTOU window reduced but NOT eliminated
const existingLockTime = conversationLockTimestamps.get(key)

// Stale check
if (existingLockTime !== undefined && lockAge > LOCK_TIMEOUT_MS) {
    activeConversations.delete(key)
    conversationLockTimestamps.delete(key)
    // RACE WINDOW: Another thread could acquire here
}

// Double-check pattern
if (conversationLockTimestamps.has(key)) {
    return false  // Reduces race window
}

// Acquire
conversationLockTimestamps.set(key, now)
activeConversations.add(key)
```

**Critical issues**:
- ❌ **Not truly atomic**: JavaScript Set/Map operations are not atomic across async boundaries
- ⚠️ **5-minute timeout too long**: Stuck processes hold locks for 5 minutes
- ❌ **Single-process only**: Won't work with multiple server instances (no Redis/DB lock)
- ✅ **Cleanup mechanism**: Background task every 60s cleans stale locks

**Recommendation**: Implement Redis-based distributed lock with shorter timeout (30-60 seconds)

### Phase 4: Session Resumption (Lines 258-259)

**Session store query**:
```typescript
const existingSessionId = await sessionStore.get(convKey)
```

**Critical flaw**:
- ❌ **IN-MEMORY STORAGE**: `sessionStore` uses in-memory Map
- ❌ **Data loss on restart**: All sessions lost if server restarts
- ❌ **Not production-ready**: Acknowledged in code comments

**Current implementation** (`features/auth/lib/sessionStore.ts`):
- Queries Supabase IAM `sessions` table
- Caches domain hostname → domain_id (5-min TTL)
- Session key format: `userId::workspaceDomain::conversationId`

**Why this works for now**:
- ✅ Sessions ARE persisted to Supabase
- ❌ But in-memory cache can return stale data
- ❌ No cache invalidation on session updates

**Recommendation**: Remove in-memory layer, query Supabase directly (or use Redis cache with proper TTL)

### Phase 5: Cancellation Registry Setup (Lines 293-330)

**Design pattern**: Pre-register cancellation callback before stream starts

```typescript
const cancelState = { requested: false, reader: null }

registerCancellation(requestId, userId, convKey, () => {
    cancelState.requested = true
    cancelState.reader?.cancel()
})
```

**Why this architecture**:
- ✅ **No req.signal dependency**: Works with Edge Runtime restrictions
- ✅ **Early cancellation support**: Can cancel before stream fully initialized
- ✅ **Two-path cancellation**: By requestId (primary) or conversationKey (fallback)

**Critical observations**:
- ✅ **Security check**: Verifies userId matches before cancelling
- ✅ **Auto-cleanup**: TTL cleanup every 5 minutes for stale entries
- ⚠️ **No deduplication**: Multiple registrations for same key will overwrite

### Phase 6: Child Process Spawn (Lines 283-344)

**Security isolation**:

```typescript
const child = spawn(process.execPath, [runnerPath], {
    env: {
        TARGET_UID: String(uid),  // Workspace user UID
        TARGET_GID: String(gid),  // Workspace user GID
        TARGET_CWD: workspaceRoot,
        ANTHROPIC_API_KEY: payload.apiKey || process.env.ANTHROPIC_API_KEY,
    },
    stdio: ["pipe", "pipe", "pipe"],
})
```

**Privilege separation**:
- Parent process runs as root (Bridge server)
- Child process drops to workspace user (e.g., `site-example-com`)
- Runner script (`run-agent.mjs`) calls `process.setuid()` and `process.setgid()`

**Critical security features**:
- ✅ **UID/GID validation**: Refuses to run as root (uid === 0)
- ✅ **File ownership check**: Validates workspace directory owner
- ✅ **Environment isolation**: Child only sees necessary env vars

**Potential issues**:
- ⚠️ **No resource limits**: Child process has no CPU/memory limits (should use cgroups)
- ⚠️ **No timeout**: Child can run forever until lock timeout (5 minutes)

### Phase 7: NDJSON Stream Creation

**Stream processing loop**:

```typescript
return new ReadableStream({
    async start(controller) {
        const reader = childStream.getReader()
        cancelState.reader = reader  // Store for cancellation
        let buffer = ""

        try {
            while (true) {
                // Check explicit cancellation
                if (cancelState.requested) {
                    onStreamComplete?.()
                    break
                }

                const { done, value } = await reader.read()
                if (done) break

                // NDJSON parsing
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""

                for (const line of lines) {
                    if (cancelState.requested) break
                    if (!line.trim()) continue

                    try {
                        const childEvent = JSON.parse(line)
                        await processChildEvent(...)
                    } catch (parseError) {
                        console.error(`Failed to parse child output`)
                        // CONTINUES PROCESSING - doesn't break stream
                    }
                }

                if (cancelState.requested) break
            }

            // Final buffer processing
            if (buffer.trim()) {
                const childEvent = JSON.parse(buffer)
                await processChildEvent(...)
            }
        } catch (error) {
            controller.enqueue(encodeNDJSON(errorMessage))
        } finally {
            controller.close()
            if (!cleanupCalled) {
                onStreamComplete?.()
                cleanupCalled = true
            }
        }
    },

    cancel() {
        // Client abort handler
        if (!cleanupCalled) {
            onStreamComplete?.()
            cleanupCalled = true
        }
        cancelState.reader?.cancel().catch(...)
    }
})
```

**Critical observations**:
- ✅ **Guaranteed cleanup**: `finally` block ensures cleanup happens
- ✅ **Double-cleanup prevention**: `cleanupCalled` flag prevents multiple calls
- ✅ **Cancellation checks**: Multiple points check `cancelState.requested`
- ⚠️ **No backpressure**: Stream reads as fast as possible, no buffering control
- ❌ **Parse errors ignored**: Invalid JSON lines are logged but not sent to client

### Phase 8: Event Processing

**Two event types**:

1. **Session events** (`stream_session`):
   ```typescript
   await sessionStore.set(conversationKey, sessionId)
   onSessionIdReceived?.(sessionId)
   ```

2. **Message events** (all others):
   ```typescript
   const message = buildStreamMessage(childEvent)

   if (tokenSource === "workspace") {
       chargeTokensForMessage(message, workspace, requestId).catch(...)
   }

   controller.enqueue(encodeNDJSON(message))
   ```

**Credit charging process**:
```
Extract usage from assistant message
    ↓
calculateLLMTokenCost(usage)
    input_tokens * 1 + output_tokens * 3
    ↓
llmTokensToCredits()
    Divide by 100
    ↓
Apply WORKSPACE_CREDIT_DISCOUNT (0.5 = 50% discount)
    ↓
chargeTokensFromCredits(workspace, llmTokensUsed)
    UPDATE app.organizations
    SET credits = credits - creditsToCharge
    WHERE workspace_name = workspace
```

**Critical issues with credit charging**:
- ❌ **Fire-and-forget**: Errors don't surface to user
- ❌ **No retry mechanism**: Failed charges are lost
- ❌ **No alerting**: Silent failures could lead to free API usage
- ⚠️ **No transaction**: Credit check and charge are separate operations (race condition)

**Recommendation**:
- Add credit reservation at request start
- Release reservation on stream complete
- Implement retry with exponential backoff
- Alert on repeated failures

---

## 3. Cancellation Architecture - Deep Dive

### Two Cancellation Paths

#### Path 1: Cancel by Request ID (Primary)

**Client flow**:
```
1. POST /api/claude/stream (get X-Request-Id header)
2. POST /api/claude/stream/cancel { requestId }
3. Registry calls callback → cancelState.requested = true
4. Stream loop detects flag → breaks
```

**Security check**:
```typescript
export function cancelStream(requestId: string, userId: string): boolean {
    const entry = registry.get(requestId)
    if (!entry) return false  // Already completed

    if (entry.userId !== userId) {
        throw new Error("Unauthorized")  // Prevent cross-user cancellation
    }

    entry.cancel()
    registry.delete(requestId)
    return true
}
```

#### Path 2: Cancel by Conversation Key (Fallback)

**Use case**: User clicks Stop before X-Request-Id header received

**Client flow**:
```
1. POST /api/claude/stream (immediately send cancel)
2. POST /api/claude/stream/cancel { conversationId, workspace }
3. Build conversationKey = userId::workspace::conversationId
4. Search registry for matching entry
```

**Critical observations**:
- ✅ **Covers race condition**: Works even if cancel sent before stream starts
- ⚠️ **Linear search**: O(n) scan of registry (fine for small registries)
- ✅ **Same security check**: Verifies userId matches

### Cancellation State Sharing

**Shared object pattern**:
```typescript
const cancelState = { requested: false, reader: null }

// Parent holds reference
registerCancellation(..., () => {
    cancelState.requested = true
    cancelState.reader?.cancel()
})

// Child holds reference
cancelState.reader = reader

// Both can modify, JavaScript closure ensures shared state
```

**Why this works**:
- ✅ **Shared memory**: Both parent and stream handler reference same object
- ✅ **No messaging needed**: Direct state modification
- ⚠️ **Single-process only**: Won't work with worker threads or distributed architecture

### TTL Cleanup

**Background cleanup** (every 5 minutes):
```typescript
setInterval(() => {
    const now = Date.now()
    for (const [requestId, entry] of registry.entries()) {
        if (now - entry.createdAt > 10 * 60 * 1000) {  // 10 minutes
            entry.cancel()  // Force-cancel
            registry.delete(requestId)
        }
    }
}, 5 * 60 * 1000)
```

**Critical observations**:
- ✅ **Prevents memory leaks**: Crashed streams don't accumulate
- ⚠️ **Fixed interval**: Doesn't scale with registry size
- ✅ **Force-cancels**: Calls cancel callback to clean up stream

---

## 4. Error Handling - Failure Modes

### Error Path 1: Pre-Lock Failures

**Examples**: Auth failure, validation error, workspace not found

**Handling**:
```typescript
return NextResponse.json({ error: "..." }, { status: 401/400/404 })
```

**Cleanup**: None needed (lock not acquired)

### Error Path 2: Post-Lock Failures

**Examples**: Child spawn error, workspace path resolution error

**Handling**:
```typescript
try {
    // spawn child, create stream
} catch (error) {
    if (lockAcquired) {
        try {
            unlockConversation(convKey)
        } catch (unlockError) {
            logger.error("Failed to unlock")
        }
    }
    return NextResponse.json({ error: "..." }, { status: 500 })
}
```

**Critical observations**:
- ✅ **Guaranteed unlock**: Lock released even if error
- ✅ **Double-try-catch**: Unlock errors don't prevent error response
- ⚠️ **No cancellation registry cleanup**: Registry entry may leak if error before cleanup callback

### Error Path 3: Stream Processing Errors

**Examples**: Child process crash, invalid NDJSON, SDK error

**Handling**:
```typescript
try {
    while (true) {
        // read, parse, process
    }
} catch (error) {
    controller.enqueue(encodeNDJSON({
        type: "error",
        error: error.message
    }))
} finally {
    controller.close()
    if (!cleanupCalled) {
        onStreamComplete()  // Unlocks conversation, unregisters cancellation
        cleanupCalled = true
    }
}
```

**Critical observations**:
- ✅ **Error sent to client**: User sees what went wrong
- ✅ **Stream closes gracefully**: Client knows stream is done
- ✅ **Cleanup guaranteed**: finally block always runs

### Error Path 4: Parse Errors

**Examples**: Invalid JSON in NDJSON line

**Handling**:
```typescript
try {
    const childEvent = JSON.parse(line)
    await processChildEvent(...)
} catch (parseError) {
    console.error(`Failed to parse child output: ${line}`)
    // CONTINUES PROCESSING NEXT LINE
}
```

**Critical issues**:
- ❌ **Silent failure**: Client never knows about parse error
- ❌ **No recovery**: Invalid lines are dropped
- ⚠️ **Potential data loss**: If SDK emits malformed JSON, user loses that message

**Recommendation**: Send error event to client, include raw line in error payload

### Error Path 5: Credit Charging Failures

**Examples**: Supabase down, negative credits, invalid workspace

**Handling**:
```typescript
chargeTokensForMessage(message, workspace, requestId).catch((error) => {
    console.error(`Failed to charge tokens: ${error}`)
    // STREAM CONTINUES
})
```

**Critical issues**:
- ❌ **Silent failure**: User gets free API usage
- ❌ **No retry**: Transient errors result in lost revenue
- ❌ **No alerting**: Finance team doesn't know about failures

**Recommendation**:
- Queue failed charges for retry
- Alert on repeated failures
- Block future requests if charges consistently fail

---

## 5. Concurrency Control - Race Conditions

### Race 1: Lock Acquisition

**Scenario**: Two requests for same conversation arrive simultaneously

**Current mitigation**:
```typescript
// Double-check pattern
if (conversationLockTimestamps.has(key)) {
    return false
}
conversationLockTimestamps.set(key, now)
```

**Analysis**:
- ⚠️ **Reduced window**: Race window is ~2 lines of code
- ❌ **Not atomic**: JavaScript async can interleave between check and set
- ❌ **No true mutex**: Set/Map operations are not atomic primitives

**Observed behavior**:
- Low probability of collision in practice (single-threaded event loop)
- BUT: Worker threads or multi-instance deployment will expose this

**Recommendation**: Use Redis SETNX or Supabase advisory locks

### Race 2: Credit Check vs. Charge

**Scenario**: User has 10 credits, sends 3 requests simultaneously

**Current behavior**:
```
1. All 3 requests check: credits >= 1 ✅
2. All 3 requests spawn child
3. Stream 1 charges 5 credits (balance = 5)
4. Stream 2 charges 5 credits (balance = 0)
5. Stream 3 charges 5 credits (balance = -5) ❌ NEGATIVE BALANCE
```

**Critical flaw**:
- ❌ **No credit reservation**: Credits checked but not held
- ❌ **Async charging**: Charges happen during stream, not upfront
- ❌ **No balance protection**: Supabase UPDATE doesn't check balance

**Recommendation**:
```sql
-- Atomic debit with balance check
UPDATE app.organizations
SET credits = credits - :amount
WHERE workspace_name = :workspace
  AND credits >= :amount  -- Prevent negative balance
RETURNING credits;

-- If no rows returned, charge failed (insufficient credits)
```

### Race 3: Session Store Cache

**Scenario**: Session updated while cache has stale entry

**Current behavior**:
- Cache has 5-minute TTL
- No cache invalidation on updates
- Possible to read stale session ID

**Impact**: Low (session IDs are immutable once created)

### Race 4: Cancellation Registry

**Scenario**: Cancel request arrives during stream initialization

**Current behavior**:
```
1. Request A: registerCancellation(...) - sets callback
2. Request B (cancel): cancelStream(requestId) - calls callback
3. Request A: cancelState.reader = reader - sets reader (AFTER cancel)
```

**Analysis**:
- ✅ **Flag set early**: cancelState.requested = true happens first
- ✅ **Loop checks flag**: Stream loop detects cancellation
- ⚠️ **Reader not cancelled**: If reader set after cancel, reader.cancel() not called

**Observed behavior**: Works in practice because callback can be called multiple times

---

## 6. Resource Management - Cleanup Guarantees

### Cleanup Checklist

For each request, the following MUST be cleaned up:

1. ✅ **Conversation lock** - Released in onStreamComplete() or error handler
2. ✅ **Cancellation registry** - Unregistered in onStreamComplete()
3. ✅ **Child process** - Killed via SIGTERM/SIGKILL in runAgentChild cleanup
4. ✅ **Stream readers** - Closed in finally block
5. ✅ **Event listeners** - Removed in child cleanup handler
6. ⚠️ **Session store** - No cleanup needed (persistent)
7. ❌ **Credit reservation** - Not implemented

### Cleanup Code Paths

#### Path 1: Normal Completion

```
Stream loop finishes
    ↓
finally block runs
    ↓
controller.close()
    ↓
if (!cleanupCalled) onStreamComplete()
    ↓
    - unregisterCancellation(requestId)
    - unlockConversation(convKey)
```

#### Path 2: Explicit Cancellation

```
POST /api/claude/stream/cancel
    ↓
cancelStream(requestId, userId)
    ↓
entry.cancel() callback runs
    ↓
    - cancelState.requested = true
    - cancelState.reader?.cancel()
    ↓
Stream loop detects flag
    ↓
onStreamComplete() called
    ↓
finally block runs
    ↓
cleanup completed
```

#### Path 3: Client Abort

```
Client closes connection
    ↓
ReadableStream.cancel() called
    ↓
cancel() handler runs
    ↓
    - if (!cleanupCalled) onStreamComplete()
    - cancelState.reader?.cancel()
    ↓
reader.cancel() interrupts read()
    ↓
catch block handles error
    ↓
finally block runs
```

#### Path 4: Error During Setup

```
Error thrown after lock acquired
    ↓
catch block in stream endpoint
    ↓
if (lockAcquired) unlockConversation(convKey)
    ↓
return error response
```

**Critical observations**:
- ✅ **All paths clean up lock**: Lock is ALWAYS released
- ✅ **Cleanup flag prevents double-cleanup**: onStreamComplete() called exactly once
- ⚠️ **Registry cleanup missing in error path 4**: If error before stream created, registry entry leaks

---

## 7. Memory Safety Analysis

### Memory Leak Vectors

1. **Cancellation Registry** ✅ Mitigated
   - TTL cleanup every 5 minutes
   - Entries older than 10 minutes force-cleaned
   - Auto-cleanup on successful completion

2. **Conversation Locks** ✅ Mitigated
   - Timeout: 5 minutes
   - Background cleanup every 60 seconds
   - Force-released on stale detection

3. **Domain Cache** ✅ Mitigated
   - 5-minute TTL per entry
   - Cleanup every 10 minutes
   - Bounded by number of domains (low cardinality)

4. **Event Listeners** ✅ Mitigated
   - Stored by reference
   - Removed in cleanup handler
   - No anonymous functions used

5. **Session Store** ❌ UNBOUNDED
   - In-memory Map with no size limit
   - No LRU eviction
   - Grows with unique conversations
   - **Critical**: Will OOM eventually

**Recommendation**: Replace in-memory session store with Redis or query Supabase directly

### Listener Management Pattern

**Correct pattern** (used in code):
```typescript
// Store references
const dataHandler = (chunk: Buffer) => { ... }
const endHandler = () => { ... }
const errorHandler = (err: Error) => { ... }
const exitHandler = (code: number | null) => { ... }

// Add listeners
child.stdout.on("data", dataHandler)
child.stdout.on("end", endHandler)
child.stdout.on("error", errorHandler)
child.on("exit", exitHandler)

// Cleanup (by reference)
function cleanup() {
    child.stdout.off("data", dataHandler)
    child.stdout.off("end", endHandler)
    child.stdout.off("error", errorHandler)
    child.off("exit", exitHandler)
}
```

**Why this works**:
- ✅ **Reference equality**: off() removes exact listener
- ✅ **No leaks**: All listeners removed in cleanup
- ✅ **Idempotent**: off() with non-existent listener is safe

---

## 8. Production Readiness Assessment

### Critical Blockers (Must Fix Before Multi-Instance Deployment)

1. ❌ **Session Store**
   - Current: In-memory Map
   - Issue: Data loss on restart, no cross-instance sharing
   - Fix: Use Supabase directly or add Redis cache

2. ❌ **Conversation Locking**
   - Current: In-memory Set
   - Issue: No distributed lock support
   - Fix: Redis SETNX or Supabase advisory locks

3. ❌ **Credit Reservation**
   - Current: Check-then-charge (race condition)
   - Issue: Negative balances possible
   - Fix: Atomic debit with balance check

4. ❌ **Credit Charging Failures**
   - Current: Silent failure
   - Issue: Lost revenue, no alerting
   - Fix: Retry queue + alerts

### High Priority (Should Fix)

5. ⚠️ **Lock Timeout**
   - Current: 5 minutes
   - Issue: Stuck processes hold locks too long
   - Fix: Reduce to 30-60 seconds, add child process timeout

6. ⚠️ **No Backpressure**
   - Current: Stream reads as fast as possible
   - Issue: Can overwhelm slow clients
   - Fix: Implement buffering with high water mark

7. ⚠️ **Parse Error Handling**
   - Current: Silent drop
   - Issue: User loses messages
   - Fix: Send error event to client with raw line

8. ⚠️ **No Resource Limits**
   - Current: Child process has no limits
   - Issue: Runaway process can exhaust server
   - Fix: Use cgroups or systemd resource limits

### Medium Priority (Nice to Have)

9. ⚠️ **No Rate Limiting**
   - Current: None at stream endpoint
   - Issue: User can spam requests
   - Fix: Add per-user rate limiting

10. ⚠️ **No Metrics**
    - Current: Only console logs
    - Issue: No observability
    - Fix: Add OpenTelemetry or similar

11. ⚠️ **No Health Checks**
    - Current: No /health endpoint
    - Issue: Load balancer can't detect unhealthy instances
    - Fix: Add health check endpoint

---

## 9. SDK vs. Orchestration - Boundary Analysis

### Clear Responsibilities

| Layer | Responsibility | State Management |
|-------|---------------|------------------|
| **SDK** (Child Process) | • Agentic loop (think/act/observe)<br>• Tool execution<br>• Conversation context<br>• Token usage tracking<br>• Session resumption logic | • Session ID (opaque to us)<br>• Tool state<br>• Conversation history<br>• Internal SDK state |
| **Orchestration** (Our Code) | • Authentication<br>• Authorization<br>• Conversation locking<br>• Session persistence<br>• Credit charging<br>• Cancellation<br>• Transport (NDJSON over HTTP) | • activeConversations Set<br>• conversationLockTimestamps Map<br>• cancellation registry<br>• session store<br>• credit balances |

### Message Flow Boundary

```
┌─────────────────────────────────────────┐
│          SDK (Child Process)            │
│  ┌───────────────────────────────────┐  │
│  │   Claude Agent SDK                │  │
│  │   - Runs agentic loop             │  │
│  │   - Executes tools                │  │
│  │   - Tracks conversation           │  │
│  └───────────┬───────────────────────┘  │
│              │ JSON events              │
│              │ (stdout)                 │
└──────────────┼──────────────────────────┘
               │
               │ NDJSON Stream
               │
┌──────────────▼──────────────────────────┐
│      Orchestration (Parent Process)     │
│  ┌───────────────────────────────────┐  │
│  │   NDJSON Stream Handler           │  │
│  │   - Parse JSON events             │  │
│  │   - Persist sessions              │  │
│  │   - Charge credits                │  │
│  │   - Detect cancellation           │  │
│  │   - Transform to BridgeStreamType │  │
│  └───────────┬───────────────────────┘  │
│              │ BridgeStreamType         │
│              │ (HTTP response)          │
└──────────────┼──────────────────────────┘
               │
               │ HTTP NDJSON
               │
┌──────────────▼──────────────────────────┐
│            Client (Browser)             │
│  ┌───────────────────────────────────┐  │
│  │   Stream Parser                   │  │
│  │   - Parse NDJSON                  │  │
│  │   - Track tool use                │  │
│  │   - Render UI                     │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Event Transformation

**SDK Output** (stdout):
```json
{"type":"stream_session","sessionId":"sess_abc123"}
{"type":"assistant","text":"I'll help you...","usage":{"input_tokens":100,"output_tokens":50}}
{"type":"tool_use","id":"tu_123","name":"Read","input":{"path":"..."}}
```

**Our Output** (HTTP):
```json
{"conversationId":"conv-123","role":"assistant","content":[{"type":"text","text":"I'll help you..."}],"usage":{"input_tokens":100,"output_tokens":50}}
{"conversationId":"conv-123","role":"assistant","content":[{"type":"tool_use","id":"tu_123","name":"Read","input":{"path":"..."}}]}
```

**Transformation**:
- Extract session ID → persist to SessionStore
- Map SDK message types → Bridge message types
- Add conversationId to all messages
- Charge credits for assistant messages with usage

---

## 10. Recommendations - Priority Roadmap

### P0 - Critical (Block Multi-Instance)

1. **Replace in-memory session store** with Supabase direct queries
   - Remove `sessionStore` Map
   - Query `iam.sessions` directly
   - Cache domain_id lookups (already done)
   - Estimated effort: 4 hours

2. **Implement distributed conversation locking**
   - Use Redis SETNX for locks
   - Fallback to Supabase advisory locks if Redis unavailable
   - Keep 30-second timeout
   - Estimated effort: 8 hours

3. **Add credit reservation**
   - Reserve credits at request start (optimistic lock)
   - Charge actual usage during stream
   - Refund difference on completion
   - Use atomic UPDATE with balance check
   - Estimated effort: 8 hours

4. **Add credit charging retry**
   - Queue failed charges in database
   - Background worker retries with exponential backoff
   - Alert on 3+ consecutive failures
   - Estimated effort: 16 hours

### P1 - High (Performance/Reliability)

5. **Reduce lock timeout to 60 seconds**
   - Add child process timeout (kill after 60s)
   - Update LOCK_TIMEOUT_MS constant
   - Test with long-running requests
   - Estimated effort: 4 hours

6. **Add backpressure handling**
   - Implement buffering in NDJSON stream
   - Set high water mark (e.g., 100 messages)
   - Pause child stream if buffer full
   - Estimated effort: 8 hours

7. **Improve parse error handling**
   - Send error events to client
   - Include raw line in error payload
   - Add metric for parse errors
   - Estimated effort: 2 hours

8. **Add child process resource limits**
   - Use systemd slice for cgroups
   - Set memory limit (e.g., 512MB)
   - Set CPU quota (e.g., 50%)
   - Estimated effort: 4 hours

### P2 - Medium (Observability/Safety)

9. **Add request rate limiting**
    - Per-user limit (e.g., 10 requests/minute)
    - Use Redis or in-memory sliding window
    - Return 429 when exceeded
    - Estimated effort: 4 hours

10. **Add OpenTelemetry tracing**
    - Instrument stream endpoint
    - Trace child process lifecycle
    - Trace credit charging
    - Add to Grafana
    - Estimated effort: 16 hours

11. **Add health check endpoint**
    - Check Redis connection
    - Check Supabase connection
    - Check child process spawn
    - Return 200 if healthy, 503 if not
    - Estimated effort: 2 hours

---

## Conclusion

The Claude stream orchestrator is a **well-designed, production-grade system** with clear separation of concerns and robust error handling. The architecture demonstrates:

✅ **Strong security boundaries** (workspace authorization, privilege separation)
✅ **Careful resource management** (guaranteed cleanup, TTL for leaks)
✅ **Graceful error handling** (multiple error paths, client error propagation)
✅ **Cancellation support** (works without request.signal, two-path design)

However, several **critical issues must be addressed** before multi-instance deployment:

❌ In-memory session store (data loss)
❌ Single-process locking (no distributed support)
❌ Credit race conditions (negative balances possible)
❌ Silent credit charging failures (lost revenue)

**Recommended next steps**:

1. **Immediate**: Fix P0 issues (session store, distributed locking, credit reservation)
2. **Short-term**: Address P1 issues (timeout, backpressure, resource limits)
3. **Medium-term**: Improve observability (metrics, tracing, health checks)

With these fixes, the system will be ready for production multi-instance deployment with high confidence.
