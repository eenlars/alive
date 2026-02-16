# Fase 1.4 — OpenClaw / Pi AI Reference

## How OpenClaw solves multi-provider

OpenClaw doesn't build its own abstraction. It uses **Pi AI** (`@mariozechner/pi-ai`) — a multi-provider LLM framework that already supports:

### Known APIs (from pi-ai types):
- `openai-completions`
- `openai-responses`
- `azure-openai-responses`
- `openai-codex-responses` ← Codex already supported!
- `anthropic-messages`
- `bedrock-converse-stream`
- `google-generative-ai`
- `google-gemini-cli`
- `google-vertex`

### Core Pattern: ApiProvider registry
```typescript
interface ApiProvider<TApi extends Api, TOptions extends StreamOptions> {
  stream(model: Model<TApi>, context: Context, options?: TOptions): AssistantMessageEventStream
}

registerApiProvider(provider)  // register a new provider
getApiProvider(api)            // get provider for an API type
```

Every provider implements `stream()` which returns a normalized `AssistantMessageEventStream`. This is the unified event format — regardless of whether the backend is Anthropic, OpenAI, or Google.

### Model Resolution in OpenClaw:
```typescript
resolveSessionModelRef(cfg, entry, agentId) → { provider: string, model: string }
```
- Default: `anthropic` / `claude-opus-4-6`
- Per-session overrides via `providerOverride` / `modelOverride`
- Auth profiles per provider

### Auth:
- Auth profile store per agent (`auth-profiles.json`)
- OAuth support: Anthropic, OpenAI Codex, Google Gemini CLI, Google Antigravity, GitHub Copilot
- API key fallback via env vars
- Per-provider credential management

### Session Management:
- `SessionManager` from `@mariozechner/pi-coding-agent`
- Handles transcripts, message history, compaction
- Provider-agnostic — sessions work with any provider

### Tools/MCP:
- Built into Pi AI's Context system
- Tools are provider-agnostic
- MCP servers managed at the framework level

## Key Insight for Alive

**OpenClaw already supports Codex via `openai-codex-responses` API type in Pi AI.**

The question for Alive isn't "how do we add Codex" — it's:
1. Do we use Pi AI (or similar) as our abstraction layer?
2. Or do we build our own `AgentProvider` interface following the same pattern?

### Option 1: Use Pi AI directly
- Pros: Already works, tested, maintained, supports many providers
- Cons: Dependency on external library, may not fit Alive's worker architecture

### Option 2: Build similar pattern
- Pros: Full control, fits Alive's existing worker-pool model
- Cons: More work, reinventing what exists

### Option 3: Adapt Alive's worker to use Pi AI's streaming
- Current worker uses `@anthropic-ai/claude-agent-sdk` directly
- Could replace with Pi AI's `stream()` which already normalizes Claude/Codex/etc.
- Worker remains the same, just swaps the SDK layer

## Recommendation
**Option 3 is the most pragmatic.** Replace `@anthropic-ai/claude-agent-sdk` with Pi AI's provider system in the worker. This gives multi-provider support with minimal architecture changes.

But this needs investigation: does Pi AI's `stream()` support all the features Alive uses?
- [ ] MCP server passthrough
- [ ] Custom tool permissions
- [ ] Session resume
- [ ] System prompt injection
- [ ] Abort signal
- [ ] Permission modes

If Pi AI supports all of these, the migration path is straightforward.
