# Fase 1.1 — Current Architecture Analysis

## How Claude Code runs in Alive today

### Worker Entry (`worker-entry.mjs`)
The worker is a long-running Node.js process that:
1. Imports `@anthropic-ai/claude-agent-sdk` at top level (before privilege drop)
2. Connects to parent via Unix socket IPC (NDJSON protocol)
3. Drops privileges to workspace user (UID/GID)
4. Handles queries by calling `query()` from the SDK
5. Streams messages back to parent via IPC

### Key SDK integration points:
```
import { query } from "@anthropic-ai/claude-agent-sdk"
```

The `query()` function is called with:
- `prompt` — user message
- `options`:
  - `cwd` — workspace directory
  - `model` — model name
  - `maxTurns` — max agent turns
  - `permissionMode` — "bypassPermissions" | other
  - `allowedTools` / `disallowedTools` — tool lists
  - `canUseTool` — custom permission callback
  - `settingSources` — config sources
  - `mcpServers` — MCP server definitions (internal + OAuth + global)
  - `systemPrompt` — system prompt override
  - `resume` — session ID to resume
  - `resumeSessionAt` — message to resume at
  - `abortSignal` — cancellation
  - `stderr` — stderr capture callback
  - `strictMcpConfig` — enforce MCP config

### Message types from SDK stream:
- `system` (subtype: `init`) — session start, tools list, MCP status
- `assistant` — model responses
- `tool_use` / `tool_result` — tool calls
- `result` (subtype: `success` | `error_during_execution`) — query complete

### Session management:
- Sessions persist in `/var/lib/claude-sessions/<workspace>/`
- HOME is set per workspace for session isolation
- `CLAUDE_CONFIG_DIR` points to shared credentials at `/root/.claude`
- Resume via session ID

### MCP servers:
- `alive-workspace` — internal SDK MCP (file/workspace operations)
- `alive-tools` — internal SDK MCP (Alive-specific tools)
- `alive-email` — optional, loaded when extraTools references it
- Global HTTP MCP servers from `GLOBAL_MCP_PROVIDERS`
- OAuth MCP servers (user-connected, passed via IPC)

### Parent IPC protocol (worker → parent):
- `{ type: "ready" }` — worker initialized
- `{ type: "session", requestId, sessionId }` — new session
- `{ type: "message", requestId, content }` — stream message
- `{ type: "complete", requestId, result }` — query done
- `{ type: "error", requestId, error, diagnostics }` — query failed
- `{ type: "shutdown_ack" }` — clean shutdown
- `{ type: "health_ok", uptime, queriesProcessed }` — health response

### Parent IPC protocol (parent → worker):
- `{ type: "query", requestId, payload }` — start query
- `{ type: "cancel", requestId }` — abort query
- `{ type: "shutdown", graceful }` — shutdown
- `{ type: "health_check" }` — ping

## What's Claude-specific vs generic

### Claude-specific (needs abstraction):
1. `import { query } from "@anthropic-ai/claude-agent-sdk"` — the SDK itself
2. `query()` call signature and options
3. Message stream format (system/init, result subtypes)
4. Session management (resume, session cookies)
5. MCP server format (SDK-specific `createSdkMcpServer`)
6. Tool permission callback signature (`canUseTool`)
7. `CLAUDE_CONFIG_DIR` and credentials handling
8. Orphan reaping (`claude-agent-sdk/cli.js` check in manager.ts)

### Already generic (can reuse):
1. IPC protocol — message types are generic enough
2. Worker pool management — spawn, health check, shutdown
3. Privilege dropping — UID/GID/CWD isolation
4. Stream types (SESSION, MESSAGE, COMPLETE, ERROR) — defined externally
5. OAuth token passing
6. Workspace isolation

## Conclusion
The abstraction boundary is clear: everything inside `handleQuery()` needs a provider adapter. Everything outside (IPC, pool management, privilege drop) stays the same.
