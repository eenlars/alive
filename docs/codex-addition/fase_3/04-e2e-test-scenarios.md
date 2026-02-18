# Fase 3.4 — End-to-End Test Scenarios

## Test Categories

### A. Provider Selection

| # | Scenario | Expected |
|---|----------|----------|
| A1 | Create workspace with default provider | Provider = "claude" |
| A2 | Create workspace with provider = "codex" | Provider = "codex", Codex session starts |
| A3 | Switch provider mid-workspace (no active query) | Next query uses new provider |
| A4 | Switch provider while query is running | Error: "Cannot switch provider during active query" |
| A5 | Set provider to unknown value via API | 400 error |

### B. Codex Session Lifecycle

| # | Scenario | Expected |
|---|----------|----------|
| B1 | Start Codex query, simple prompt | thread.started → item events → turn.completed |
| B2 | Resume Codex thread (follow-up message) | Uses existing thread_id, no new thread.started |
| B3 | Codex query with image input | Image path passed, no error |
| B4 | Codex query abort (user cancels) | AbortSignal fires, process killed cleanly |
| B5 | Codex CLI binary missing | Graceful error: "Codex CLI not found" |
| B6 | Codex API key invalid | turn.failed with auth error |
| B7 | Codex rate limited | Retry with backoff (per [fase_2/07](../fase_2/07-error-handling-and-recovery.md)) |

### C. MCP Integration

| # | Scenario | Expected |
|---|----------|----------|
| C1 | Codex calls alive-tools MCP server | mcp_tool_call item with server="alive-tools" |
| C2 | Codex calls alive-workspace MCP read_file | Returns file content |
| C3 | MCP server crashes mid-query | Error item, query continues or fails gracefully |
| C4 | MCP server timeout (tool takes >30s) | Timeout error, no hang |
| C5 | Claude and Codex use same MCP server spec | Both can call tools, same results |

### D. Event Normalization

| # | Scenario | Expected |
|---|----------|----------|
| D1 | Codex agent_message → frontend | Renders as assistant text bubble |
| D2 | Codex command_execution → frontend | Renders as terminal/bash block |
| D3 | Codex file_change → frontend | Renders as diff view |
| D4 | Codex mcp_tool_call → frontend | Renders as tool invocation card |
| D5 | Codex todo_list → frontend | Renders as plan/checklist |
| D6 | Codex web_search → frontend | Renders as search card |
| D7 | Codex reasoning → frontend | Renders as thinking block (if enabled) |
| D8 | Mixed Claude/Codex history in same workspace | Both render correctly after provider switch |

### E. Billing & Usage

| # | Scenario | Expected |
|---|----------|----------|
| E1 | Codex query completes | Usage tracked: input_tokens, output_tokens, cached |
| E2 | View workspace usage after mixed providers | Shows per-provider breakdown |
| E3 | Codex turn.failed (no usage) | No usage billed |

### F. Auth & Security

| # | Scenario | Expected |
|---|----------|----------|
| F1 | Codex env doesn't leak server secrets | Only whitelisted env vars in subprocess |
| F2 | Codex API key stored encrypted | Decrypted only at runtime for subprocess |
| F3 | User without Codex access tries to use it | Feature flag blocks, clear error |

## Test Automation Approach

### Unit tests (vitest)
- Event normalization functions (D1-D8)
- Provider registry resolution
- Config serialization (TOML flattening)
- Env var filtering

### Integration tests (vitest + child_process mock)
- CodexProvider.createSession with mock binary
- Thread lifecycle (B1-B3)
- Error handling (B5-B7)
- MCP server spawning (C1-C2)

### E2E tests (playwright)
- Full workspace flow: create → select Codex → run query → see output
- Provider switching (A1-A4)
- UI rendering of all item types (D1-D8)

## Fixture Data

Use JSONL fixtures from fase_3/03 for mock Codex output. Each fixture represents a complete turn:

```text
fixtures/
├── codex-simple-response.jsonl      # Just agent_message
├── codex-command-execution.jsonl    # command_execution + agent_message
├── codex-file-change.jsonl          # file_change items
├── codex-mcp-tool-call.jsonl        # mcp_tool_call items
├── codex-multi-item-turn.jsonl      # Mixed items in one turn
├── codex-error-auth.jsonl           # Auth failure
├── codex-error-rate-limit.jsonl     # Rate limit
└── codex-thread-resume.jsonl        # Resume with existing thread_id
```
