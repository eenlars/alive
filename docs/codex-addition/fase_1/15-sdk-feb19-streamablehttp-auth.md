# Codex StreamableHttp Auth — Feb 19 Verification

## Source: `codex-rs/core/src/config/types.rs`

The `StreamableHttp` MCP transport variant supports:

```rust
StreamableHttp {
    url: String,
    bearer_token_env_var: Option<String>,    // env var name → Authorization: Bearer <value>
    http_headers: Option<HashMap<String, String>>,  // static headers
    env_http_headers: Option<HashMap<String, String>>,  // header name → env var name
}
```

## Three Auth Mechanisms

### 1. bearer_token_env_var
```toml
[mcp_servers.github]
url = "https://mcp.github.com"
bearer_token_env_var = "GITHUB_TOKEN"
```
Reads `GITHUB_TOKEN` from environment, sends as `Authorization: Bearer <token>`.

### 2. http_headers (static)
```toml
[mcp_servers.github]
url = "https://mcp.github.com"
http_headers = { Authorization = "Bearer ghp_xxx" }
```
⚠️ Token visible in config file on disk.

### 3. env_http_headers (env-sourced)
```toml
[mcp_servers.github]
url = "https://mcp.github.com"
env_http_headers = { Authorization = "GITHUB_AUTH_HEADER" }
```
Reads `GITHUB_AUTH_HEADER` from environment, uses as value for `Authorization` header.

## Recommendation for Alive OAuth MCP Servers

Use `bearer_token_env_var` approach:

```toml
[mcp_servers.github-oauth]
url = "https://mcp.github.com"
bearer_token_env_var = "ALIVE_OAUTH_GITHUB"
```

Then pass the token via Codex SDK `env` option:
```typescript
env: {
  ...baseEnv,
  ALIVE_OAUTH_GITHUB: oauthTokens.github,
}
```

**Benefits:**
- Token never written to disk (only in process env)
- Clean separation of config (on disk) vs secrets (in memory)
- Works with Codex's env replacement semantics (we control the env anyway)

## Impact on fase_2/30

This resolves the security concern about writing OAuth tokens to config.toml. Use env var indirection instead. Update CodexProvider to pass OAuth tokens as env vars.

## Stdio Transport env/env_vars

For stdio MCP servers:
- `env`: HashMap of key=value pairs **added** to the child process environment
- `env_vars`: List of env var names to **passthrough** from parent to child

```toml
[mcp_servers.alive-tools]
command = "node"
args = ["dist/mcp-servers/alive-tools-server.js"]
env = { ALIVE_WORKSPACE_ID = "ws_123" }
env_vars = ["PATH", "HOME", "NODE_ENV"]
```

The `env_vars` field is particularly useful — it explicitly declares which parent env vars to inherit. Combined with the SDK's env replacement, this gives fine-grained control.
