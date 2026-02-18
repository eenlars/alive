# Environment Variable Passthrough — Complete Specification

## The Problem

Codex SDK's `env` option REPLACES `process.env`. If we use `env` (which we must, for isolation), we need to explicitly pass every variable the Codex CLI and its child processes need.

## Required Environment Variables

### Category 1: System (always needed)

```typescript
const SYSTEM_ENV = {
  PATH: process.env.PATH,
  HOME: codexHome,                    // per-workspace isolation
  CODEX_HOME: codexHome,              // Codex session storage
  TMPDIR: `/tmp/alive-codex-${workspaceId}`,
  LANG: "en_US.UTF-8",
  TERM: "xterm-256color",             // for CLI tools that check TERM
  NODE_ENV: process.env.NODE_ENV ?? "production",
};
```

### Category 2: Auth (injected by SDK, but listed for clarity)

```typescript
// These are set by the SDK itself from CodexOptions:
// CODEX_API_KEY = apiKey
// OPENAI_BASE_URL = baseUrl (if provided)
// CODEX_INTERNAL_ORIGINATOR_OVERRIDE = "codex_sdk_ts"
```

### Category 3: MCP Server Context (for Alive's MCP servers)

```typescript
const MCP_ENV = {
  ALIVE_WORKSPACE_ID: workspaceId,
  ALIVE_USER_ID: userId,
  ALIVE_WORKSPACE_PATH: workspacePath,
  ALIVE_API_URL: internalApiUrl,      // for MCP servers that call Alive's API
  ALIVE_MCP_TOKEN: mcpAuthToken,      // auth token for MCP→API calls
};
```

### Category 4: Tool-Specific (optional)

```typescript
const TOOL_ENV = {
  // Git
  GIT_AUTHOR_NAME: userName,
  GIT_AUTHOR_EMAIL: userEmail,
  GIT_COMMITTER_NAME: userName,
  GIT_COMMITTER_EMAIL: userEmail,
  // Node
  NODE_PATH: nodeModulesPath,
};
```

## Complete Builder

```typescript
function buildCodexEnv(options: {
  workspaceId: string;
  userId: string;
  workspacePath: string;
  codexHome: string;
  userName?: string;
  userEmail?: string;
}): Record<string, string> {
  return {
    // System
    PATH: process.env.PATH!,
    HOME: options.codexHome,
    CODEX_HOME: options.codexHome,
    TMPDIR: `/tmp/alive-codex-${options.workspaceId}`,
    LANG: "en_US.UTF-8",
    TERM: "xterm-256color",
    NODE_ENV: process.env.NODE_ENV ?? "production",
    
    // MCP context
    ALIVE_WORKSPACE_ID: options.workspaceId,
    ALIVE_USER_ID: options.userId,
    ALIVE_WORKSPACE_PATH: options.workspacePath,
    
    // Git (optional)
    ...(options.userName && {
      GIT_AUTHOR_NAME: options.userName,
      GIT_COMMITTER_NAME: options.userName,
    }),
    ...(options.userEmail && {
      GIT_AUTHOR_EMAIL: options.userEmail,
      GIT_COMMITTER_EMAIL: options.userEmail,
    }),
  };
}
```

## MCP Server `env` in config.toml

MCP servers defined in `.codex/config.toml` also have an `env` field. Based on exec.ts, the Codex CLI spawns MCP servers as child processes inheriting the CLI's env. The `env` field in config.toml adds/overrides on top.

```toml
[mcp_servers.alive-tools]
command = "node"
args = ["packages/tools/dist/mcp-servers/alive-tools-server.js"]
env = { ALIVE_EXTRA_CONTEXT = "value" }
# This ADDS to the CLI's env, not replaces
```

## Security Considerations

1. **No process.env leak**: By explicitly building env, we prevent leaking server secrets (DB passwords, etc.) to Codex
2. **No API key cross-contamination**: Codex gets CODEX_API_KEY only, not Anthropic keys
3. **Per-workspace isolation**: Different CODEX_HOME per workspace prevents session cross-read
4. **TMPDIR isolation**: Prevents temp file conflicts between workspaces
