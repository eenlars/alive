# Worker Busy Bug: State Machine Analysis

This document explains the "Worker Busy" bug that was fixed, using state machine analysis.

## The Bug

Workers would get stuck in `BUSY` state forever, rejecting all subsequent queries:
```
Error: Worker larsvandeneeden.com is busy processing request migdcncx-9jaoo5
```

## Root Cause: Missing State Transition

### Correct State Machine

```mermaid
stateDiagram-v2
    direction LR

    READY --> BUSY: query received

    state BUSY {
        [*] --> PROCESSING
        PROCESSING --> STREAMING: messages
        STREAMING --> SENDING_COMPLETE: done
        SENDING_COMPLETE --> [*]: complete/error sent
    }

    BUSY --> READY: complete OR error sent to parent
```

**Key invariant:** Every entry to `BUSY` MUST exit via `complete` or `error` message to parent.

### Buggy State Machine (Before Fix)

```mermaid
stateDiagram-v2
    direction LR

    READY --> BUSY: query received

    state BUSY {
        [*] --> PROCESSING
        PROCESSING --> STREAMING: messages
        STREAMING --> DONE: finished
        DONE --> CLEANUP: internal state cleared
        CLEANUP --> [*]: ❌ NO MESSAGE SENT
    }

    BUSY --> STUCK: unhandled rejection
    STUCK --> STUCK: forever busy

    note right of STUCK
        Parent never receives
        complete/error message.
        Worker state cleared but
        parent thinks still busy.
    end note
```

## The Three Failure Modes

### 1. Unhandled Promise Rejection

```mermaid
stateDiagram-v2
    [*] --> READY

    READY --> BUSY: query msg
    BUSY --> REJECTION: handleQuery() throws

    state REJECTION {
        [*] --> UNCAUGHT
        UNCAUGHT --> WORKER_STATE_CLEARED: finally block runs
        WORKER_STATE_CLEARED --> [*]: ❌ no .catch() handler
    }

    REJECTION --> STUCK: parent never notified

    note right of STUCK
        currentRequestId = null (worker thinks idle)
        Parent's activeRequestId = "abc" (parent thinks busy)
        MISMATCH = BUG
    end note
```

**Fix:** Added `.catch()` handler:
```javascript
handleQuery(ipc, msg.requestId, msg.payload).catch((err) => {
  ipc.send({ type: "error", requestId: msg.requestId, error: err.message })
  currentRequestId = null
  currentAbortController = null
})
```

### 2. Early Return Without Cleanup

```mermaid
stateDiagram-v2
    [*] --> READY

    READY --> BUSY: query msg
    BUSY --> VALIDATING: check agentConfig

    VALIDATING --> ERROR_SENT: missing config
    ERROR_SENT --> STUCK: ❌ state not cleared

    note right of STUCK
        ipc.send({ type: "error" }) ✓
        currentRequestId = null ❌ MISSING
        Worker accepts next query
        but parent thinks still busy
    end note
```

**Fix:** Clear state on early return:
```javascript
if (!agentConfig) {
  ipc.send({ type: "error", requestId, error: "Missing agentConfig" })
  currentRequestId = null      // ← Added
  currentAbortController = null // ← Added
  return
}
```

### 3. Request ID Collision

```mermaid
stateDiagram-v2
    [*] --> WORKER_A_BUSY: query req-123
    [*] --> WORKER_B_BUSY: query req-123

    note right of WORKER_A_BUSY
        Two workers with same requestId!
        generateRequestId() only had
        36^6 = 2.1 billion combinations.
        At high volume, collisions occur.
    end note

    WORKER_A_BUSY --> COMPLETE_A: completes
    WORKER_B_BUSY --> COMPLETE_B: completes

    COMPLETE_A --> CONFUSED: parent receives complete for req-123
    COMPLETE_B --> CONFUSED: parent receives ANOTHER complete for req-123
```

**Fix:** Use `crypto.randomUUID()`:
```javascript
export function generateRequestId(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID() // 2^122 combinations
  }
  // fallback with more entropy
}
```

## Correct Implementation: State Guards

The fixed worker guarantees state consistency:

```mermaid
stateDiagram-v2
    [*] --> READY

    READY --> BUSY: query received\n[set currentRequestId]

    state BUSY {
        [*] --> TRY_BLOCK

        TRY_BLOCK --> PROCESSING: normal flow
        TRY_BLOCK --> CATCH_BLOCK: exception

        PROCESSING --> STREAMING
        STREAMING --> SUCCESS: result

        SUCCESS --> FINALLY: send complete
        CATCH_BLOCK --> FINALLY: send error

        FINALLY --> [*]: ALWAYS clears state
    }

    BUSY --> READY: finally block\n[clear currentRequestId]

    note right of FINALLY
        try {
          // query logic
          ipc.send({ type: "complete" })
        } catch (err) {
          ipc.send({ type: "error" })
        } finally {
          currentRequestId = null     // ALWAYS
          currentAbortController = null // ALWAYS
        }
    end note
```

## Invariants (Must Always Hold)

1. **Entry/Exit Parity:** Every `BUSY` entry has exactly one exit path
2. **Parent Notification:** Parent ALWAYS receives `complete` or `error` for each query
3. **State Consistency:** `currentRequestId` in worker matches `activeRequestId` in parent
4. **Unique IDs:** Request IDs never collide (use UUID)

## Test Coverage

Tests verify these invariants:

| Test | Invariant Verified |
|------|-------------------|
| `session-cookie.test.ts` | State transitions include sessionCookie |
| `ipc.test.ts` | Message types are valid |
| `integration.test.ts` | Full query lifecycle works |
| `lifecycle.test.ts` (skipped) | Error recovery clears state |

## Related Files

- `src/worker-entry.mjs` - Worker state machine implementation
- `src/manager.ts` - Parent-side worker tracking
- `src/types.ts` - State and message type constants
