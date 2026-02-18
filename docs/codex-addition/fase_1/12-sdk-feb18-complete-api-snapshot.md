# Codex SDK Complete API Snapshot — Feb 18, 2026

Source: `github.com/openai/codex` `sdk/typescript/src/` (fetched 2026-02-18 ~07:00 CET)

## CodexOptions (constructor-level)
```typescript
type CodexOptions = {
  codexPathOverride?: string;      // Custom binary path
  baseUrl?: string;                // OpenAI-compatible endpoint
  apiKey?: string;                 // Set as CODEX_API_KEY env
  config?: CodexConfigObject;      // Flattened to --config key=value CLI args (TOML serialization)
  env?: Record<string, string>;    // REPLACES process.env entirely when set
};
```

### config flattening
The `config` object is serialized to TOML via `serializeConfigOverrides()`:
- Nested objects → dotted paths: `{ foo: { bar: "baz" } }` → `--config foo.bar="baz"`
- Arrays → TOML arrays: `[1, 2]` → `[1, 2]`
- Strings get JSON-quoted, booleans/numbers are bare
- **This confirms `system_message` can be passed via SDK**: `config: { system_message: "..." }`

### env behavior (CRITICAL)
```typescript
// exec.ts lines 115-125
const env: Record<string, string> = {};
if (this.envOverride) {
  Object.assign(env, this.envOverride);  // ONLY uses override
} else {
  // Copies process.env
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
}
// Then adds API key and base URL
if (args.apiKey) env.CODEX_API_KEY = args.apiKey;
if (args.baseUrl) env.OPENAI_BASE_URL = args.baseUrl;
```

**Important for Alive**: If `env` is set in CodexOptions, we must pass ALL needed env vars (PATH, HOME, TMPDIR, etc.) manually. The `apiKey` and `baseUrl` from thread args are always appended regardless.

## ThreadOptions (per-thread, set at `codex.startThread()`)
```typescript
type ThreadOptions = {
  model?: string;
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  modelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  networkAccessEnabled?: boolean;
  webSearchMode?: "disabled" | "cached" | "live";
  webSearchEnabled?: boolean;  // legacy, prefer webSearchMode
  approvalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
  additionalDirectories?: string[];
};
```

### approvalPolicy modes (NEW — expanded from earlier analysis)
- `"never"` — auto-approve everything (Alive's `bypassPermissions` equivalent)
- `"on-request"` — requires interactive approval for all tool use
- `"on-failure"` — auto-approve until a tool fails, then switch to manual
- `"untrusted"` — sandboxed execution, approval for anything outside sandbox

For Alive v1: use `"never"` (matches current behavior). Future: `"on-failure"` could be interesting.

### sandboxMode values
- `"read-only"` — Codex can read but not write (Alive `plan` mode equivalent)
- `"workspace-write"` — can write within workspace (Alive default)
- `"danger-full-access"` — no restrictions

## TurnOptions (per-turn, set at `thread.run()` / `thread.runStreamed()`)
```typescript
type TurnOptions = {
  outputSchema?: unknown;   // JSON schema for structured output
  signal?: AbortSignal;     // Cancel the turn
};
```

**Note**: `outputSchema` is per-turn, not per-thread. This means different turns in a conversation can request different structured outputs. For Alive, this could be useful for "analyze then act" workflows.

## Input types
```typescript
type UserInput =
  | { type: "text"; text: string }
  | { type: "local_image"; path: string };

type Input = string | UserInput[];
```

**Input is sent via stdin**, not CLI args. The SDK writes to `child.stdin` and closes it. This handles arbitrarily large prompts without arg length limits.

## CLI command structure
The SDK spawns: `codex exec --experimental-json [options] [resume <threadId>]`

Full arg mapping from exec.ts:
| SDK option | CLI arg |
|---|---|
| model | `--model <model>` |
| sandboxMode | `--sandbox <mode>` |
| workingDirectory | `--cd <dir>` |
| additionalDirectories | `--add-dir <dir>` (repeated) |
| skipGitRepoCheck | `--skip-git-repo-check` |
| outputSchemaFile | `--output-schema <path>` |
| modelReasoningEffort | `--config model_reasoning_effort="<effort>"` |
| networkAccessEnabled | `--config sandbox_workspace_write.network_access=<bool>` |
| webSearchMode | `--config web_search="<mode>"` |
| approvalPolicy | `--config approval_policy="<mode>"` |
| threadId | `resume <threadId>` (positional after exec) |
| images | `--image <path>` (repeated) |
| configOverrides | `--config <key>=<value>` (repeated, from CodexOptions.config) |

## Event types (JSONL on stdout)
```typescript
type ThreadEvent =
  | ThreadStartedEvent    // { type: "thread.started", thread_id: string }
  | TurnStartedEvent      // { type: "turn.started" }
  | TurnCompletedEvent    // { type: "turn.completed", usage: Usage }
  | TurnFailedEvent       // { type: "turn.failed", error: ThreadError }
  | ItemStartedEvent      // { type: "item.started", item: ThreadItem }
  | ItemUpdatedEvent      // { type: "item.updated", item: ThreadItem }
  | ItemCompletedEvent    // { type: "item.completed", item: ThreadItem }
  | ThreadErrorEvent      // { type: "error", message: string }
```

## Item types
```typescript
type ThreadItem =
  | AgentMessageItem       // { type: "agent_message", text: string }
  | ReasoningItem          // { type: "reasoning", text: string }
  | CommandExecutionItem   // { type: "command_execution", command, aggregated_output, exit_code?, status }
  | FileChangeItem         // { type: "file_change", changes: FileUpdateChange[], status }
  | McpToolCallItem        // { type: "mcp_tool_call", server, tool, arguments, result?, error?, status }
  | WebSearchItem          // { type: "web_search", query }
  | TodoListItem           // { type: "todo_list", items: TodoItem[] }
  | ErrorItem              // { type: "error", message }
```

### McpToolCallItem (important for Alive MCP integration)
```typescript
type McpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;           // MCP server name from config
  tool: string;             // Tool name on that server
  arguments: unknown;        // Args passed to tool
  result?: {
    content: McpContentBlock[];    // from @modelcontextprotocol/sdk
    structured_content: unknown;
  };
  error?: { message: string };
  status: "in_progress" | "completed" | "failed";
};
```

This is the key type for normalizing Codex MCP calls into Alive's unified event stream. The `server` field maps to our MCP server names (alive-tools, alive-workspace, etc.).

## Usage tracking
```typescript
type Usage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};
```

**Note**: No cost field — must calculate from token counts × model pricing. This differs from Claude SDK which provides cost directly via API response.

## Key corrections to earlier documents
1. **fase_2/16 (system_message)**: Previously concluded `system_message` not viable via SDK. **CORRECTED**: `CodexOptions.config` CAN pass `system_message` via `config: { system_message: "..." }`. Whether Codex Rust actually accepts this key still needs runtime verification, but the SDK mechanism works.
2. **fase_1/07 (approvalPolicy)**: Was documented as only `"never"` being viable. **UPDATED**: 4 modes available. `"on-failure"` is interesting for future Alive permission models.
3. **fase_2/14 (env isolation)**: Confirmed — `env` option REPLACES entirely. But `apiKey` and `baseUrl` are always appended by the SDK, so those don't need to be in the env object.
