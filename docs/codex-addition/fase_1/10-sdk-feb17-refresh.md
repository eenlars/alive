# Fase 1.10 — Codex SDK Refresh (Feb 17 2026, evening)

## Source: `sdk/typescript/src/*` from `openai/codex` main branch

Re-verified all SDK files against latest source. Several changes since fase_1/09.

## New SDK Capabilities (vs earlier analysis)

### 1. `approvalPolicy` is now a first-class ThreadOption
Previously only available via `--config`. Now a direct option:
```typescript
type ApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";
```
- `"never"` = auto-approve everything (maps to Alive `bypassPermissions: true`)
- `"on-request"` = model decides when to ask (default)
- `"on-failure"` = only ask for approval on failed commands
- `"untrusted"` = ask for everything from untrusted sources
- For Alive v1: use `"never"` (full auto) since Alive manages permissions via MCP

### 2. `webSearchMode` and `networkAccessEnabled`
```typescript
webSearchMode?: "disabled" | "cached" | "live";
networkAccessEnabled?: boolean; // maps to sandbox_workspace_write.network_access
```
These give fine-grained control over Codex's network behavior. Alive should:
- Default `webSearchMode: "disabled"` (Alive has its own search tools via MCP)
- Default `networkAccessEnabled: false` unless workspace explicitly enables it

### 3. `additionalDirectories`
```typescript
additionalDirectories?: string[]; // --add-dir flags
```
Allows Codex to access directories outside the workspace root. Useful for Alive's shared package dirs.

### 4. Image input support
```typescript
type UserInput =
  | { type: "text"; text: string }
  | { type: "local_image"; path: string };

type Input = string | UserInput[];
```
Codex now supports image inputs per turn. Alive should expose this for screenshot-based debugging flows.

### 5. `outputSchema` (structured output)
```typescript
type TurnOptions = {
  signal?: AbortSignal;
  outputSchema?: Record<string, unknown>;
};
```
Alive can use this for structured extraction tasks (JSON output from agents).

### 6. `ModelReasoningEffort`
```typescript
type ModelReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
```
Maps well to Alive's potential "thinking level" UI control.

## Thread Item Types (complete, verified)

| Type | Description | Has streaming? |
|------|-------------|---------------|
| `agent_message` | Text response | started → completed |
| `reasoning` | Chain-of-thought | started → completed |
| `command_execution` | Shell command + output | started → updated → completed |
| `file_change` | File patches (add/delete/update) | completed only |
| `mcp_tool_call` | MCP server tool invocation | started → updated → completed |
| `web_search` | Web search query | started → completed |
| `todo_list` | Agent plan/checklist | started → updated → completed |
| `error` | Non-fatal error item | completed only |

### `McpToolCallItem` (critical for Alive integration)
```typescript
type McpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;      // MCP server name from config
  tool: string;        // Tool name
  arguments: unknown;  // Input args
  result?: {
    content: McpContentBlock[];
    structured_content: unknown;
  };
  error?: { message: string };
  status: "in_progress" | "completed" | "failed";
};
```
This is structurally similar to Claude's MCP tool calls. Both expose server name, tool name, arguments, and result. The normalization layer should be straightforward.

## CodexExec internals

The SDK works by:
1. Finding the Codex CLI binary (vendored in `@openai/codex-{platform}` npm packages)
2. Running `codex exec --experimental-json [args]` as a child process
3. Writing user input to stdin, reading JSONL events from stdout
4. Each line is a `ThreadEvent` JSON object

### Binary discovery
Uses platform-specific npm packages:
- `@openai/codex-linux-x64` / `@openai/codex-linux-arm64`
- `@openai/codex-darwin-x64` / `@openai/codex-darwin-arm64`
- `@openai/codex-win32-x64` / `@openai/codex-win32-arm64`

Binary lives at: `<package>/vendor/<triple>/codex/codex`

### Environment handling (CONFIRMED)
```typescript
if (this.envOverride) {
  Object.assign(env, this.envOverride);
} else {
  // Copy ALL of process.env
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
}
```
**CORRECTED from fase_1/07**: When `envOverride` is provided, it REPLACES process.env. When not provided, process.env is copied. The `baseUrl` and `apiKey` are then added on top via `OPENAI_BASE_URL` and `CODEX_API_KEY` env vars.

For Alive: MUST provide the `env` constructor option with carefully curated env vars to prevent leaking server-side secrets to the Codex subprocess. The SDK subsequently injects `CODEX_API_KEY` and `OPENAI_BASE_URL` on top of the provided `env` object.

### Config override serialization
SDK flattens nested objects into dotted TOML paths:
```typescript
{ sandbox_workspace_write: { network_access: true } }
→ "--config" "sandbox_workspace_write.network_access=true"
```
This means Alive can pass MCP server config, system prompts, etc. via the `config` option:
```typescript
new Codex({
  config: {
    mcp_servers: {
      "alive-tools": { command: "/path/to/alive-mcp-tools" }
    },
    system_message: "You are working in an Alive workspace..."
  }
})
```
**OPEN QUESTION**: Does `system_message` work as a config key? Need to verify against Rust config parser.
**OPEN QUESTION**: Does passing `mcp_servers` via `config` create new server entries via dotted `--config` flags, or does it only override fields on pre-existing entries? Verify whether a full server definition (command, args, env) can be supplied this way at runtime.

## MCP Server Mode (codex-rs/mcp-server)

The Codex MCP server (`codex mcp-server` CLI) is a standalone stdio MCP server that:
1. Reads JSON-RPC messages from stdin (using `rmcp` crate)
2. Runs Codex internally as a tool provider
3. Supports **interactive approvals** via MCP `elicitation` — sends `ExecApprovalElicitRequestParams` or `PatchApprovalElicitRequestParams` to the MCP client
4. Client responds with approval/denial

This is NOT what Alive uses — Alive uses the SDK to spawn Codex directly. But it's relevant if we ever want to run Codex as an MCP tool inside Claude (meta-agent pattern).

## Corrections to Previous Docs

| Previous Claim | Correction |
|---------------|-----------|
| "approvalPolicy only via config" (fase_1/07) | Now a first-class `ThreadOptions` field |
| "env REPLACES entirely" (fase_1/07) | Only when `envOverride` is explicitly provided |
| "No system prompt option" (fase_1/07) | May work via `config.system_message` — needs verification |
| "No web search control" | Now has `webSearchMode` option |
| "No image support" | Now has `UserInput` with `local_image` type |
