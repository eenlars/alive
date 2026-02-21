# ADR: Multi-Provider Architecture for Alive

## Status: ACCEPTED (Planning Complete)

## Context

Alive currently supports only Claude Code as its coding agent. Users want access to OpenAI's Codex. Future providers (Gemini, etc.) are likely. We need an architecture that supports multiple providers without rewriting the system for each new one.

## Decision

### 1. Provider abstraction via AsyncGenerator interface

Each provider implements:
```typescript
interface AgentProvider {
  query(options: QueryOptions): AsyncGenerator<AgentEvent>
  abort(): void
}
```

**Why**: Streaming is the natural paradigm for both Claude and Codex. AsyncGenerator gives us backpressure, cancellation, and composability.

**Rejected alternative**: Callback-based event emitters — harder to test, no backpressure.

### 2. Claude-compatible message format for v1 (no unified events)

CodexProvider translates Codex events into Claude message shapes. Frontend unchanged.

**Why**: Cuts 12h of frontend work. Lets us ship faster. Unified events can come in v2.

**Rejected alternative**: Unified `AgentEvent` format from day 1 — too much scope for v1.

### 3. Stdio MCP servers (not in-process)

Migrate from `createSdkMcpServer()` to standalone stdio MCP server processes.

**Why**: Both Claude SDK and Codex require stdio MCP servers. In-process was a Claude-only convenience. This is the only approach that works for both.

**Rejected alternative**: HTTP MCP servers — unnecessary complexity, both SDKs handle stdio natively.

### 4. Project-level config.toml for Codex configuration

Write `.codex/config.toml` per workspace with MCP server definitions and `developer_instructions`.

**Why**: Most reliable configuration mechanism. Codex reads it automatically. No complex CLI flag serialization.

**Rejected alternative**: SDK `config` option with `--config` flags — uncertain support for nested structures.

### 5. Server-side API keys only (no user-supplied keys)

Single Codex API key managed server-side, like Claude.

**Why**: Consistent auth model. Simpler billing. No key management UI needed.

**Rejected alternative**: Per-user keys — adds key management, validation, billing complexity.

### 6. `danger-full-access` sandbox mode for v1

Disable Codex's Linux seccomp sandbox.

**Why**: Potential conflicts with Alive's container networking and Node.js MCP servers. Alive already has its own UID/GID isolation. Codex sandbox can be evaluated for v2.

**Rejected alternative**: `read-only` or `workspace-write` — risk of MCP server failures in sandbox.

## Consequences

### Positive
- Ship in ~30h (3 weeks part-time)
- Zero frontend changes for v1
- Claude continues working exactly as before
- Clean path to v2 unified events

### Negative
- CodexProvider must maintain Claude-format translation layer (temporary)
- Codex features (reasoning effort, web search, structured output) not exposed in v1
- `danger-full-access` means Codex runs without its own sandbox (mitigated by Alive's isolation)

### Risks
- See fase_2/33-risk-register.md
