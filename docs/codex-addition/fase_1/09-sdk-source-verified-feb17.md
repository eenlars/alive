# Fase 1.9 — SDK Source Verification (Feb 17 2026, latest main)

> Source: `github.com/openai/codex` — verified against `sdk/typescript/src/` (NOT the old `codex-js/` path)

## SDK Location Change

The SDK has moved from `codex-js/codex-sdk/` to `sdk/typescript/`. Previous docs referenced the old path. The npm package is still `@openai/codex-sdk`.

Key source files:
- `sdk/typescript/src/codex.ts` — main Codex class
- `sdk/typescript/src/exec.ts` — CodexExec (spawns CLI)
- `sdk/typescript/src/events.ts` — ThreadEvent union
- `sdk/typescript/src/items.ts` — ThreadItem union
- `sdk/typescript/src/codexOptions.ts` — CodexOptions type
- `sdk/typescript/src/threadOptions.ts` — ThreadOptions type
- `sdk/typescript/src/thread.ts` — Thread class

## Corrections to fase_1/07

The previous analysis was largely correct. Key confirmations and corrections:

### ✅ Confirmed Exactly
- `env` REPLACES `process.env` entirely when provided (confirmed in exec.ts line-by-line)
- `approvalPolicy` set at launch via `--config approval_policy="..."` — no runtime approval
- MCP servers via `config.mcp_servers` → flattened to `--config` TOML overrides
- SDK spawns `codex exec --experimental-json` and reads JSONL from stdout
- Thread resume via `resume <threadId>` appended to args
- AbortSignal passed to `spawn()` options

### 🔄 Updated Details
- **`images` support**: ThreadOptions doesn't have `images`, but `TurnOptions` / `Input` supports `{ type: "local_image", path: string }` — images go through the `run()`/`runStreamed()` input, not thread config
- **`webSearchMode`**: New option `"cached" | "live" | "disabled"` — replaces the legacy `webSearchEnabled` boolean
- **`networkAccessEnabled`**: Maps to `--config sandbox_workspace_write.network_access=<bool>` — controls outbound network in sandbox mode
- **`modelReasoningEffort`**: `"minimal" | "low" | "medium" | "high" | "xhigh"` — 5 levels (our doc said it was correct)
- **Config serialization**: `flattenConfigOverrides()` recursively converts nested objects to dotted TOML paths. Arrays serialize to TOML arrays `[item1, item2]`. Nested objects serialize to inline tables `{key = value}`.

### 🆕 New Findings
1. **`CODEX_API_KEY` env var**: The SDK sets `env.CODEX_API_KEY = args.apiKey` — NOT `OPENAI_API_KEY`. This is important for credential management.
2. **`CODEX_INTERNAL_ORIGINATOR_OVERRIDE`**: SDK sets this to `"codex_sdk_ts"` — telemetry/tracking, not user-facing
3. **`baseUrl` option**: Maps to `OPENAI_BASE_URL` env var — enables custom OpenAI-compatible endpoints
4. **`outputSchemaFile`**: `TurnOptions` has `outputSchema` but exec maps it to a temp file path — structured output works by writing a JSON schema file and passing `--output-schema <path>`
5. **Platform packages**: `@openai/codex-linux-x64`, `@openai/codex-linux-arm64`, etc. Binary resolution: codexPathOverride → npm package binary → system PATH

### ThreadItem Types — Exact (from items.ts)

```typescript
type ThreadItem =
  | AgentMessageItem      // { id, type: "agent_message", text }
  | ReasoningItem         // { id, type: "reasoning", text }
  | CommandExecutionItem  // { id, type: "command_execution", command, aggregated_output, exit_code?, status }
  | FileChangeItem        // { id, type: "file_change", changes: [{path, kind: "add"|"delete"|"update"}], status }
  | McpToolCallItem       // { id, type: "mcp_tool_call", server, tool, arguments, result?, error?, status }
  | WebSearchItem         // { id, type: "web_search", query }
  | TodoListItem          // { id, type: "todo_list", items: [{text, completed}] }
  | ErrorItem             // { id, type: "error", message }
```

Note: All items have an `id` field (string). This was missing from our fase_1/07 types.

### McpToolCallItem — Exact

```typescript
type McpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: unknown;
  result?: {
    content: McpContentBlock[];  // from @modelcontextprotocol/sdk/types.js
    structured_content: unknown;
  };
  error?: { message: string };
  status: "in_progress" | "completed" | "failed";
};
```

The `McpContentBlock` import from `@modelcontextprotocol/sdk` confirms Codex uses standard MCP content types for tool results.

## Implications for Alive

### CODEX_API_KEY vs OPENAI_API_KEY
Alive's lockbox stores the user's API key. When spawning Codex, we must set `CODEX_API_KEY` (not `OPENAI_API_KEY`). The SDK handles this in `exec.ts`.

However, when using `env` override (which we must, to isolate env), we need to pass `CODEX_API_KEY` explicitly since `apiKey` option only works if `env` is not set... actually no — the SDK sets `env.CODEX_API_KEY = args.apiKey` AFTER copying envOverride. So `apiKey` option works even with `env` override. Good.

### Structured Output
Codex supports `outputSchema` in `TurnOptions` — this enables JSON-mode responses. Alive doesn't use this yet for Claude either, but it's a future feature for both providers.

### baseUrl for OpenAI-compatible providers
The `baseUrl` option means Codex could theoretically work with any OpenAI-compatible API endpoint. Future feature: user-configurable base URL per workspace.
