# Fase 2.5 — System Prompts, Provider Limitations & Feature Parity

## System Prompts

### Claude
Alive injects a custom `systemPrompt` via the SDK:
```typescript
query({ prompt, options: { systemPrompt: "..." } })
```
This fully replaces Claude's default system prompt. Alive uses this for:
- Workspace context (project name, tech stack, user preferences)
- Tool usage instructions
- Persona/workflow guidance
- Automation-specific prompts

### Codex
The TypeScript SDK has **no system prompt option**. The Codex CLI uses its own hardcoded system prompt.

**Workaround options:**
1. **Prepend to user prompt**: `"[System instructions: ...]\n\nUser prompt: ..."` — hacky but works
2. **config.toml `system_message`**: Check if Codex CLI supports this config key
3. **CODEX.md file**: Codex reads project-level `CODEX.md` for instructions (like Claude's `CLAUDE.md`)
4. **Accept the limitation**: Codex workspaces use Codex's default system prompt + CODEX.md for project context

**Recommendation for v1:** Use `CODEX.md` file approach. When a workspace selects Codex, write workspace context to `CODEX.md` in the workspace directory. Codex reads this automatically.

```typescript
// In CodexProvider, before starting thread:
if (config.systemPrompt) {
  const codexMdPath = path.join(config.cwd, "CODEX.md");
  await fs.writeFile(codexMdPath, config.systemPrompt);
}
```

## Feature Parity Matrix

| Feature | Claude | Codex | Notes |
|---------|--------|-------|-------|
| Custom system prompt | ✅ Full control | ⚠️ Via CODEX.md only | See above |
| Tool allowlist | ✅ `allowedTools` | ❌ Not supported | Codex uses all available tools |
| Tool denylist | ✅ `disallowedTools` | ❌ Not supported | |
| Per-tool approval | ✅ `canUseTool` callback | ❌ Only `approvalPolicy` | Global policy, not per-tool |
| Max turns | ✅ `maxTurns` | ❌ Not supported | Codex decides when to stop |
| Session resume | ✅ session ID | ✅ thread ID | Both supported |
| MCP servers (stdio) | ✅ | ✅ via config | Same protocol |
| MCP servers (HTTP) | ✅ | ✅ via config | Same protocol |
| Structured output | ❌ | ✅ `outputSchema` | Codex-only feature |
| Image input | ✅ (via messages) | ✅ `local_image` | Both supported |
| Web search | ❌ (via MCP only) | ✅ built-in | Codex has native web search |
| Reasoning/thinking | ✅ extended thinking | ✅ `reasoning` items | Both show reasoning |
| Todo/plan display | ❌ | ✅ `todo_list` items | Codex-only feature |
| Abort/cancel | ✅ AbortSignal | ✅ AbortSignal | Both supported |
| Network sandbox | ✅ (via UID isolation) | ✅ `networkAccessEnabled` | Different mechanisms |
| File sandbox | ✅ (via UID isolation) | ✅ `sandboxMode` | Different mechanisms |
| Additional directories | ❌ | ✅ `additionalDirectories` | Codex can access dirs outside cwd |
| Model reasoning effort | ❌ | ✅ `modelReasoningEffort` | Codex-only tuning |

## Limitations to Document for Users

When a user selects Codex as their workspace provider, they should understand:

1. **All tools auto-approved** — Codex workspaces run in full-auto mode. No per-tool permission prompts.
2. **No tool restrictions** — Cannot limit which tools the agent uses.
3. **Different models available** — Codex uses OpenAI models (GPT-5.1, o3, etc.), not Anthropic models.
4. **Built-in web search** — Codex can search the web natively (if enabled).
5. **Project context via CODEX.md** — Instead of system prompt injection, Codex reads `CODEX.md` in the project root.

## Billing / Usage Display

### Claude
- Tokens reported via `result` event (not always granular)
- Billed through Anthropic OAuth or API key
- Alive doesn't currently show per-query cost

### Codex
- Tokens reported via `turn.completed` event: `{ input_tokens, cached_input_tokens, output_tokens }`
- Billed through OpenAI API key
- Same display — no per-query cost needed for v1

### Mixed-Provider Billing
If a workspace switches providers mid-conversation, usage stats should be tracked separately:
```typescript
usage: {
  claude: { inputTokens: 5000, outputTokens: 2000 },
  codex: { inputTokens: 3000, outputTokens: 1500 }
}
```

For v1: just show total tokens per stream. Provider-specific breakdown is nice-to-have.

## Sandbox Model Differences

### Claude (current Alive approach)
- Worker drops privileges to workspace UID/GID after startup
- Agent runs in-process with limited filesystem access
- No network isolation (relies on UID-level firewall rules, if any)

### Codex
- CLI has built-in sandbox modes:
  - `read-only` — can only read files
  - `workspace-write` — can write within workspace directory only
  - `danger-full-access` — unrestricted
- Network access configurable via `networkAccessEnabled`
- Sandbox is enforced by the Codex CLI binary (Rust-level sandboxing on Linux)

### For Alive
- Keep UID/GID privilege drop for both providers (defense in depth)
- For Codex, additionally set `sandboxMode: "workspace-write"` as default
- Map Alive's permission modes:
  - `bypassPermissions` → `sandboxMode: "danger-full-access"`, `approvalPolicy: "never"`
  - `plan` → `sandboxMode: "read-only"`, `approvalPolicy: "never"`
  - `normal` → `sandboxMode: "workspace-write"`, `approvalPolicy: "never"` (no interactive approval via SDK)
