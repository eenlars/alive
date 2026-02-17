# Fase 1.7 — Codex SDK Verified API Reference (from source)

> Verified against `github.com/openai/codex` on 2026-02-17

## Package: `@openai/codex-sdk` (version `0.0.0-dev`)

Requires: Node.js 18+, `@openai/codex` CLI binary (platform-specific: `@openai/codex-linux-x64`, etc.)

## Architecture

The SDK is a thin wrapper. It spawns `codex exec --experimental-json` as a child process and reads JSONL from stdout. The Rust CLI (`codex-rs`) does all the actual work.

```
@openai/codex-sdk (TypeScript)
  └── CodexExec.run()
        └── spawn("codex", ["exec", "--experimental-json", ...args])
              └── writes prompt to stdin, reads JSONL events from stdout
```

**Key implication for Alive:** The SDK doesn't have in-process hooks for tool approval. It's fire-and-forget. The `approvalPolicy` and `sandboxMode` are set at launch time via CLI flags, not controllable per-tool at runtime.

## Exact Types (from source)

### CodexOptions
```typescript
type CodexOptions = {
  codexPathOverride?: string;      // Custom path to codex binary
  baseUrl?: string;                // OPENAI_BASE_URL override
  apiKey?: string;                 // Set as CODEX_API_KEY env var
  config?: CodexConfigObject;      // --config key=value overrides (flattened to TOML)
  env?: Record<string, string>;    // Full env override (replaces process.env!)
};
```

**⚠️ Critical:** When `env` is provided, it does NOT merge with `process.env` — it replaces it entirely. The SDK explicitly copies `process.env` only when `env` is undefined. This means we must pass ALL needed env vars when using `env`.

### ThreadOptions
```typescript
type ThreadOptions = {
  model?: string;
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  modelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  networkAccessEnabled?: boolean;
  webSearchMode?: "disabled" | "cached" | "live";
  webSearchEnabled?: boolean;         // legacy, prefer webSearchMode
  approvalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
  additionalDirectories?: string[];
};
```

### TurnOptions
```typescript
type TurnOptions = {
  outputSchema?: unknown;    // JSON schema for structured output
  signal?: AbortSignal;      // Cancel the turn
};
```

### Thread API
```typescript
class Thread {
  get id(): string | null;    // Populated after first event
  run(input: Input, opts?: TurnOptions): Promise<Turn>;
  runStreamed(input: Input, opts?: TurnOptions): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
}

type Input = string | UserInput[];
type UserInput = { type: "text"; text: string } | { type: "local_image"; path: string };
```

### ThreadEvent (union)
```typescript
type ThreadEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage: Usage }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "item.started"; item: ThreadItem }
  | { type: "item.updated"; item: ThreadItem }
  | { type: "item.completed"; item: ThreadItem }
  | { type: "error"; message: string }

type Usage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};
```

### ThreadItem (union)
```typescript
type ThreadItem =
  | AgentMessageItem      // { type: "agent_message", text: string }
  | ReasoningItem         // { type: "reasoning", text: string }
  | CommandExecutionItem  // { type: "command_execution", command, aggregated_output, exit_code?, status }
  | FileChangeItem        // { type: "file_change", changes: [{path, kind}], status }
  | McpToolCallItem       // { type: "mcp_tool_call", server, tool, arguments, result?, error?, status }
  | WebSearchItem         // { type: "web_search", query: string }
  | TodoListItem          // { type: "todo_list", items: [{text, completed}] }
  | ErrorItem             // { type: "error", message: string }
```

## MCP Server Configuration via `config`

MCP servers are passed via the `config` option, which gets flattened to `--config` CLI flags:

```typescript
new Codex({
  config: {
    mcp_servers: {
      "alive-workspace": {
        command: ["node", "/path/to/server.js"],
        env: { WORKSPACE_ID: "abc" }
      },
      "alive-tools": {
        command: ["node", "/path/to/tools.js"]
      }
    }
  }
})
```

This gets serialized as:
```
--config 'mcp_servers.alive-workspace.command=["node","/path/to/server.js"]'
--config 'mcp_servers.alive-workspace.env.WORKSPACE_ID="abc"'
```

HTTP MCP servers:
```typescript
config: {
  mcp_servers: {
    "context7": {
      url: "http://localhost:8082/mcp"
    },
    "stripe": {
      url: "https://mcp.stripe.com",
      bearer_token_env_var: "STRIPE_TOKEN"
    }
  }
}
```

## Approval Model — NOT Interactive via SDK

**This is a critical finding.** The SDK spawns `codex exec` which runs non-interactively. The approval policy is set at launch:

- `"never"` → auto-approve everything (= `--full-auto` / `bypassPermissions`)
- `"on-request"` → ask before each action (but there's no way to respond via SDK!)
- `"on-failure"` → ask only after a failure
- `"untrusted"` → strict approval mode

**For Alive:** Only `"never"` makes sense with the TypeScript SDK, because there's no mechanism to handle approval requests programmatically. The MCP server approach (`codex mcp-server`) DOES support interactive approvals, but that's a different integration path entirely.

**Alternative:** Use the Codex MCP server protocol (`codex mcp-server`) instead of the TypeScript SDK. This gives bidirectional control including approval handling. But it's more complex to integrate.

### Decision Needed: SDK vs MCP Server Integration

| Approach | Pros | Cons |
|----------|------|------|
| **TypeScript SDK** (`@openai/codex-sdk`) | Simple, clean event stream, matches Claude SDK pattern | No runtime tool approval, fire-and-forget |
| **MCP Server** (`codex mcp-server`) | Full control, approval handling, bidirectional | More complex, different paradigm than Claude SDK |

**Recommendation:** Start with TypeScript SDK + `approvalPolicy: "never"` (auto-approve all). This matches Alive's current `bypassPermissions` mode. Interactive approval can come later via the MCP server approach.

## Process Model Details

The `CodexExec.run()` method:
1. Builds CLI args from options
2. Spawns `codex exec --experimental-json [args...]`
3. Writes prompt to child's stdin, then closes stdin
4. Reads JSONL lines from stdout
5. Collects stderr for error reporting
6. Yields parsed events
7. Throws if exit code ≠ 0

**Abort:** Uses `AbortSignal` passed to `spawn()` options — Node.js sends SIGTERM to the child.

**Thread resume:** When `threadId` is set, adds `resume <threadId>` to args. Sessions stored in `~/.codex/sessions/`.

## What's NOT in the SDK

1. **System prompt override** — No option to inject custom system prompts. Codex has its own hardcoded system prompt. The `config.toml` may support `system_message` but this isn't exposed in the SDK.
2. **Tool allowlist/denylist** — No way to restrict which tools Codex can use.
3. **Max turns** — No equivalent to Claude's `maxTurns`.
4. **Custom tool permission callback** — No `canUseTool` equivalent.
5. **In-process MCP servers** — MCP servers must be external processes (stdio) or HTTP URLs.

These limitations are acceptable for v1 but mean Codex workspaces will have less fine-grained control than Claude workspaces.
