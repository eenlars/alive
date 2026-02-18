# Fase 2.21 — Concrete API Call Mapping

## Side-by-Side: Alive's Current `query()` Call vs Codex `Thread.runStreamed()`

This document maps the exact arguments used in `worker-entry.mjs` line ~730 to their Codex equivalents.

## Current Claude Call (worker-entry.mjs)

```javascript
const agentQuery = query({
  prompt: payload.prompt,
  abortController,
  options: {
    maxTurns: payload.maxTurns || 100,
    allowedTools: toolsAllowed,
    systemPrompt: payload.systemPrompt,
    canUseTool,                    // permission callback
    mcpServers,                    // in-process MCP server objects
    model: "claude-sonnet-4-20250514",
  },
  sessionDir,                     // resume via directory
});
```

## Equivalent Codex Call

```typescript
const codex = new Codex({
  apiKey: process.env.CODEX_API_KEY,
  env: isolatedEnv,                // replaces process.env entirely
  config: {
    system_message: payload.systemPrompt,  // IF this config key works
  },
});

const thread = threadId
  ? codex.resumeThread(threadId, threadOptions)
  : codex.startThread(threadOptions);

const threadOptions: ThreadOptions = {
  model: "o4-mini",                // or configurable
  sandboxMode: "workspace-write",  // maps from Alive's permission model
  workingDirectory: workspacePath,
  skipGitRepoCheck: true,          // Alive workspaces aren't git repos
  approvalPolicy: "never",        // auto-approve (matches bypassPermissions)
  networkAccessEnabled: true,      // workspace may need network
  // MCP servers configured via .codex/config.toml in workspace
};

const { events } = await thread.runStreamed(payload.prompt, {
  signal: abortController.signal,
});

for await (const event of events) {
  // normalize and send via IPC
}
```

## Parameter Mapping Table

| Alive concept | Claude SDK | Codex SDK | Notes |
|---|---|---|---|
| Prompt | `prompt` | `thread.runStreamed(input)` | Direct |
| System prompt | `options.systemPrompt` | `config.system_message` or CODEX.md | See fase_1/11 |
| Max turns | `options.maxTurns` | ❌ Not available | Codex runs until done |
| Tool permissions | `options.canUseTool` callback | `approvalPolicy` enum | No per-tool control in Codex |
| Allowed tools | `options.allowedTools` | ❌ Not available | Codex uses all available tools |
| MCP servers | `options.mcpServers` (in-process) | `.codex/config.toml` [mcp_servers] | Different config mechanism |
| Model | `options.model` | `threadOptions.model` | Direct |
| Session resume | `sessionDir` path | `codex.resumeThread(threadId)` | See fase_2/20 |
| Abort | `abortController` | `turnOptions.signal` | Both use AbortSignal |
| Working directory | Via session dir | `threadOptions.workingDirectory` | Direct |

## Missing Codex Equivalents (Alive must handle)

1. **`maxTurns`** — Codex has no turn limit. Alive must implement a timeout or token budget externally.
2. **`canUseTool`** — No per-tool approval. All-or-nothing via `approvalPolicy`. For v1, use `"never"` (auto-approve all).
3. **`allowedTools`** — Can't restrict which tools Codex uses. MCP server config is the only lever (don't expose tools you don't want used).

## Codex-Only Features (Claude doesn't have)

1. **`sandboxMode`** — `"read-only"` | `"workspace-write"` | `"danger-full-access"`. Maps well to Alive's permission tiers.
2. **`modelReasoningEffort`** — `"minimal"` to `"xhigh"`. Could expose in workspace settings.
3. **`webSearchMode`** — Built-in web search. Claude relies on MCP tool for this.
4. **`outputSchema`** — Structured output. Useful for future Alive features (structured task results).
5. **`additionalDirectories`** — Read-only access to dirs outside workspace. Could expose shared packages.
6. **`networkAccessEnabled`** — Explicit network toggle.

## Event Stream Comparison

Both emit async iterables. See fase_1/06 for full event type mapping.

### Claude yields message objects directly:
```javascript
for await (const message of agentQuery) {
  // message has .type, .content, etc.
}
```

### Codex yields ThreadEvent objects:
```javascript
for await (const event of events) {
  // event.type is "thread.started" | "turn.started" | "item.started" | etc.
  // Items carry the actual content (agent_message, command_execution, file_change, etc.)
}
```

The normalizer (fase_1/06) maps both to `AgentEvent`.
