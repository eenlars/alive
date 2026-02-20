# SDK Source Verification — Feb 19, 2026 (Final)

Final pre-implementation verification of Codex SDK against `openai/codex` main branch.

## Verified Files & Key Findings

### codexOptions.ts
```typescript
export type CodexOptions = {
  codexPathOverride?: string;    // custom binary path
  baseUrl?: string;               // OpenAI-compatible endpoint
  apiKey?: string;                // CODEX_API_KEY
  config?: CodexConfigObject;     // flattened to --config key=value
  env?: Record<string, string>;   // REPLACES process.env when set
};
```

### threadOptions.ts
```typescript
export type ThreadOptions = {
  model?: string;
  sandboxMode?: SandboxMode;                    // "read-only" | "workspace-write" | "danger-full-access"
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  modelReasoningEffort?: ModelReasoningEffort;   // "minimal" | "low" | "medium" | "high" | "xhigh"
  networkAccessEnabled?: boolean;
  webSearchMode?: WebSearchMode;                // "disabled" | "cached" | "live"
  webSearchEnabled?: boolean;                   // legacy, prefer webSearchMode
  approvalPolicy?: ApprovalMode;                // "never" | "on-request" | "on-failure" | "untrusted"
  additionalDirectories?: string[];
};
```

### turnOptions.ts
```typescript
export type TurnOptions = {
  outputSchema?: unknown;    // JSON schema for structured output
  signal?: AbortSignal;      // cancellation
};
```

### exec.ts — CLI arg construction (CRITICAL)

The `run()` method builds CLI args as: `codex exec --experimental-json [options]`

**Config flattening confirmed**: `CodexOptions.config` is serialized via `serializeConfigOverrides()` → `flattenConfigOverrides()` which converts nested objects to dotted paths with TOML-formatted values.

Example: `{ developer_instructions: "Be helpful" }` → `--config developer_instructions="Be helpful"`

**Environment confirmed**: When `envOverride` is set, it completely replaces `process.env`. The SDK adds:
- `CODEX_INTERNAL_ORIGINATOR_OVERRIDE = "codex_sdk_ts"`
- `OPENAI_BASE_URL` (if baseUrl provided)
- `CODEX_API_KEY` (if apiKey provided)

**Input delivery**: User prompt is written to child process stdin, not as CLI arg. This is important — no shell escaping issues for large prompts.

**Image support**: `--image <path>` flags for local image files.

**Thread resume**: `resume <threadId>` appended to args.

### thread.ts

- `runStreamed()` returns `{ events: AsyncGenerator<ThreadEvent> }`
- Events are JSONL lines parsed from stdout
- Thread ID is captured from `thread.started` event
- `run()` is a convenience that collects all events into a `Turn` object
- Images extracted from `UserInput[]` array via `normalizeInput()`

### items.ts — All item types

| Type | Key Fields |
|------|-----------|
| `command_execution` | command, aggregated_output, exit_code, status |
| `file_change` | changes[{path, kind}], status |
| `mcp_tool_call` | server, tool, arguments, result?, error?, status |
| `agent_message` | text |
| `reasoning` | text |
| `web_search` | query |
| `todo_list` | items[{text, completed}] |
| `error` | message |

**Note**: `McpToolCallItem.result` has `{ content: McpContentBlock[], structured_content: unknown }` — imports `ContentBlock` from `@modelcontextprotocol/sdk/types.js`.

### events.ts — All event types

| Type | Payload |
|------|---------|
| `thread.started` | thread_id |
| `turn.started` | (none) |
| `turn.completed` | usage: {input_tokens, cached_input_tokens, output_tokens} |
| `turn.failed` | error: {message} |
| `item.started` | item: ThreadItem |
| `item.updated` | item: ThreadItem |
| `item.completed` | item: ThreadItem |
| `error` | message |

## Changes Since Last Verification (fase_1/13, Feb 18)

- No structural changes detected in exported types
- `webSearchEnabled` (boolean) still present alongside `webSearchMode` (enum) — legacy compat
- Config flattening logic is stable and well-tested (handles nested objects, arrays, TOML serialization)

## Confidence Level

**HIGH** — All types and behaviors match our implementation plan in fase_2/27. No API changes needed.

## Remaining Unknowns (Runtime-Only)

These cannot be verified from source — require running tests (fase_3/05):

1. Does `developer_instructions` actually influence agent behavior when passed via `--config`?
2. Does the Rust CLI accept `developer_instructions` as a valid config key? (It should — it's in the Rust Config struct per fase_1/13)
3. Does project-level `.codex/config.toml` take precedence over user-level `~/.codex/config.toml`?
