# Claude Stream Orchestrator - State Machines & Diagrams

**Date**: 2025-11-20
**Scope**: Visual representations of streaming architecture

---

## 1. Main Request State Machine

This diagram shows the complete lifecycle of a streaming request, including all possible states and transitions.

```mermaid
stateDiagram-v2
    [*] --> RequestReceived: POST /api/claude/stream

    RequestReceived --> Validating: Extract session + body

    Validating --> AuthFailed: Invalid session
    Validating --> ValidationFailed: Invalid schema/unsafe input
    Validating --> WorkspaceAuth: Valid request

    AuthFailed --> [*]: Return 401
    ValidationFailed --> [*]: Return 400/403

    WorkspaceAuth --> AuthorizationFailed: User doesn't own workspace
    WorkspaceAuth --> TokenSourceDetermination: Workspace verified

    AuthorizationFailed --> [*]: Return 403

    TokenSourceDetermination --> InsufficientCredits: No credits + no API key
    TokenSourceDetermination --> LockAcquisition: Credits available OR API key provided

    InsufficientCredits --> [*]: Return 402

    LockAcquisition --> LockFailed: Conversation already locked
    LockAcquisition --> SessionLookup: Lock acquired

    LockFailed --> [*]: Return 409 CONVERSATION_BUSY

    SessionLookup --> CancellationSetup: Session ID retrieved (or null)

    CancellationSetup --> ChildSpawn: Registry callback registered

    ChildSpawn --> SpawnFailed: Process spawn error
    ChildSpawn --> Streaming: Child process started

    SpawnFailed --> Cleanup: Release lock

    Streaming --> Cancelled: Explicit cancel (POST /cancel)
    Streaming --> StreamError: Child crash or parse error
    Streaming --> StreamComplete: Child process exits normally

    Cancelled --> Cleanup: Stop reading, close stream
    StreamError --> Cleanup: Send error event, close stream
    StreamComplete --> Cleanup: Final processing

    Cleanup --> [*]: Unlock conversation, unregister cancellation

    note right of LockAcquisition
        Critical: Lock prevents
        concurrent requests to
        same conversation
    end note

    note right of Streaming
        Core processing loop:
        - Read NDJSON from child
        - Parse events
        - Persist sessions
        - Charge credits
        - Stream to client
    end note

    note right of Cleanup
        Guaranteed cleanup via
        try/finally pattern with
        cleanupCalled flag
    end note
```

---

## 2. Conversation Locking State Machine

This diagram shows the detailed lock acquisition and release flow with timeout handling.

```mermaid
stateDiagram-v2
    [*] --> LockCheck: tryLockConversation(key)

    LockCheck --> ReadTimestamp: Check if lock exists

    ReadTimestamp --> NoLock: Lock doesn't exist
    ReadTimestamp --> StaleCheck: Lock exists

    StaleCheck --> StaleLock: Age > 5 minutes
    StaleCheck --> ActiveLock: Age <= 5 minutes

    StaleLock --> ForceUnlock: Clean up stale lock
    ForceUnlock --> DoubleCheck: Lock removed

    ActiveLock --> [*]: Return false (locked)

    NoLock --> DoubleCheck: Proceed to acquire

    DoubleCheck --> RaceLost: Lock acquired by another request
    DoubleCheck --> AtomicAcquire: Still available

    RaceLost --> [*]: Return false (race lost)

    AtomicAcquire --> Locked: Set timestamp + add to Set

    Locked --> Unlocked: unlockConversation() called
    Locked --> TimeoutCleanup: 5 minutes elapsed

    TimeoutCleanup --> Unlocked: Background cleanup task

    Unlocked --> [*]: Remove from Set + Map

    note right of DoubleCheck
        TOCTOU race window
        reduced from ~18 lines
        to ~2 lines
    end note

    note right of AtomicAcquire
        NOT truly atomic!
        JavaScript Set/Map ops
        can interleave in async
    end note

    note right of TimeoutCleanup
        Background task runs
        every 60 seconds,
        cleans locks older
        than 5 minutes
    end note
```

---

## 3. NDJSON Stream Processing State Machine

This diagram shows the streaming loop that processes child process output.

```mermaid
stateDiagram-v2
    [*] --> StreamStart: start() callback invoked

    StreamStart --> LoopInit: Get reader, init buffer

    LoopInit --> CancelCheck: Start of while(true) loop

    CancelCheck --> Cancelled: cancelState.requested = true
    CancelCheck --> ReadChunk: Not cancelled

    Cancelled --> Finally: Break from loop

    ReadChunk --> Done: reader.read() returns done
    ReadChunk --> ProcessChunk: Got chunk value
    ReadChunk --> ReadError: reader.read() throws

    Done --> FinalBuffer: Check remaining buffer
    ProcessChunk --> BufferParse: Decode + split by newline

    BufferParse --> LineParse: For each complete line

    LineParse --> CancelCheckInner: Check cancel during processing
    LineParse --> BufferParse: All lines processed

    CancelCheckInner --> Cancelled: cancelState.requested = true
    CancelCheckInner --> JSONParse: Not cancelled

    JSONParse --> ParseError: Invalid JSON
    JSONParse --> EventProcess: Valid JSON

    ParseError --> LineParse: Log error, continue

    EventProcess --> SessionEvent: type = "bridge_session"
    EventProcess --> MessageEvent: Other types

    SessionEvent --> SessionPersist: Store in SessionStore
    SessionPersist --> LineParse: Continue processing

    MessageEvent --> CreditCheck: Build StreamMessage

    CreditCheck --> ChargeCredits: tokenSource = "workspace"
    CreditCheck --> EnqueueMessage: tokenSource = "user_provided"

    ChargeCredits --> EnqueueMessage: Fire-and-forget async

    EnqueueMessage --> LineParse: controller.enqueue()

    FinalBuffer --> EventProcess: Parse final buffer
    FinalBuffer --> Finally: Buffer empty

    ReadError --> ErrorEvent: Catch block

    ErrorEvent --> Finally: Send error to client

    Finally --> StreamClose: controller.close()

    StreamClose --> CleanupCheck: Check cleanupCalled flag

    CleanupCheck --> OnStreamComplete: !cleanupCalled
    CleanupCheck --> End: Already cleaned up

    OnStreamComplete --> End: Unlock + unregister

    End --> [*]

    note right of CancelCheck
        Multiple cancellation
        checks throughout loop
        ensure responsive stop
    end note

    note right of ParseError
        Parse errors are logged
        but DON'T break stream
        (potential data loss)
    end note

    note right of Finally
        Guaranteed cleanup:
        - Close stream
        - Call onStreamComplete()
        - Set cleanupCalled flag
    end note
```

---

## 4. Cancellation Flow Sequence Diagram

This diagram shows the two cancellation paths and their timing.

```mermaid
sequenceDiagram
    participant Client
    participant StreamEndpoint
    participant CancelEndpoint
    participant Registry
    participant NDJSONHandler
    participant ChildProcess

    Note over Client,ChildProcess: PATH 1: Cancel by Request ID (Primary)

    Client->>StreamEndpoint: POST /api/claude/stream
    StreamEndpoint->>Registry: registerCancellation(requestId, callback)
    Registry-->>StreamEndpoint: Registered
    StreamEndpoint->>ChildProcess: spawn()
    ChildProcess-->>StreamEndpoint: ReadableStream
    StreamEndpoint->>NDJSONHandler: createNDJSONStream()
    NDJSONHandler->>NDJSONHandler: cancelState.reader = reader
    StreamEndpoint->>Client: Response (X-Request-Id header)

    par Stream Processing
        NDJSONHandler->>ChildProcess: reader.read()
        ChildProcess-->>NDJSONHandler: chunk
        NDJSONHandler->>Client: Stream events
    and Client Cancels
        Client->>CancelEndpoint: POST /api/claude/stream/cancel<br/>{requestId}
        CancelEndpoint->>Registry: cancelStream(requestId, userId)
        Registry->>Registry: Verify userId matches
        Registry->>NDJSONHandler: callback() → cancelState.requested = true
        Registry->>NDJSONHandler: cancelState.reader.cancel()
        Registry->>Registry: delete(requestId)
        Registry-->>CancelEndpoint: Success
        CancelEndpoint-->>Client: 200 OK
    end

    NDJSONHandler->>NDJSONHandler: Check cancelState.requested
    NDJSONHandler->>NDJSONHandler: Break from loop
    NDJSONHandler->>NDJSONHandler: onStreamComplete()
    NDJSONHandler->>Registry: unregisterCancellation(requestId)
    NDJSONHandler->>StreamEndpoint: unlockConversation()
    NDJSONHandler->>Client: Stream closes

    Note over Client,ChildProcess: PATH 2: Cancel by Conversation Key (Fallback)

    Client->>StreamEndpoint: POST /api/claude/stream
    StreamEndpoint->>Registry: registerCancellation(requestId, callback)

    Note over Client: User clicks Stop IMMEDIATELY<br/>(before X-Request-Id received)

    Client->>CancelEndpoint: POST /api/claude/stream/cancel<br/>{conversationId, workspace}
    CancelEndpoint->>CancelEndpoint: Build conversationKey
    CancelEndpoint->>Registry: findByConversationKey(convKey)
    Registry-->>CancelEndpoint: Found entry
    CancelEndpoint->>Registry: cancelStream(requestId, userId)
    Registry->>NDJSONHandler: callback() → cancel
    Registry-->>CancelEndpoint: Success
    CancelEndpoint-->>Client: 200 OK

    Note over NDJSONHandler: Same cleanup flow as Path 1
```

---

## 5. Credit Charging Flow Diagram

This diagram shows the async credit charging process and its potential failure modes.

```mermaid
stateDiagram-v2
    [*] --> MessageReceived: Assistant message with usage

    MessageReceived --> TokenSourceCheck: Check tokenSource

    TokenSourceCheck --> NoCharge: tokenSource = "user_provided"
    TokenSourceCheck --> CalculateTokens: tokenSource = "workspace"

    NoCharge --> [*]: Skip charging

    CalculateTokens --> ConvertToCredits: input_tokens * 1 + output_tokens * 3

    ConvertToCredits --> ApplyDiscount: Divide by 100

    ApplyDiscount --> ChargeWorkspace: Multiply by 0.5 (50% discount)

    ChargeWorkspace --> DBUpdate: UPDATE organizations SET credits = credits - amount

    DBUpdate --> ChargeSuccess: Rows updated
    DBUpdate --> ChargeFailed: Error (DB down, timeout, negative balance)

    ChargeSuccess --> [*]: Log success

    ChargeFailed --> LogError: console.error()

    LogError --> [*]: Stream continues (SILENT FAILURE)

    note right of ChargeWorkspace
        Fire-and-forget:
        .catch(() => console.error())

        Errors don't block stream
        BUT also don't surface!
    end note

    note right of ChargeFailed
        CRITICAL ISSUE:
        - No retry mechanism
        - No alerting
        - User gets free API usage
        - Revenue lost
    end note

    note right of DBUpdate
        RACE CONDITION:
        Multiple requests can
        charge concurrently,
        causing negative balance

        Need: Atomic debit with
        WHERE credits >= amount
    end note
```

---

## 6. Session Persistence Flow Diagram

This diagram shows how sessions are stored and retrieved across requests.

```mermaid
sequenceDiagram
    participant Client1 as Client (Request 1)
    participant Endpoint1 as Stream Endpoint
    participant SessionStore
    participant Supabase
    participant SDK1 as Claude SDK
    participant Client2 as Client (Request 2)
    participant SDK2 as Claude SDK

    Note over Client1,SDK2: FIRST REQUEST (New Conversation)

    Client1->>Endpoint1: POST /api/claude/stream<br/>{conversationId: "conv-123"}
    Endpoint1->>SessionStore: get("user1::workspace1::conv-123")
    SessionStore->>Supabase: SELECT sdk_session_id WHERE ...
    Supabase-->>SessionStore: null (not found)
    SessionStore-->>Endpoint1: null
    Endpoint1->>SDK1: Start new session (resume = null)
    SDK1->>SDK1: Generate session ID = "sess_abc"
    SDK1-->>Endpoint1: Event {type: "bridge_session", sessionId: "sess_abc"}
    Endpoint1->>SessionStore: set("user1::workspace1::conv-123", "sess_abc")
    SessionStore->>Supabase: UPSERT sessions (user_id, domain_id, conv_id, sdk_session_id)
    Supabase-->>SessionStore: Success
    SDK1-->>Endpoint1: Stream messages...
    Endpoint1-->>Client1: Stream response

    Note over Client1,SDK2: SECOND REQUEST (Resume Conversation)

    Client2->>Endpoint1: POST /api/claude/stream<br/>{conversationId: "conv-123"}
    Endpoint1->>SessionStore: get("user1::workspace1::conv-123")
    SessionStore->>SessionStore: Check cache for domain_id
    alt Cache hit
        SessionStore->>Supabase: SELECT sdk_session_id WHERE domain_id = (cached)
    else Cache miss
        SessionStore->>Supabase: SELECT domain_id FROM domains WHERE hostname = "workspace1"
        Supabase-->>SessionStore: domain_id = 456
        SessionStore->>SessionStore: Cache domain_id (TTL: 5 min)
        SessionStore->>Supabase: SELECT sdk_session_id WHERE domain_id = 456
    end
    Supabase-->>SessionStore: "sess_abc"
    SessionStore-->>Endpoint1: "sess_abc"
    Endpoint1->>SDK2: Resume session (resume = "sess_abc")
    SDK2->>SDK2: Load conversation context from session
    SDK2-->>Endpoint1: Stream messages (continued context)...
    Endpoint1-->>Client2: Stream response

    Note over SessionStore: CRITICAL ISSUE: In-memory cache<br/>can return stale session ID<br/>after restart (data loss)
```

---

## 7. Child Process Lifecycle Diagram

This diagram shows the privilege separation and process management.

```mermaid
stateDiagram-v2
    [*] --> ParentProcess: Stream endpoint (runs as root)

    ParentProcess --> GetWorkspaceOwner: statSync(workspacePath)

    GetWorkspaceOwner --> ValidateOwner: Check uid/gid

    ValidateOwner --> InvalidOwner: uid === 0 or gid === 0
    ValidateOwner --> SpawnChild: Valid workspace user

    InvalidOwner --> [*]: Throw error (refuse root)

    SpawnChild --> ChildInit: spawn(execPath, [runnerPath], {env})

    ChildInit --> DropPrivileges: TARGET_UID + TARGET_GID set

    DropPrivileges --> SetGID: process.setgid(gid)

    SetGID --> SetUID: Drop group privileges

    SetUID --> ChangeDir: Drop user privileges

    ChangeDir --> RunSDK: process.chdir(TARGET_CWD)

    RunSDK --> Streaming: Claude SDK starts

    Streaming --> StreamComplete: Normal completion
    Streaming --> StreamError: Error or crash
    Streaming --> StreamCancelled: Cancellation requested

    StreamComplete --> ChildExit: Exit code 0
    StreamError --> ChildExit: Exit code non-zero
    StreamCancelled --> ChildKill: SIGTERM sent

    ChildKill --> GracefulExit: Child exits within 5s
    ChildKill --> ForceKill: Timeout

    ForceKill --> ChildExit: SIGKILL sent
    GracefulExit --> ChildExit: Exit code received

    ChildExit --> ParentCleanup: Remove listeners

    ParentCleanup --> [*]: Child process cleaned up

    note right of DropPrivileges
        SECURITY-CRITICAL:
        Parent runs as root,
        child runs as workspace
        user (e.g., site-example-com)

        Ensures file operations
        respect ownership
    end note

    note right of ChildKill
        Graceful shutdown:
        1. SIGTERM
        2. Wait 5 seconds
        3. SIGKILL if not exited

        Prevents zombie processes
    end note
```

---

## 8. Error Handling Flow Chart

This diagram shows all error paths and their cleanup guarantees.

```mermaid
flowchart TD
    Start([Request Start]) --> Auth{Auth Valid?}

    Auth -->|No| Err401[Return 401]
    Auth -->|Yes| Schema{Schema Valid?}

    Err401 --> End([End])

    Schema -->|No| Err400[Return 400]
    Schema -->|Yes| WorkspaceAuth{Workspace<br/>Authorized?}

    Err400 --> End

    WorkspaceAuth -->|No| Err403[Return 403]
    WorkspaceAuth -->|Yes| Credits{Credits or<br/>API Key?}

    Err403 --> End

    Credits -->|No| Err402[Return 402]
    Credits -->|Yes| Lock{Lock<br/>Acquired?}

    Err402 --> End

    Lock -->|No| Err409[Return 409]
    Lock -->|Yes| MarkLocked[lockAcquired = true]

    Err409 --> End

    MarkLocked --> Session[Session Lookup]
    Session --> Registry[Register Cancellation]
    Registry --> Spawn{Spawn<br/>Success?}

    Spawn -->|No| SpawnError[Spawn Error]
    Spawn -->|Yes| Stream[Start Streaming]

    SpawnError --> Cleanup1[Cleanup: Unlock + Unregister]
    Cleanup1 --> Err500[Return 500]
    Err500 --> End

    Stream --> StreamLoop{Streaming...}

    StreamLoop -->|Cancel| Cancel[Detect cancelState.requested]
    StreamLoop -->|Error| StreamErr[Child crash or parse error]
    StreamLoop -->|Complete| Complete[Child exits normally]

    Cancel --> Finally[Finally Block]
    StreamErr --> CatchBlock[Catch Block]
    Complete --> Finally

    CatchBlock --> SendError[Send error event to client]
    SendError --> Finally

    Finally --> CloseStream[controller.close]
    CloseStream --> CheckCleanup{cleanupCalled?}

    CheckCleanup -->|No| Cleanup2[onStreamComplete:<br/>Unlock + Unregister]
    CheckCleanup -->|Yes| End

    Cleanup2 --> SetFlag[cleanupCalled = true]
    SetFlag --> End

    style MarkLocked fill:#ff9
    style Finally fill:#9f9
    style Cleanup1 fill:#9f9
    style Cleanup2 fill:#9f9

    style Err401 fill:#f99
    style Err400 fill:#f99
    style Err403 fill:#f99
    style Err402 fill:#f99
    style Err409 fill:#f99
    style Err500 fill:#f99
```

---

## 9. Lock Acquisition Race Condition Analysis

This diagram shows the TOCTOU (Time-of-Check to Time-of-Use) race window.

```mermaid
sequenceDiagram
    participant Req1 as Request 1
    participant Req2 as Request 2
    participant Map as conversationLockTimestamps
    participant Set as activeConversations

    Note over Req1,Set: Both requests for same conversation arrive

    Req1->>Map: get(key)
    Map-->>Req1: undefined (no lock)

    Req2->>Map: get(key)
    Map-->>Req2: undefined (no lock)

    Note over Req1,Req2: RACE WINDOW (original)

    Req1->>Map: has(key) [double-check]
    Map-->>Req1: false

    Req2->>Map: has(key) [double-check]
    Map-->>Req2: false

    Note over Req1,Req2: RACE WINDOW (reduced)

    Req1->>Map: set(key, timestamp1)
    Req1->>Set: add(key)

    Req2->>Map: set(key, timestamp2) [OVERWRITES!]
    Req2->>Set: add(key) [Idempotent]

    Note over Req1,Req2: BOTH THINK THEY ACQUIRED LOCK!

    Req1->>Req1: Proceed with streaming
    Req2->>Req2: Proceed with streaming

    Note over Req1,Set: Result: Concurrent streams for same conversation

    rect rgb(255, 200, 200)
        Note over Req1,Set: CRITICAL: This is NOT safe!<br/>Need atomic primitives<br/>(Redis SETNX or DB advisory lock)
    end
```

---

## 10. Component Interaction Overview

This diagram shows how all major components interact.

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[Browser Client]
    end

    subgraph "API Layer"
        StreamAPI[Stream Endpoint<br/>/api/claude/stream]
        CancelAPI[Cancel Endpoint<br/>/api/claude/stream/cancel]
    end

    subgraph "Security Layer"
        Auth[Authentication<br/>getCookieUserId]
        WorkspaceAuth[Workspace Authorization<br/>verifyWorkspaceAccess]
        PathValidation[Path Validation<br/>isPathWithinWorkspace]
    end

    subgraph "Orchestration Layer"
        Lock[Conversation Locking<br/>tryLockConversation]
        Session[Session Store<br/>sessionStore]
        Registry[Cancellation Registry<br/>registerCancellation]
        Credits[Credit Manager<br/>chargeTokensForMessage]
    end

    subgraph "Execution Layer"
        Runner[Agent Child Runner<br/>runAgentChild]
        NDJSONHandler[NDJSON Stream Handler<br/>createNDJSONStream]
    end

    subgraph "SDK Layer"
        ChildProcess[Child Process<br/>Workspace User UID/GID]
        SDK[Claude Agent SDK<br/>query/streaming]
    end

    subgraph "Storage Layer"
        Supabase[(Supabase)]
        SupabaseIAM[(Supabase IAM<br/>sessions table)]
        SupabaseApp[(Supabase App<br/>domains, organizations)]
    end

    Browser -->|POST /api/claude/stream| StreamAPI
    Browser -->|POST /api/claude/stream/cancel| CancelAPI

    StreamAPI --> Auth
    CancelAPI --> Auth

    Auth -->|Verify session| Supabase

    StreamAPI --> WorkspaceAuth
    WorkspaceAuth -->|Check ownership| SupabaseApp

    StreamAPI --> Lock
    Lock -->|Check/set lock| Lock

    StreamAPI --> Session
    Session -->|Get/set session ID| SupabaseIAM

    StreamAPI --> Registry
    CancelAPI --> Registry

    StreamAPI --> Runner
    Runner --> PathValidation
    Runner --> ChildProcess

    ChildProcess --> SDK
    SDK -->|File operations| PathValidation

    Runner --> NDJSONHandler
    NDJSONHandler --> Session
    NDJSONHandler --> Credits

    Credits -->|UPDATE credits| SupabaseApp

    NDJSONHandler -->|Stream events| Browser

    Registry -->|Cancel callback| NDJSONHandler

    style Auth fill:#e1f5ff
    style WorkspaceAuth fill:#e1f5ff
    style PathValidation fill:#e1f5ff

    style Lock fill:#fff4e1
    style Registry fill:#fff4e1

    style ChildProcess fill:#f0e1ff
    style SDK fill:#f0e1ff

    style Supabase fill:#e1ffe1
    style SupabaseIAM fill:#e1ffe1
    style SupabaseApp fill:#e1ffe1
```

---

## 11. State Ownership Map

This diagram shows which component owns which state.

```mermaid
mindmap
  root((State Ownership))
    Client State
      conversationId
      Current message
      Tool use tracking map
      UI rendering state
    Stream Endpoint State
      requestId UUID
      lockAcquired boolean
      Effective model
      Token source
    NDJSON Handler State
      cancelState object
        requested boolean
        reader reference
      buffer string
      cleanupCalled boolean
    Conversation Locking State
      activeConversations Set
      conversationLockTimestamps Map
    Cancellation Registry State
      registry Map
        requestId → CancelEntry
      CancelEntry
        cancel callback
        userId string
        conversationKey string
        createdAt number
    Session Store State
      IN-MEMORY Map CRITICAL ISSUE
        conversationKey → sessionId
      Domain cache Map
        hostname → domain_id
    Child Process State
      Process handle
      stdin/stdout/stderr streams
      Event listeners
      killTimeoutId
      cleaned boolean
    SDK State OPAQUE TO US
      Session ID string
      Conversation context
      Tool state
      Token usage accumulator
    Database State
      iam sessions table
        user_id workspace conversation_id sdk_session_id
      app domains table
        hostname port
      app organizations table
        workspace_name credits
```

---

## Summary

These diagrams illustrate:

1. **Main Request State Machine**: Complete lifecycle with all transitions
2. **Conversation Locking**: Lock acquisition with TOCTOU race analysis
3. **NDJSON Stream Processing**: Core streaming loop with cancellation checks
4. **Cancellation Flow**: Two-path cancellation with timing
5. **Credit Charging**: Async charging with failure modes
6. **Session Persistence**: Storage and retrieval across requests
7. **Child Process Lifecycle**: Privilege separation and cleanup
8. **Error Handling**: All error paths with cleanup guarantees
9. **Lock Race Condition**: TOCTOU window visualization
10. **Component Interaction**: High-level architecture overview
11. **State Ownership**: Which component owns which state

**Key Insights from Diagrams**:

- ✅ **Multiple cleanup guarantees**: try/finally + cleanup flags prevent leaks
- ❌ **Lock race condition**: Double-check pattern reduces but doesn't eliminate TOCTOU
- ❌ **Credit charging can fail silently**: Fire-and-forget with no retry
- ✅ **Two cancellation paths**: Robust cancellation even during initialization
- ⚠️ **Complex state ownership**: Many components share state (works for single-process only)

These diagrams should be used alongside the analysis document for a complete understanding of the streaming architecture.
