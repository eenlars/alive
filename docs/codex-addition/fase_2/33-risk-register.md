# Risk Register — Codex Integration

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | `developer_instructions` doesn't work via `--config` CLI flag | Cannot inject system prompt cleanly | Medium | Fallback: write project-level `.codex/config.toml` with `developer_instructions` key. Already planned (fase_2/25). |
| R2 | Codex seccomp sandbox blocks Node.js MCP stdio servers | MCP tools don't work | Medium | Use `danger-full-access` sandbox mode for v1 (fase_2/26). Test immediately in pre-flight. |
| R3 | Codex SDK `env` replacement drops required vars | CLI crashes or tools fail | High | Build full env map: `{ ...process.env, CODEX_API_KEY, CODEX_HOME, ALIVE_* }`. Never pass partial env. Documented in fase_2/14/28. |
| R4 | Claude SDK `McpStdioServerConfig` regression | Stdio MCP breaks Claude after refactoring | Low | Phase 1 regression test is mandatory. Keep old `createSdkMcpServer` code behind flag until verified. |
| R5 | Codex CLI binary not installed/wrong version | Provider fails to start | Low | Check binary existence + version at worker startup. Return clear error to user. Documented in fase_1/08. |
| R6 | Claude message format changes upstream | CodexProvider's Claude-format bridge breaks | Medium | Pin `@anthropic-ai/claude-agent-sdk` version. Bridge is thin — easy to update. Temporary solution until v2 unified format. |
| R7 | MCP tool context (workspace ID, user ID) lost in stdio migration | Tools operate without auth context | High | Env var contract (`ALIVE_WORKSPACE_ID`, `ALIVE_USER_ID`, `ALIVE_WORKSPACE_PATH`) enforced at MCP server startup. Fail fast if missing. |
| R8 | Codex CLI spawn latency too high | Perceived slowness for first query | Low | One-time cost ~200ms. Acceptable. Thread resume avoids re-spawn. |
| R9 | Codex rate limits differ from Claude | Unexpected 429 errors | Medium | Different retry config per provider. Surface rate limit errors to user. Documented in fase_2/07. |
| R10 | Feature flag complexity delays rollout | Longer timeline | Low | Simple workspace-level flag. No complex gradual rollout for v1 — just "enabled" or not per workspace. |

## Top 3 Risks to Watch

1. **R3 (env replacement)** — Most likely to cause subtle bugs. Test exhaustively.
2. **R7 (MCP context loss)** — Would break all tools silently. Fail-fast validation critical.
3. **R1 (system prompt injection)** — If --config doesn't work AND config.toml doesn't either, system prompt becomes messy. Pre-flight test is a blocker.
