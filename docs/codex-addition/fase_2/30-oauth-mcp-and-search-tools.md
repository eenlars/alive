# OAuth MCP Servers & Search Tools — Multi-Provider Considerations

## Current Architecture

Alive has three categories of MCP servers:

### 1. Internal SDK MCP Servers (in-process, Claude-specific)
- `workspaceInternalMcp` — workspace file operations (6 tools)
- `toolsInternalMcp` — general tools (10 tools)
- `emailInternalMcp` — email tools (2 tools, optional)

These use `createSdkMcpServer()` which returns function objects. **Cannot work with Codex.**

### 2. Global HTTP MCP Servers
```javascript
// From GLOBAL_MCP_PROVIDERS in @webalive/shared
{ type: "http", url: "https://some-server.example.com/mcp" }
```
These are HTTP-based, always available. **Should work with Codex** if Codex supports HTTP MCP (it does — `StreamableHttp` transport).

### 3. OAuth MCP Servers (user-connected, HTTP)
```javascript
// Passed via IPC payload.oauthMcpServers
{ "provider-name": { type: "http", url: "...", headers: { Authorization: "Bearer ..." } } }
```
User-connected services (e.g., GitHub, Slack). HTTP-based with auth headers.

## Codex Compatibility Matrix

| Category | Claude SDK | Codex SDK | Migration Needed |
|---|---|---|---|
| Internal (in-process) | ✅ createSdkMcpServer | ❌ No in-process support | YES — must become stdio |
| Global HTTP | ✅ { type: "http" } | ✅ StreamableHttp transport | Config format translation |
| OAuth HTTP | ✅ { type: "http", headers } | ⚠️ StreamableHttp with `headers` | Verify headers support |

## withSearchToolsConnectedProviders

This wrapper from `@webalive/tools` sets up search-related tools based on which OAuth providers the user has connected. It's called around the entire query execution.

```javascript
await withSearchToolsConnectedProviders(connectedProviders, async () => {
  // query() runs inside this context
});
```

**For Codex**: This wrapper likely sets AsyncLocalStorage or module-level state that the internal MCP tools read. Once MCP servers are standalone stdio processes, this context won't propagate.

**Solution**: Pass `connectedProviders` as an env var to MCP server processes:
```
ALIVE_CONNECTED_PROVIDERS=github,slack
```
The MCP server reads this on startup and enables/disables search tools accordingly.

## Global HTTP MCP → Codex config.toml

Claude SDK format:
```javascript
{ "server-name": { type: "http", url: "https://example.com/mcp" } }
```

Codex config.toml format:
```toml
[mcp_servers.server-name]
type = "streamable_http"  
url = "https://example.com/mcp"
```

Translation is straightforward.

## OAuth HTTP MCP → Codex config.toml

Claude SDK format:
```javascript
{ "github": { type: "http", url: "https://mcp.github.com", headers: { Authorization: "Bearer tok_xxx" } } }
```

Codex config.toml format:
```toml
[mcp_servers.github]
type = "streamable_http"
url = "https://mcp.github.com"

[mcp_servers.github.headers]
Authorization = "Bearer tok_xxx"
```

**⚠️ Security concern**: Writing OAuth tokens to a config.toml file on disk (even temporarily) is riskier than passing them in-memory. Consider:
1. Write config.toml with restrictive permissions (0600)
2. Clean up config.toml after query completes
3. Or: use env var interpolation if Codex supports it (needs verification)

## Action Items

1. **Verify Codex StreamableHttp supports custom headers** — check Rust MCP client code
2. **Design env var propagation for connectedProviders** to standalone MCP servers
3. **Assess security of writing OAuth tokens to config.toml** — consider alternatives
4. **Map GLOBAL_MCP_PROVIDERS to Codex config format** — create helper function
