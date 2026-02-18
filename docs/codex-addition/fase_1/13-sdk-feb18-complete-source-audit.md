# SDK Source Audit — Feb 18 16:00

Complete re-verification of Codex SDK + Rust config source against `openai/codex` main branch.

## Critical Correction: System Message Config Key

Previous docs (fase_2/16, fase_2/24) discussed `system_message` as a Rust config key. **This is WRONG.**

The actual Rust `Config` struct has these instruction fields:
- `user_instructions: Option<String>` — from AGENTS.md / CODEX.md project doc
- `base_instructions: Option<String>` — base instructions override
- `developer_instructions: Option<String>` — injected as separate message
- `compact_prompt: Option<String>` — compact prompt override

**For Alive's system prompt injection, use `developer_instructions` via SDK config:**
```typescript
const codex = new Codex({
  apiKey: "...",
  config: {
    developer_instructions: "You are an Alive workspace agent. ..."
  }
});
```

This serializes to: `codex exec --config developer_instructions="..."`.

This is **much cleaner** than CODEX.md file manipulation because:
- Injected as separate developer message (like OpenAI's developer role)
- No file creation/cleanup needed
- No conflict with user's own CODEX.md
- `user_instructions` comes from CODEX.md — so BOTH can coexist

## MCP Server Config — Full Schema

From `codex-rs/core/src/config/types.rs`:

```rust
struct McpServerConfig {
    transport: McpServerTransportConfig,  // Stdio or StreamableHttp
    enabled: bool,                        // default true
    required: bool,                       // exit on init failure
    startup_timeout_sec: Option<Duration>,
    tool_timeout_sec: Option<Duration>,
    enabled_tools: Option<Vec<String>>,   // allowlist
    disabled_tools: Option<Vec<String>>,  // denylist
    scopes: Option<Vec<String>>,          // OAuth scopes
}

enum McpServerTransportConfig {
    Stdio {
        command: String,
        args: Vec<String>,
        env: Option<HashMap<String, String>>,
        env_vars: Vec<String>,           // passthrough from host env
        cwd: Option<PathBuf>,
    },
    StreamableHttp {
        url: String,
        bearer_token_env_var: Option<String>,
        http_headers: Option<HashMap<String, String>>,
        env_http_headers: Option<HashMap<String, String>>,
    },
}
```

Key implications for Alive:
- `env_vars` = list of env var NAMES to passthrough (not key=value). This is useful for passing workspace context.
- `cwd` per MCP server = can set to workspace root
- `enabled_tools` / `disabled_tools` = can restrict MCP tool surface per workspace
- `required: true` = Codex exits if our MCP server fails to start — we want this for Alive's core MCP servers
- `startup_timeout_sec` = should set to ~10s for Alive MCP servers

## Approval Policy — Expanded Options

```typescript
type ApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";
```

- `"never"` = auto-approve all (matches Alive's `bypassPermissions` mode)
- `"on-failure"` = only ask when command fails — interesting for a "semi-auto" mode
- `"untrusted"` = ask for everything (most restrictive)
- `"on-request"` = ask when model explicitly requests approval

For Alive v1: use `"never"` (fire-and-forget, consistent with current Claude behavior).
Future: `"on-failure"` could be interesting for a "guided" workspace mode.

## SDK Thread API — Verified

```typescript
class Codex {
  startThread(options: ThreadOptions): Thread
  resumeThread(id: string, options: ThreadOptions): Thread
}

class Thread {
  get id(): string | null  // populated after first turn
  run(input: Input, turnOptions?: TurnOptions): Promise<Turn>
  runStreamed(input: Input, turnOptions?: TurnOptions): Promise<StreamedTurn>
}

type Turn = {
  items: ThreadItem[]
  finalResponse: string
  usage: Usage | null
}

type StreamedTurn = {
  events: AsyncGenerator<ThreadEvent>
}

type Input = string | UserInput[]
type UserInput = { type: "text", text: string } | { type: "local_image", path: string }
```

## Thread Items — Complete Type Map

| Type | Fields | Alive Equivalent |
|------|--------|-----------------|
| `agent_message` | `id, text` | Text message |
| `reasoning` | `id, text` | Thinking block |
| `command_execution` | `id, command, aggregated_output, exit_code, status` | Tool result (bash) |
| `file_change` | `id, changes[{path, kind}], status` | File edit display |
| `mcp_tool_call` | `id, server, tool, arguments, result, error, status` | MCP tool result |
| `web_search` | `id, query` | Web search indicator |
| `todo_list` | `id, items[{text, completed}]` | Plan/checklist |
| `error` | `id, message` | Error display |

## Events — Complete Type Map

| Event | Fields | Notes |
|-------|--------|-------|
| `thread.started` | `thread_id` | Save for resume |
| `turn.started` | — | Session activity indicator |
| `turn.completed` | `usage: {input_tokens, cached_input_tokens, output_tokens}` | Billing |
| `turn.failed` | `error: {message}` | Error handling |
| `item.started` | `item: ThreadItem` | Streaming start |
| `item.updated` | `item: ThreadItem` | Streaming progress |
| `item.completed` | `item: ThreadItem` | Final state |
| `error` | `message` | Fatal stream error |

## CLI Spawn Details (exec.ts)

The SDK spawns `codex exec --experimental-json` with flags:
- Input via stdin (write + end)
- Output via stdout (JSONL, one event per line)
- Stderr collected for error reporting
- Exit code checked (non-zero = error)
- `AbortSignal` passed to `spawn()` for cancellation
- `CODEX_API_KEY` env var (NOT `OPENAI_API_KEY`)
- `OPENAI_BASE_URL` for custom endpoints

## New Config Fields Discovered

From `Config` struct:
- `model_context_window: Option<i64>` — context window size
- `model_auto_compact_token_limit: Option<i64>` — auto-compaction threshold
- `tool_output_token_limit: Option<usize>` — tool output budget
- `agent_max_threads: Option<usize>` — concurrent thread limit (default 6)
- `ephemeral: bool` — don't persist session (useful for Alive's per-query model)
- `memories: MemoriesConfig` — built-in memory system
- `model_providers: HashMap<String, ModelProviderInfo>` — custom providers possible

## Implications for Alive

1. **System prompt**: Use `developer_instructions` config key, NOT `system_message` or CODEX.md
2. **MCP config**: Pass via project-level `config.toml` with `required: true` and explicit timeouts
3. **Approval**: `"never"` for v1
4. **Sessions**: Set `ephemeral: true` since Alive manages its own session state
5. **Network**: Codex has its own network proxy — may conflict with Alive's container networking. Needs testing.
6. **Config via SDK**: `CodexOptions.config` supports any TOML-serializable key, including `developer_instructions`

## Supersedes
- fase_1/09, fase_1/10, fase_1/11, fase_1/12 — this is the latest verified snapshot
- fase_2/16 — `system_message` doesn't exist; use `developer_instructions`
- fase_2/24 — corrected: use `developer_instructions` not `system_message`
