# Fase 2.16 — Codex System Message via Config

## Question
Can we pass a system prompt to Codex via `--config system_message="..."` instead of writing a CODEX.md file?

## Analysis

### SDK Config Override Path
The SDK serializes `config` option → `--config key=value` CLI args → Codex CLI parses as TOML overrides → merged into `Config` struct.

The Rust config module (`codex-rs/config/`) loads config from:
1. System requirements (managed config)
2. User `config.toml` (~/.codex/config.toml)
3. Project `.codex/config.toml`
4. CLI `--config` overrides (highest priority)

### Does `system_message` exist as a config key?

From `codex-rs/config/src/config_requirements.rs`:
- `approval_policy` ✅
- `sandbox_mode` ✅  
- `web_search` ✅
- `mcp_servers` ✅
- `system_message` — **NOT in requirements config**

Need to check the main `Config` struct / user-facing TOML schema. The config overrides are TOML key-value pairs merged into the config. If `system_message` is a valid TOML key in the config schema, it works.

### Evidence from CLI
The Codex CLI docs mention:
- `AGENTS.md` / `CODEX.md` files as the primary instruction mechanism
- `--config` for TOML overrides
- No explicit mention of `system_message` config key

### SDK `config` option
```typescript
new Codex({
  config: {
    system_message: "You are working in Alive workspace..."
  }
})
```
This would produce: `--config system_message="You are working in Alive workspace..."`

If the Rust parser doesn't recognize `system_message`, it would either:
- Ignore it silently
- Error out

**Verdict: LIKELY NOT SUPPORTED as a config key.** The Codex approach is file-based (CODEX.md, AGENTS.md) not config-based for system prompts.

## Recommended Approach for Alive

### v1: CODEX.md file injection
Before spawning Codex, write a `CODEX.md` file to the workspace root:
```typescript
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

async function injectCodexPrompt(workspacePath: string, prompt: string) {
  const codexMdPath = path.join(workspacePath, 'CODEX.md');
  const existingContent = await readFile(codexMdPath, 'utf-8').catch((err) => {
    if (err.code === 'ENOENT') return '';
    throw err;
  });
  const aliveHeader = '<!-- alive-system-prompt -->';
  
  if (existingContent.includes(aliveHeader)) {
    // Already injected, update
    const updated = existingContent.replace(
      /<!-- alive-system-prompt -->[\s\S]*?<!-- end-alive-system-prompt -->/,
      `${aliveHeader}\n${prompt}\n<!-- end-alive-system-prompt -->`
    );
    await writeFile(codexMdPath, updated);
  } else {
    // Prepend
    await writeFile(codexMdPath, `${aliveHeader}\n${prompt}\n<!-- end-alive-system-prompt -->\n\n${existingContent}`);
  }
}
```

### v2: Investigate `instructions` config key
If Codex adds a config key for runtime instructions, switch to that. Monitor Codex releases.

### Thread resume behavior
**OPEN**: Does Codex re-read CODEX.md on `resume`? If not, the system prompt only applies to new threads. For Alive this is acceptable since the prompt is workspace-level (doesn't change between turns).

## Impact on Provider Interface

The `ProviderConfig.systemPrompt` field maps differently per provider:
- **Claude**: Passed directly as `systemPrompt` option to SDK
- **Codex**: Written to `CODEX.md` before session start

This difference is encapsulated inside each provider implementation — the caller doesn't need to know.
