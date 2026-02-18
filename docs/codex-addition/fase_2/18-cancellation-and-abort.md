# Fase 2.18 — Cancellation & Abort Flow

## Problem

Alive needs to cancel running agent queries (user clicks stop, workspace deleted, timeout). Each provider handles this differently.

## Claude

```typescript
// Claude SDK uses session.abort()
const agentQuery = query({ ... });
// To cancel:
agentQuery.abort(); // or via AbortController
```

Claude's `query()` returns an async iterable. Cancellation is handled by breaking out of the iteration loop + calling abort.

## Codex

```typescript
// Codex SDK uses AbortSignal in TurnOptions
const signal = AbortSignal.abort(); // or from AbortController
const result = await thread.runStreamed(input, { signal });
```

Codex passes `signal` to the CLI subprocess, which handles SIGTERM gracefully.

## Unified Interface

The `AgentSession` interface (fase_2/01) needs:

```typescript
interface AgentSession {
  run(prompt: string): AsyncIterable<AgentEvent>;
  abort(): void;  // <-- Must be provider-agnostic
}
```

### Implementation

```typescript
class ClaudeSession implements AgentSession {
  private queryHandle: ReturnType<typeof query>;
  
  abort() {
    this.queryHandle?.abort();
  }
}

class CodexSession implements AgentSession {
  private abortController = new AbortController();
  
  async *run(prompt: string): AsyncIterable<AgentEvent> {
    const { events } = await this.thread.runStreamed(prompt, {
      signal: this.abortController.signal
    });
    for await (const event of events) {
      yield this.normalize(event);
    }
  }
  
  abort() {
    this.abortController.abort();
  }
}
```

### Current Alive Abort Flow

In `worker-entry.mjs`, abort happens when:
1. Parent sends `{ type: "cancel" }` via IPC
2. Worker breaks out of message iteration loop
3. Claude session is garbage collected

The refactored worker should:
1. Receive cancel IPC → call `session.abort()`
2. The async iterator will throw/complete
3. Worker sends `{ type: "cancelled" }` back

### Edge Cases

- **Codex subprocess cleanup**: When aborted, Codex CLI subprocess must be killed. The SDK handles this via signal propagation, but verify no zombie processes remain.
- **MCP server cleanup**: If abort happens mid-MCP-call, the MCP server subprocess may be left running. Both SDKs should handle this, but test explicitly.
- **Partial results**: On abort, any items already emitted should still be stored (partial work is valuable). Don't discard the message buffer on cancel.
