# System Message via SDK config — Resolution

## Summary
The `CodexOptions.config` field flattens arbitrary config keys to `--config key=value` CLI args. This means we CAN pass system messages via SDK:

```typescript
const codex = new Codex({
  apiKey: "...",
  config: {
    system_message: "You are an Alive workspace agent. Follow these rules: ..."
  }
});
```

This serializes to: `codex exec --experimental-json --config system_message="You are an Alive workspace agent..."`.

## Verification needed
Whether the Codex Rust binary actually accepts `system_message` as a config key is still unverified. The Rust config schema (`codex-rs/config/`) needs to be checked.

## Strategy update
**v1**: Use BOTH approaches for robustness:
1. Write `CODEX.md` in workspace dir (guaranteed to work — Codex reads it like Claude reads CLAUDE.md)
2. Also pass `config.system_message` (if Rust accepts it, this takes priority and is cleaner)

**v2**: Once runtime-tested, drop the file approach if config works.

## Impact on CodexProvider implementation
```typescript
class CodexProvider implements AgentProvider {
  async startSession(options: SessionOptions): Promise<AgentSession> {
    // Write CODEX.md as fallback
    await writeFile(
      path.join(options.workingDirectory, 'CODEX.md'),
      options.systemPrompt
    );

    const thread = this.codex.startThread({
      workingDirectory: options.workingDirectory,
      sandboxMode: this.mapPermissions(options.permissions),
      approvalPolicy: "never",
    });

    return new CodexSession(thread);
  }
}
```

The `system_message` via config is cleaner because:
- No file creation/cleanup needed
- No risk of user overwriting CODEX.md
- Applies immediately without file read timing issues

## Supersedes
- fase_2/12 (system prompt injection) — partially superseded, CODEX.md approach still valid as fallback
- fase_2/16 (system message not in config) — **CORRECTED**: config mechanism exists, Rust acceptance TBD
