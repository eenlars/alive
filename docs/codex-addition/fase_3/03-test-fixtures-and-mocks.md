# Fase 3.3 — Test Fixtures and Mocks

## Mock Strategy

Both providers spawn external processes (Claude: in-process SDK, Codex: CLI subprocess). For unit tests, we mock at the provider boundary — NOT at the SDK level.

### Mock Provider

```typescript
// packages/worker-pool/tests/mocks/mock-provider.ts
export class MockProvider implements AgentProvider {
  readonly name = "mock"
  private events: AgentEvent[]

  constructor(events: AgentEvent[]) {
    this.events = events
  }

  async *query(config: AgentProviderConfig): AsyncIterable<AgentEvent> {
    for (const event of this.events) {
      yield event
      await new Promise(r => setTimeout(r, 10)) // simulate async
    }
  }
}
```

### Codex JSONL Fixtures

Record real Codex CLI output and replay in tests:

```typescript
// packages/worker-pool/tests/fixtures/codex-simple-response.jsonl
{"type":"thread.started","thread_id":"th_abc123"}
{"type":"turn.started"}
{"type":"item.started","item":{"id":"msg_1","type":"agent_message","text":""}}
{"type":"item.updated","item":{"id":"msg_1","type":"agent_message","text":"Hello"}}
{"type":"item.completed","item":{"id":"msg_1","type":"agent_message","text":"Hello! How can I help?"}}
{"type":"turn.completed","usage":{"input_tokens":150,"cached_input_tokens":0,"output_tokens":12}}
```

```typescript
// packages/worker-pool/tests/fixtures/codex-tool-use.jsonl
{"type":"thread.started","thread_id":"th_def456"}
{"type":"turn.started"}
{"type":"item.started","item":{"id":"cmd_1","type":"command_execution","command":"ls -la","aggregated_output":"","status":"in_progress"}}
{"type":"item.completed","item":{"id":"cmd_1","type":"command_execution","command":"ls -la","aggregated_output":"total 8\ndrwxr-xr-x 2 user user 4096 Feb 17 10:00 .\n","exit_code":0,"status":"completed"}}
{"type":"item.started","item":{"id":"msg_2","type":"agent_message","text":""}}
{"type":"item.completed","item":{"id":"msg_2","type":"agent_message","text":"The directory contains..."}}
{"type":"turn.completed","usage":{"input_tokens":300,"cached_input_tokens":50,"output_tokens":45}}
```

```typescript
// packages/worker-pool/tests/fixtures/codex-mcp-tool-call.jsonl
{"type":"thread.started","thread_id":"th_ghi789"}
{"type":"turn.started"}
{"type":"item.started","item":{"id":"mcp_1","type":"mcp_tool_call","server":"alive-workspace","tool":"read_file","arguments":{"path":"src/index.ts"},"status":"in_progress"}}
{"type":"item.completed","item":{"id":"mcp_1","type":"mcp_tool_call","server":"alive-workspace","tool":"read_file","arguments":{"path":"src/index.ts"},"result":{"content":[{"type":"text","text":"export const main = () => {}"}],"structured_content":null},"status":"completed"}}
{"type":"item.started","item":{"id":"msg_3","type":"agent_message","text":""}}
{"type":"item.completed","item":{"id":"msg_3","type":"agent_message","text":"I can see the index file..."}}
{"type":"turn.completed","usage":{"input_tokens":500,"cached_input_tokens":100,"output_tokens":30}}
```

### CodexExec Spy (from SDK tests)

The Codex SDK repo has `tests/codexExecSpy.ts` — a mock that replaces the real exec with a spy. We can adapt this pattern:

```typescript
// Intercept at the Codex constructor level:
const mockCodex = {
  startThread: (opts) => ({
    runStreamed: async (input) => ({
      events: readFixture("codex-simple-response.jsonl")
    })
  })
}
```

### Claude Fixture Format

For parity, create Claude message fixtures too:

```typescript
// packages/worker-pool/tests/fixtures/claude-simple-response.json
[
  {"type":"system","subtype":"init","sessionId":"sess_123","tools":[],"mcp":{}},
  {"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello!"}]}},
  {"type":"result","subtype":"success","costUsd":0.001,"usage":{"input_tokens":100,"output_tokens":10}}
]
```

## Integration Test Setup

For integration tests that hit real APIs:

```typescript
// packages/worker-pool/tests/setup-integration.ts
const SKIP_INTEGRATION = !process.env.RUN_INTEGRATION_TESTS

export function describeIntegration(name: string, fn: () => void) {
  if (SKIP_INTEGRATION) {
    describe.skip(`[integration] ${name}`, fn)
  } else {
    describe(`[integration] ${name}`, fn)
  }
}

// Required env vars for integration:
// ANTHROPIC_API_KEY — for Claude tests
// CODEX_API_KEY or OPENAI_API_KEY — for Codex tests
```

## Event Mapping Tests (most important)

These are pure unit tests — no mocking needed, just function calls:

```typescript
describe("mapCodexEvent", () => {
  const fixtures = loadJsonlFixture("codex-tool-use.jsonl")

  it("maps all events without throwing", () => {
    for (const event of fixtures) {
      expect(() => mapCodexEvent(event)).not.toThrow()
    }
  })

  it("produces exactly one session event", () => {
    const mapped = fixtures.map(mapCodexEvent)
    expect(mapped.filter(e => e.type === "session")).toHaveLength(1)
  })

  it("produces exactly one complete event", () => {
    const mapped = fixtures.map(mapCodexEvent)
    expect(mapped.filter(e => e.type === "complete")).toHaveLength(1)
  })

  it("preserves raw event in content", () => {
    const mapped = fixtures.map(mapCodexEvent)
    const messages = mapped.filter(e => e.type === "message")
    for (const msg of messages) {
      expect(msg.content.raw).toBeDefined()
    }
  })
})
```
