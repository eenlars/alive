# Fase 1.5 — Codex MCP Support (Deep Dive)

## Summary: Codex has FULL MCP support

Codex supports MCP in two directions:
1. **Codex AS an MCP server** — `codex mcp-server` exposes Codex's agent as an MCP server
2. **Codex USING MCP servers** — Codex can connect to external MCP servers as tools

Both are critical for Alive integration.

## 1. Codex Using External MCP Servers

### Configuration via `config.toml`

MCP servers are configured in `~/.codex/config.toml` under `[mcp_servers]`:

```toml
model = "gpt-5.1"

[mcp_servers.my-server]
command = ["node", "/path/to/server.js"]
env = { API_KEY = "..." }

[mcp_servers.remote-server]
url = "https://mcp.example.com/sse"
bearer_token_env_var = "MCP_TOKEN"
```

### CLI Management (`codex mcp` subcommand)

```bash
# Add stdio server
codex mcp add my-server -- node /path/to/server.js

# Add HTTP/SSE server
codex mcp add remote-server --url https://mcp.example.com/sse

# With env vars
codex mcp add my-server --env API_KEY=secret -- node server.js

# OAuth login for MCP servers
codex mcp login my-server --scopes read,write

# List/get/remove
codex mcp list [--json]
codex mcp get my-server [--json]
codex mcp remove my-server
```

### Transport Types
- **stdio**: Launch a local process, communicate via stdin/stdout JSON-RPC
- **Streamable HTTP**: Connect to a remote HTTP MCP server (with optional bearer token or OAuth)

### SDK Integration via `config` option

The TypeScript SDK accepts `config` overrides that get flattened to CLI `--config` flags:

```typescript
const codex = new Codex({
  config: {
    mcp_servers: {
      "alive-workspace": {
        command: ["node", "/path/to/alive-mcp.js"],
      },
      "alive-tools": {
        command: ["node", "/path/to/tools-mcp.js"],
      }
    }
  }
});
```

This means Alive CAN pass its internal MCP servers to Codex via the SDK config option.

### MCP Tool Call Events in SDK

The TypeScript SDK exposes `McpToolCallItem` in the event stream:

```typescript
type McpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;      // MCP server name
  tool: string;        // Tool name
  arguments: unknown;  // Tool arguments
  result?: {
    content: McpContentBlock[];
    structured_content: unknown;
  };
  error?: { message: string };
  status: "in_progress" | "completed" | "failed";
};
```

Events: `item.started` → `item.updated` → `item.completed` for each MCP call.

## 2. Codex AS an MCP Server

`codex mcp-server` runs Codex as an MCP server over stdio. Key methods:

- `newConversation` — start a session with model, cwd, approvalPolicy, sandbox
- `sendUserMessage` / `sendUserTurn` — send input
- `interruptConversation` — cancel
- `codex/event` — notification stream with agent events

### Approval System

Codex has a structured approval system via MCP:
- `applyPatchApproval { conversationId, callId, fileChanges }` — approve file changes
- `execCommandApproval { conversationId, callId, command, cwd }` — approve commands
- Client replies with `{ decision: "allow" | "deny" }`

### Sandbox Modes
- `read-only` — no writes
- `workspace-write` — write within workspace only
- `danger-full-access` — unrestricted

### Approval Policies
- `untrusted` — approve everything
- `on-request` — ask on each action
- `never` — auto-approve all (= `--full-auto`)

## Implications for Alive

### What Works Naturally
1. **MCP passthrough** — Alive's internal MCP servers (workspace, tools, email) can be passed to Codex via `config.mcp_servers`
2. **OAuth MCP servers** — HTTP MCP servers with auth can be passed via `url` + bearer token
3. **Structured events** — McpToolCallItem gives visibility into what MCP tools Codex is using
4. **Session resume** — Threads can be resumed, similar to Claude

### What Needs Work
1. **Internal SDK MCP servers** — Alive currently uses `createSdkMcpServer()` from Claude's SDK to create in-process MCP servers. These are function objects, not CLI commands. For Codex, these need to be refactored into standalone MCP server processes that Codex can spawn via stdio.
2. **Approval mapping** — Claude uses `canUseTool` callback. Codex uses `approvalPolicy` + approval request/response. Need unified permission model.
3. **Sandbox vs privilege drop** — Claude runs in-process after privilege drop. Codex spawns a CLI subprocess that needs its own sandbox config. Alive's UID/GID isolation needs to work with Codex's subprocess model.

### Critical Design Decision

**Alive's internal MCP servers must become standalone processes.**

Currently:
```
Worker process → creates in-process MCP server via createSdkMcpServer()
```

Needed for Codex:
```
Worker process → spawns MCP server as child process → passes to Codex via config
```

This refactor benefits both providers:
- Claude SDK can also use standalone MCP server processes
- Cleaner separation of concerns
- MCP servers become provider-agnostic

### MCP Server Refactoring Plan

1. Extract `workspaceInternalMcp` → standalone `alive-workspace-mcp` binary
2. Extract `toolsInternalMcp` → standalone `alive-tools-mcp` binary
3. Extract `emailInternalMcp` → standalone `alive-email-mcp` binary
4. Each server communicates via stdio JSON-RPC (standard MCP transport)
5. Worker spawns these as child processes and passes paths to both Claude and Codex SDKs

This is the single biggest prerequisite for multi-provider support.
