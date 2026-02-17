# Fase 2.11 — MCP Tool Migration: Concrete Examples

## Current Tool Pattern

Every tool in Alive uses `tool()` from `@anthropic-ai/claude-agent-sdk`:

```typescript
// packages/tools/src/tools/meta/search-tools.ts
import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

export const searchToolsTool = tool({
  name: "search_tools",
  description: "Find tools by category...",
  parameters: z.object({
    category: z.enum(TOOL_CATEGORIES),
    detail_level: z.enum(DETAIL_LEVELS).optional().default("standard"),
  }),
  async execute({ category, detail_level }) {
    // ... tool logic ...
    return { content: [{ type: "text", text: result }], isError: false }
  }
})
```

These tool objects are collected into `createSdkMcpServer()` which creates in-process function handlers.

## Target Tool Pattern

Each MCP server becomes a standalone Node.js process using `@modelcontextprotocol/sdk`:

```typescript
// packages/mcp-servers/alive-tools/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const server = new McpServer({ name: "alive-tools", version: "1.0.0" })

// Context from env vars (set by worker when spawning this process)
const WORKSPACE_ID = process.env.WORKSPACE_ID!
const WORKSPACE_DIR = process.env.WORKSPACE_DIR!
const USER_ID = process.env.USER_ID!

server.tool(
  "search_tools",
  "Find tools by category...",
  {
    category: z.enum(TOOL_CATEGORIES),
    detail_level: z.enum(DETAIL_LEVELS).optional().default("standard"),
  },
  async ({ category, detail_level }) => {
    // Same logic as before — getSearchToolRegistry(), etc.
    return { content: [{ type: "text", text: result }] }
  }
)

// ... register all other tools ...

const transport = new StdioServerTransport()
await server.connect(transport)
```

## What Changes Per Tool

### Minimal changes (most tools):
- `tool({})` → `server.tool()` — different registration API, same logic
- Return shape: `{ content: [...], isError }` → `{ content: [...] }` (MCP SDK doesn't use `isError` the same way; errors are thrown)
- Context: Instead of accessing shared module state, read from `process.env`

### Tools needing context refactoring:

**`search_tools`** — Uses `AsyncLocalStorage` for connected OAuth providers
- Current: Providers set via `setConnectedOAuthProviders()` called from worker
- New: Pass connected providers via env var `CONNECTED_OAUTH_PROVIDERS=stripe,linear,github`
- Parse in MCP server: `process.env.CONNECTED_OAUTH_PROVIDERS?.split(",") || []`

**`restart_dev_server`** — Calls systemctl
- Current: Runs in-process with root privileges (before full privilege drop)
- New: MCP server process also runs with the workspace user's privileges
- **Problem:** `systemctl restart` may need elevated permissions
- **Solution:** Pre-configure sudoers for workspace users to restart their own service:
  ```
  alive-user-* ALL=(root) NOPASSWD: /usr/bin/systemctl restart site@*
  ```

**`run_query` (Supabase)** — Needs Supabase access token
- Current: Token available via shared module state
- New: Pass via env var `SUPABASE_ACCESS_TOKEN`

**`send_reply` (email)** — Needs SMTP credentials
- Current: Credentials from shared config
- New: Pass via env vars `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`

## Migration Order (by risk)

1. **Low risk** — Pure logic tools (no external deps):
   - `search_tools`, `list_workflows`, `get_workflow`, `get_alive_super_template`
   - `generate_persona`, `ask_clarification`, `ask_website_config`, `ask_automation_config`

2. **Medium risk** — Tools with external deps:
   - `check_codebase` (runs tsc/eslint)
   - `install_package` (runs bun)
   - `delete_file`, `copy_shared_asset`
   - `read_server_logs` (reads journalctl)

3. **High risk** — Tools needing privileged operations:
   - `restart_dev_server` (systemctl)
   - `create_website` (creates systemd service)
   - `run_query` (Supabase API)
   - `send_reply` (SMTP)

## Shared Code Strategy

Tool logic lives in `packages/tools/src/tools/`. The MCP servers import this logic:

```
packages/tools/src/tools/         ← Pure logic (shared)
packages/mcp-servers/alive-tools/ ← MCP server wrapper (imports from tools)
```

This means most tool code stays in place. The MCP server just registers handlers that call existing functions. Minimal code duplication.

```typescript
// packages/mcp-servers/alive-tools/src/index.ts
import { searchTools } from "@webalive/tools/tools/meta/search-tools"

server.tool("search_tools", "...", schema, async (params) => {
  return searchTools(params, { workspaceId: WORKSPACE_ID, ... })
})
```

**Prerequisite:** Tool functions need to accept context as a parameter instead of reading from module-level state. This is the main refactoring needed in `packages/tools/`.

## Test Strategy Per Tool

For each migrated tool:
1. **Unit test:** Call tool function directly with mock context → verify output
2. **MCP test:** Start MCP server process, send JSON-RPC tool call via stdio → verify response
3. **Integration test:** Full worker → provider → MCP server → tool execution → IPC response

```bash
# Quick MCP server smoke test:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  WORKSPACE_ID=test node packages/mcp-servers/alive-tools/dist/index.js
# Should return JSON-RPC response with tool list
```
