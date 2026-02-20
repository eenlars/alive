# Concurrency & Worker Pool Considerations

## Current Architecture

Alive uses a worker pool (`packages/worker-pool/src/manager.ts`) that spawns worker processes. Each worker handles one query at a time. The manager routes incoming queries to available workers.

## Codex Impact on Worker Pool

### Process Model Difference

- **Claude**: SDK runs in-process within the worker. One worker = one Claude session.
- **Codex**: SDK spawns a child process (`codex exec`). One worker = one Codex CLI subprocess.

This means each Codex query creates a **3-level process tree**:
```
Manager → Worker (Node.js) → Codex CLI (Rust binary)
```

### Resource Implications

| Resource | Claude | Codex |
|----------|--------|-------|
| Processes per query | 1 (worker) | 2 (worker + CLI) |
| Memory per query | ~100MB (Node + SDK) | ~100MB (Node) + ~50MB (Rust CLI) |
| File descriptors | stdin/stdout to manager | + stdin/stdout/stderr to CLI |
| Startup latency | ~0ms (in-process) | ~100-500ms (spawn + init) |

### Worker Pool Size

No changes needed for v1. The worker pool already manages concurrency. The extra child process per Codex query is lightweight.

If scaling becomes an issue: Codex workers could have a smaller pool max since each uses more memory.

## Concurrent MCP Servers

Each Codex CLI instance spawns its own MCP server processes (from `.codex/config.toml`). With 3 MCP servers per workspace and N concurrent queries:

```
Total MCP processes = N_codex_queries × 3
```

For 10 concurrent Codex queries = 30 MCP server processes. This is fine for a server but worth monitoring.

### MCP Server Startup Time

MCP servers are Node.js processes. Startup time ~200-500ms each. This adds to the per-query latency but only on first tool call (Codex likely spawns them on demand, not upfront).

## Rate Limits (OpenAI)

OpenAI rate limits are per-API-key, not per-connection. All Codex queries share the same rate limit pool.

| Tier | RPM | TPM |
|------|-----|-----|
| Tier 1 | 500 | 200K |
| Tier 3 | 5,000 | 800K |
| Tier 5 | 10,000 | 10M |

For Alive: with a single server-side API key, all users share these limits. This is a potential scaling bottleneck.

### Mitigation (v2)
- Track per-workspace usage and enforce soft limits
- Queue system for requests when approaching rate limit
- Consider per-user API keys as a premium feature

## Cleanup

When a worker is killed (timeout, crash, shutdown):
1. Worker process dies
2. Codex CLI child process should die (orphan cleanup by OS)
3. MCP server child processes of Codex should die (orphan cleanup)

**Risk**: Zombie processes if signals aren't propagated. The SDK's `exec.ts` does call `child.kill()` in the finally block, but only if the generator is properly closed.

### Safety Net

```typescript
// In worker shutdown handler
process.on('SIGTERM', () => {
  // Kill all child processes in our process group
  process.kill(-process.pid, 'SIGTERM');
});
```

Or use `prctl(PR_SET_PDEATHSIG)` on Linux to auto-kill children when parent dies (Node.js doesn't expose this directly, but the Codex CLI's Rust runtime might handle it).

## Recommendations for v1

1. No worker pool changes needed
2. Monitor process count and memory usage per provider
3. Add `provider` tag to worker pool metrics
4. Set a reasonable timeout for Codex queries (same as Claude, ~5 min default)
5. Ensure worker shutdown kills the Codex CLI subprocess cleanly
