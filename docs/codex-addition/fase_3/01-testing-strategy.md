# Fase 3.1 — Testing & Rollout Strategy

## Testing Levels

### 1. Unit Tests: Provider Adapters

Test event mapping in isolation (no SDK calls):

```typescript
// tests/providers/claude-provider.test.ts
describe("ClaudeProvider event mapping", () => {
  it("maps system/init to session event", () => {
    const event = mapClaudeMessage({ type: "system", subtype: "init", sessionId: "abc" })
    expect(event.type).toBe("session")
    expect(event.sessionId).toBe("abc")
  })
  
  it("maps result/success to complete event", () => {
    const event = mapClaudeMessage({ type: "result", subtype: "success" })
    expect(event.type).toBe("complete")
    expect(event.result.success).toBe(true)
  })
})

// tests/providers/codex-provider.test.ts
describe("CodexProvider event mapping", () => {
  it("maps thread.started to session event", () => {
    const event = mapCodexEvent({ type: "thread.started", thread_id: "xyz" })
    expect(event.type).toBe("session")
    expect(event.sessionId).toBe("xyz")
  })
  
  it("maps turn.completed to complete event with usage", () => {
    const event = mapCodexEvent({
      type: "turn.completed",
      usage: { input_tokens: 100, output_tokens: 50, cached_input_tokens: 20 }
    })
    expect(event.type).toBe("complete")
    expect(event.result.usage.inputTokens).toBe(100)
  })
  
  it("maps command_execution item to tool_use message", () => {
    const event = mapCodexEvent({
      type: "item.completed",
      item: { type: "command_execution", command: "ls -la", status: "completed" }
    })
    expect(event.content.kind).toBe("tool_use")
  })
})
```

### 2. Integration Tests: SDK Communication

Test actual SDK calls against real APIs (needs API keys):

```typescript
// tests/integration/codex-provider.integration.test.ts
describe("CodexProvider integration", () => {
  it("can start a thread and get a response", async () => {
    const provider = new CodexProvider()
    const events: AgentEvent[] = []
    
    for await (const event of provider.query({
      provider: "codex",
      prompt: "What is 2+2? Reply with just the number.",
      cwd: "/tmp/test-workspace",
      model: "gpt-5.1",
      signal: AbortSignal.timeout(30_000),
      // ... minimal config
    })) {
      events.push(event)
    }
    
    expect(events.some(e => e.type === "session")).toBe(true)
    expect(events.some(e => e.type === "complete")).toBe(true)
  })
})
```

### 3. E2E Tests: Full Worker Flow

Test the complete path: IPC → worker → provider → IPC response:

```typescript
// tests/e2e/worker-codex.test.ts
describe("Worker with Codex provider", () => {
  it("processes a query via Codex and returns IPC messages", async () => {
    // Spawn worker process
    // Send IPC query with provider: "codex"
    // Collect IPC responses
    // Assert session, message, complete events
  })
})
```

### 4. Manual Testing Checklist

Before any release:

- [ ] Claude provider still works identically (regression)
- [ ] Codex provider returns text responses
- [ ] Codex provider handles tool use (file edits)
- [ ] Codex provider handles MCP tool calls
- [ ] Session resume works for both providers
- [ ] Abort/cancel works for both providers
- [ ] Error handling works (bad API key, network error, timeout)
- [ ] Frontend renders Codex messages correctly
- [ ] Provider switch in workspace settings works
- [ ] API key entry/storage/deletion works
- [ ] Model selector shows correct models per provider

## Rollout Strategy

### Phase 1: Internal Only (Week 1)
- Deploy to staging
- Test with superadmin workspaces only
- Feature flag: `ENABLE_CODEX_PROVIDER=true` (env var)
- No UI changes visible to users

### Phase 2: Opt-In Beta (Week 2)
- Add provider selector to workspace settings (behind flag)
- Enable for users who request it
- Monitor error rates, latency, token usage

### Phase 3: General Availability (Week 3+)
- Remove feature flag
- Provider selector visible to all users
- Documentation / changelog

## Feature Flags

```typescript
// Simple env-based feature flag
const CODEX_ENABLED = process.env.ENABLE_CODEX_PROVIDER === "true"

// In workspace settings API:
if (!CODEX_ENABLED && provider === "codex") {
  return { error: "Codex provider is not yet available" }
}

// In frontend:
const showProviderSelector = CODEX_ENABLED
```

## Monitoring

Track per-provider metrics:
- Query success/failure rate
- Average query duration
- Token usage (input/output/cached)
- Error types (auth, timeout, SDK, unknown)
- MCP connection success rate

## Rollback Plan

If Codex provider has issues:
1. Set `ENABLE_CODEX_PROVIDER=false`
2. Existing Codex workspaces fall back to Claude (with user notification)
3. No data loss — workspace settings preserved, just provider selection ignored
