# Fase 2.14 — Environment Isolation for Codex Provider

## Critical: `env` Replaces process.env

When `CodexOptions.env` is provided, the SDK does NOT merge with `process.env`. It passes `env` directly to `spawn()`. This means we must explicitly pass every env var the Codex CLI and MCP servers need.

## Required Environment Variables

### For Codex CLI itself
```typescript
const codexEnv: Record<string, string> = {
  // System essentials
  HOME: workspaceHome,            // ~/.codex/ sessions stored here
  PATH: process.env.PATH!,       // find system binaries
  TMPDIR: workspaceTmp,           // temp files
  LANG: "en_US.UTF-8",           // locale
  TERM: "dumb",                  // no TTY

  // Codex auth (set by SDK from apiKey option, but explicit if needed)
  // CODEX_API_KEY: apiKey,       // SDK handles this

  // Alive workspace context (for CODEX.md / MCP servers)
  WORKSPACE_ID: workspaceId,
  WORKSPACE_DIR: workspaceCwd,
  USER_ID: userId,
}
```

### For MCP servers spawned by Codex
MCP servers inherit the Codex process's env. But Codex spawns MCP servers as child processes with the env from `config.mcp_servers.<name>.env`. These env vars are MERGED with the parent env.

```typescript
config: {
  mcp_servers: {
    "alive-tools": {
      command: ["node", "/path/to/alive-tools-mcp.js"],
      env: {
        WORKSPACE_ID: workspaceId,
        WORKSPACE_DIR: workspaceCwd,
        // These are added ON TOP of the codex process env
      }
    }
  }
}
```

**Key insight:** MCP server `env` in config is additive, not replacing. So system PATH etc. from the parent Codex process are inherited. Only the explicitly set vars are added/overridden.

## Alive's Current Env Isolation

Alive already has `prepareRequestEnv()` in `packages/worker-pool/dist/env-isolation.js` that builds a clean env for Claude queries. We should reuse this:

```typescript
// In CodexProvider:
const baseEnv = prepareRequestEnv(payload)
// Add Codex-specific vars
const codexEnv = {
  ...baseEnv,
  // Ensure no ANTHROPIC_API_KEY leaks to Codex
  ANTHROPIC_API_KEY: undefined,
}
```

## Security: API Key Isolation

**Critical:** When running Codex, the Anthropic API key must NOT be in the environment. Vice versa for Claude.

```typescript
// ClaudeProvider
env.ANTHROPIC_API_KEY = config.apiKey
delete env.CODEX_API_KEY
delete env.OPENAI_API_KEY

// CodexProvider  
// SDK sets CODEX_API_KEY internally
delete env.ANTHROPIC_API_KEY
```

Since we use the `env` override (which replaces process.env), this is naturally safe — we only include what we explicitly set. But worth being explicit about.

## Codex Session Directory

Codex stores sessions in `$HOME/.codex/sessions/`. With Alive's per-workspace HOME:

```
/var/lib/claude-sessions/<workspace-key>/
├── .claude/          # Claude sessions (existing)
└── .codex/
    ├── sessions/     # Codex thread persistence
    └── config.toml   # (not used — we pass config via SDK)
```

Both providers get their own namespaced directories under the same workspace home. No conflict.
