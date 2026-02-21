# Pre-Flight Verification Guide

Before writing any production code, run these manual verifications. Results determine if the plan needs adjustment.

## Test 1: Codex SDK Basic Execution (BLOCKER)

```bash
mkdir -p /tmp/codex-test && cd /tmp/codex-test
npm init -y && npm install @openai/codex-sdk
```

```typescript
// test-basic.ts
import { Codex, Thread } from "@openai/codex-sdk";

const codex = new Codex({ apiKey: process.env.CODEX_API_KEY });
const thread = codex.startThread({ 
  sandboxMode: "danger-full-access",
  skipGitRepoCheck: true,
  workingDirectory: "/tmp/codex-test"
});
const result = thread.runStreamed("Say hello");

for await (const event of result) {
  console.log(JSON.stringify(event, null, 2));
}
```

**Pass criteria**: Events stream, turn completes.
**If fails**: Check binary availability, API key, network.

## Test 2: developer_instructions via config (BLOCKER)

```typescript
const codex = new Codex({
  apiKey: process.env.CODEX_API_KEY,
  config: { developer_instructions: "Always start your response with ALIVE_MARKER" }
});
// ... run query, check if output starts with ALIVE_MARKER
```

**Pass criteria**: Agent output includes the marker text.
**If fails**: Fall back to config.toml approach. Write `.codex/config.toml`:
```toml
developer_instructions = "Always start your response with ALIVE_MARKER"
```

## Test 3: MCP Stdio Server with Codex (BLOCKER)

Create a minimal MCP server:
```typescript
// test-mcp-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "test", version: "1.0.0" });
server.tool("ping", {}, async () => ({ content: [{ type: "text", text: "pong" }] }));

const transport = new StdioServerTransport();
await server.connect(transport);
```

Write `.codex/config.toml`:
```toml
[mcp_servers.test]
command = "node"
args = ["test-mcp-server.ts"]
```

Run Codex with prompt "Use the ping tool".

**Pass criteria**: Codex discovers and calls the MCP tool, receives "pong".
**If fails**: Check MCP transport, stdio piping, config.toml parsing.

## Test 4: env Replacement Behavior

```typescript
const codex = new Codex({
  apiKey: process.env.CODEX_API_KEY,
  env: { CODEX_API_KEY: process.env.CODEX_API_KEY, HOME: "/tmp/codex-test", PATH: process.env.PATH }
});
```

Run a query that uses a tool requiring PATH (e.g., "run `echo hello`").

**Pass criteria**: Command executes successfully with the restricted env.
**If fails**: Verify which env vars are required minimum.

## Test 5: Claude SDK with McpStdioServerConfig

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const result = query({
  prompt: "Use the ping tool",
  options: {
    mcpServers: {
      test: { type: "stdio", command: "node", args: ["test-mcp-server.ts"] }
    }
  }
});
```

**Pass criteria**: Claude discovers and uses the stdio MCP server.
**If fails**: MCP refactoring approach needs rethinking. Major plan revision.

## Test 6: CODEX_HOME Isolation

```typescript
const codex = new Codex({
  apiKey: process.env.CODEX_API_KEY,
  env: { ...process.env, CODEX_HOME: "/tmp/codex-home-ws1" }
});
```

**Pass criteria**: Session data written to `/tmp/codex-home-ws1/`, not `~/.codex/`.

## Results Template

| Test | Result | Notes |
|---|---|---|
| 1: Basic execution | ⬜ | |
| 2: developer_instructions | ⬜ | |
| 3: MCP stdio | ⬜ | |
| 4: env replacement | ⬜ | |
| 5: Claude stdio MCP | ⬜ | |
| 6: CODEX_HOME | ⬜ | |

Tests 1-3 and 5 are BLOCKERS. If any fail, stop and reassess before coding.
