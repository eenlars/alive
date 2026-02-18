# Codex Network & Sandbox — Interaction with Alive

## Discovery

The Codex Rust config includes a sophisticated network proxy system:

```rust
struct NetworkConstraints {
    enabled: Option<bool>,
    http_port: Option<u16>,
    socks_port: Option<u16>,
    allow_upstream_proxy: Option<bool>,
    allowed_domains: Option<Vec<String>>,
    denied_domains: Option<Vec<String>>,
    allow_unix_sockets: Option<Vec<String>>,
    allow_local_binding: Option<bool>,
}
```

And sandbox modes:
- `read-only` — can read filesystem, no writes
- `workspace-write` — can write to workspace dir + network proxy
- `danger-full-access` — unrestricted
- `external-sandbox` — programmatic only (not in config.toml)

## Potential Conflicts with Alive

### 1. Network Proxy
Codex in `workspace-write` mode spawns a local HTTP/SOCKS proxy and routes all child process traffic through it. This could conflict with:
- Alive's own networking (API calls from MCP servers)
- Container networking if Alive runs in Docker

**Mitigation**: Use `danger-full-access` sandbox mode for v1. Alive already handles security via its own UID/GID privilege drop and container isolation.

### 2. Filesystem Sandbox (Linux)
Codex uses `codex-linux-sandbox` (seccomp-based) for `read-only` and `workspace-write` modes. This:
- Restricts syscalls
- Mounts workspace as read-write, rest as read-only
- Could conflict with Alive's MCP server processes reading shared packages

**Mitigation**: Use `danger-full-access` for v1. Alive's container isolation is the security boundary, not Codex's sandbox.

### 3. `networkAccessEnabled` Thread Option
The SDK exposes `networkAccessEnabled` which maps to `--config sandbox_workspace_write.network_access=true/false`. This only applies in `workspace-write` mode.

For `danger-full-access`: network is always available. No conflict.

## Recommendation

For Alive v1:
```typescript
const thread = codex.startThread({
  sandboxMode: "danger-full-access",
  approvalPolicy: "never",
  skipGitRepoCheck: true,  // Alive workspaces aren't git repos
});
```

For Alive v2 (security hardening):
- Investigate `workspace-write` with `additionalDirectories` pointing to shared packages
- Configure `allowed_domains` for API access
- Test seccomp sandbox compatibility with Node.js MCP servers

## additionalDirectories

```typescript
const thread = codex.startThread({
  sandboxMode: "workspace-write",
  additionalDirectories: [
    "/opt/alive/packages/mcp-servers",  // MCP server code
    "/opt/alive/node_modules",          // shared deps
  ],
  networkAccessEnabled: true,
});
```

This MIGHT work for v2 but needs thorough testing. The seccomp sandbox may not play well with Node.js's fs operations.
