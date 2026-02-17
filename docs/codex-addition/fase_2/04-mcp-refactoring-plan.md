# Fase 2.4 — MCP Server Refactoring Plan

## Problem

Alive's internal MCP servers (`alive-tools`, `alive-workspace`) use `createSdkMcpServer()` from `@anthropic-ai/claude-agent-sdk`. This creates in-process function objects — not real MCP servers. They can't be used by Codex (or any other provider) because Codex needs stdio or HTTP MCP servers.

## Current State

```
packages/tools/src/mcp-server.ts
  └── import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"
  └── export const toolsInternalMcp = createSdkMcpServer({ name: "alive-tools", tools: [...] })
  └── export const workspaceInternalMcp = createSdkMcpServer({ name: "alive-workspace", tools: [...] })
```

These are imported directly in `worker-entry.mjs` and passed to `query()` as `mcpServers`.

The Claude SDK's `createSdkMcpServer()` returns an opaque object with tool handlers that run in-process. There's no serialization boundary — tools execute in the same V8 isolate as the agent.

## Target State

Each internal MCP server becomes a standalone Node.js process that speaks stdio JSON-RPC (standard MCP transport):

```
packages/mcp-servers/
  ├── alive-tools/
  │   ├── src/index.ts        # stdio MCP server entry point
  │   └── package.json
  ├── alive-workspace/
  │   ├── src/index.ts
  │   └── package.json
  └── alive-email/
      ├── src/index.ts
      └── package.json
```

Worker spawns these as child processes and passes paths to both Claude and Codex:

```typescript
// For Claude:
mcpServers: {
  "alive-tools": { command: ["node", "/path/to/alive-tools/dist/index.js"] }
}

// For Codex (via config):
config: {
  mcp_servers: {
    "alive-tools": { command: ["node", "/path/to/alive-tools/dist/index.js"] }
  }
}
```

## Implementation Steps

### Step 1: Create `@modelcontextprotocol/sdk`-based MCP servers

Use the official MCP SDK (`@modelcontextprotocol/sdk`) to create proper stdio servers:

```typescript
// packages/mcp-servers/alive-tools/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "alive-tools",
  version: "1.0.0",
});

// Register each tool
server.tool("search_tools", { /* zod schema */ }, async (args) => {
  // ... tool implementation (same logic as current)
  return { content: [{ type: "text", text: result }] };
});

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Step 2: Migrate tool implementations

Each tool in `packages/tools/src/tools/` needs minimal changes:
- Current: tool returns `{ content: string }` via `createSdkMcpServer` handler
- New: tool returns `{ content: [{ type: "text", text: string }] }` via MCP SDK handler

The actual tool logic (file ops, DB queries, etc.) stays identical.

### Step 3: Context passing

Internal MCP servers need workspace context (workspace ID, user ID, paths). Options:

**Option A: Environment variables** (recommended)
```typescript
// Worker spawns MCP server with context as env vars
spawn("node", ["alive-tools/dist/index.js"], {
  env: {
    WORKSPACE_ID: payload.workspaceId,
    WORKSPACE_DIR: payload.cwd,
    USER_ID: payload.userId,
    ...
  }
})
```

**Option B: Init message**
MCP protocol supports an `initialize` handshake. Could pass context there.

**Option C: CLI args**
Pass context as command-line arguments.

Env vars are simplest and most compatible with both Claude and Codex config formats.

### Step 4: Update worker-entry.mjs

```diff
- import { toolsInternalMcp, workspaceInternalMcp } from "@webalive/tools"
+ // MCP servers are now standalone processes
+ const MCP_SERVER_PATHS = {
+   "alive-tools": path.resolve(__dirname, "../mcp-servers/alive-tools/dist/index.js"),
+   "alive-workspace": path.resolve(__dirname, "../mcp-servers/alive-workspace/dist/index.js"),
+ }
```

### Step 5: Claude SDK compatibility

Claude SDK supports external MCP servers via command config:
```typescript
mcpServers: {
  "alive-tools": {
    command: "node",
    args: ["/path/to/alive-tools/dist/index.js"],
    env: { WORKSPACE_ID: "..." }
  }
}
```

Verify this works with `query()` — the SDK should spawn the process and communicate via stdio, same as Codex does.

## Migration Risk

### Low risk
- Tool logic unchanged
- MCP protocol is standardized
- Both SDKs support stdio MCP servers

### Medium risk
- **Performance**: In-process function calls → IPC via stdio adds latency (~1-5ms per tool call)
- **Process lifecycle**: Must manage MCP server child process lifecycle (spawn on query start, kill on query end)
- **Error handling**: Stdio communication can fail (broken pipe, process crash)

### Mitigation
- Keep `createSdkMcpServer` as fallback for Claude-only mode during transition
- Feature flag: `USE_STANDALONE_MCP=true` to toggle
- Benchmark latency before/after

## Global & OAuth MCP Servers — No Changes Needed

Global HTTP MCP servers (`context7`, `google-scraper`, `ocr`) are already URL-based. Both Claude and Codex can connect to them:

```typescript
// Claude: via mcpServers option
{ url: "http://localhost:8082/mcp" }

// Codex: via config.mcp_servers
{ url: "http://localhost:8082/mcp" }
```

OAuth MCP servers (Stripe, Linear, GitHub, etc.) are also HTTP-based. Pass bearer tokens via:
- Claude: `headers: { Authorization: "Bearer ..." }`
- Codex: `bearer_token_env_var: "STRIPE_TOKEN"` (requires setting env var)

## Dependencies

- `@modelcontextprotocol/sdk` — already a devDependency of `@openai/codex-sdk`, so it's compatible
- No new external dependencies needed

## Estimated Effort

| Task | Time |
|------|------|
| Create MCP server scaffolding | 2h |
| Migrate alive-tools (10 tools) | 4h |
| Migrate alive-workspace (6 tools) | 3h |
| Migrate alive-email (2 tools) | 1h |
| Update worker-entry.mjs | 2h |
| Testing | 4h |
| **Total** | **~16h** |

This is the critical path item. Everything else (provider abstraction, frontend, DB) can proceed in parallel, but multi-provider support is blocked until MCP servers are standalone.
