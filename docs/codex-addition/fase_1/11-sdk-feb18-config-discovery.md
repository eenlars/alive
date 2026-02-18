# Fase 1.11 — SDK Config Discovery (Feb 18, 2026)

## Critical Finding: `config` Option Enables System Message via SDK

Previous analysis (fase_2/16) concluded `system_message` cannot be passed via SDK. **This is WRONG.**

The `CodexOptions.config` field accepts arbitrary key-value pairs and flattens them into `--config key=value` CLI arguments:

```typescript
type CodexOptions = {
  config?: CodexConfigObject;  // <-- THIS
  // ...
};
```

The SDK serializes nested objects into dotted TOML paths. This means:

```typescript
const codex = new Codex({
  apiKey: "...",
  config: {
    system_message: "You are working in an Alive workspace. Follow these rules: ..."
  }
});
```

...would pass `--config system_message="You are working in an Alive workspace..."` to the CLI.

### Impact on Architecture

1. **CODEX.md file injection is NOT needed** for system prompts (if `system_message` is a valid Rust config key)
2. Config-based injection is cleaner: no file I/O, no cleanup, no race conditions
3. MCP server config can ALSO be passed via `config` option instead of writing `config.toml`

### Still To Verify

- Whether `system_message` is actually a valid key in Codex's Rust config schema
- Whether complex nested structures (like MCP server definitions) serialize correctly through this path
- Previous analysis in fase_2/16 checked the Rust config struct and did NOT find `system_message` — so this might only work for keys that exist in the schema

### Recommendation

- **For system prompt**: Test `config.system_message` first. If it works, prefer over CODEX.md. Fall back to CODEX.md if not.
- **For MCP servers**: Project-level `config.toml` (fase_2/17) is still safer for complex nested config. The `config` SDK option is better for simple key-value overrides.

### Updated fase_2/16 Status

fase_2/16's conclusion ("use CODEX.md") should be treated as **fallback**, not primary approach. Try SDK config first during implementation.
