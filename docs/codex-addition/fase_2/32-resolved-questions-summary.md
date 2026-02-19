# Resolved Questions Summary — Feb 19

## Questions Resolved This Iteration

### Q: How do OAuth MCP servers work with Codex?
**A:** Use `bearer_token_env_var` in config.toml + pass tokens via SDK `env` option. Tokens never touch disk. See fase_1/15.

### Q: Does Codex StreamableHttp support custom headers?
**A:** Yes — three mechanisms: `bearer_token_env_var`, `http_headers` (static), `env_http_headers` (from env). See fase_1/15.

### Q: How does `env_vars` passthrough interact with `env` replacement in MCP server config?
**A:** `env_vars` is a stdio-only field that names specific parent env vars to inherit. `env` adds key=value pairs to child env. They complement each other. The SDK-level `env` replaces process.env for the Codex CLI itself; then MCP servers spawned by Codex inherit from the CLI's env, with `env`/`env_vars` in config.toml controlling what gets added/passed through.

### Q: Can `CODEX_HOME` be set to a per-workspace path without breaking Codex binary resolution?
**A:** Yes — `CODEX_HOME` controls config/session storage, not binary location. The binary is resolved from `codexPathOverride` or PATH. Setting `CODEX_HOME=/var/lib/alive-codex/ws_123` isolates sessions without affecting the CLI binary.

### Q: Should the frontend be updated for v1?
**A:** No — use Claude-compatible message format from CodexProvider. Zero frontend changes for v1. See fase_2/29 and fase_2/31.

## Still Open (Non-Blocking)

1. **Does `developer_instructions` work via `--config` CLI flag?** — Runtime test needed (fase_3/05 test 1). Fallback: write to config.toml.
2. **Does Codex's Linux seccomp sandbox conflict with Node.js MCP servers?** — Use `danger-full-access` for v1, revisit for v2.
3. **Does `skipGitRepoCheck` fully bypass git requirement?** — Likely yes based on flag name, but needs runtime verification.
4. **How does Codex handle abort mid-MCP-call?** — AbortSignal kills the CLI process; MCP servers are child processes of CLI, so they get SIGTERM. Needs verification.
