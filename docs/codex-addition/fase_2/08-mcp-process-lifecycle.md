# Fase 2.8 — MCP Server Process Lifecycle Management

## Problem

After refactoring MCP servers to standalone stdio processes, the worker must manage their lifecycle: spawn, health-check, restart on crash, and clean shutdown. Currently Alive's in-process MCP servers have zero lifecycle — they're just function objects.

## Lifecycle States

```
        ┌──────────┐
        │  INIT    │ (not yet spawned)
        └────┬─────┘
             │ start()
        ┌────▼─────┐
        │ STARTING │ (process spawned, waiting for MCP handshake)
        └────┬─────┘
             │ initialize response received
        ┌────▼─────┐
        │  READY   │ (accepting tool calls)
        └────┬─────┘
             │ unexpected exit / broken pipe
        ┌────▼─────┐
        │ CRASHED  │ → attempt restart (max 1) → STARTING or FAILED
        └──────────┘
        ┌──────────┐
        │  FAILED  │ (permanent, tools unavailable)
        └──────────┘
```

## Design: `McpServerManager`

```typescript
// packages/worker-pool/src/mcp/server-manager.ts

interface McpServerSpec {
  name: string
  command: string[]       // e.g. ["node", "/path/to/server.js"]
  env: Record<string, string>
  startupTimeoutMs?: number  // default 10000
}

interface McpServerHandle {
  name: string
  spec: McpServerSpec
  state: "init" | "starting" | "ready" | "crashed" | "failed" | "stopped"
  process: ChildProcess | null
  restartCount: number
}

class McpServerManager {
  private servers = new Map<string, McpServerHandle>()
  
  /** Spawn all configured MCP servers. Returns names of servers that started successfully. */
  async startAll(specs: McpServerSpec[]): Promise<string[]> {
    const results = await Promise.allSettled(
      specs.map(spec => this.start(spec))
    )
    return results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map(r => r.value)
  }
  
  /** Spawn a single MCP server. */
  async start(spec: McpServerSpec): Promise<string> {
    const handle: McpServerHandle = {
      name: spec.name,
      state: "starting",
      process: null,
      restartCount: 0,
    }
    this.servers.set(spec.name, handle)
    
    handle.process = spawn(spec.command[0], spec.command.slice(1), {
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    
    handle.process.on("exit", (code, signal) => {
      if (handle.state === "ready") {
        handle.state = "crashed"
        console.error(`[mcp] ${spec.name} crashed (code=${code}, signal=${signal})`)
        this.maybeRestart(spec, handle)
      }
    })
    
    handle.process.stderr?.on("data", (data) => {
      console.error(`[mcp:${spec.name}] ${data.toString().trim()}`)
    })
    
    // Wait for process to be responsive (first line of stdout, or timeout)
    await this.waitForReady(handle, spec.startupTimeoutMs ?? 10000)
    handle.state = "ready"
    return spec.name
  }
  
  /** Kill all MCP server processes. */
  async stopAll(): Promise<void> {
    const stops = Array.from(this.servers.values()).map(h => this.stop(h))
    await Promise.allSettled(stops)
    this.servers.clear()
  }
  
  private async stop(handle: McpServerHandle): Promise<void> {
    if (!handle.process || handle.process.exitCode !== null) return
    handle.state = "stopped"
    handle.process.kill("SIGTERM")
    // Give 3s for graceful shutdown, then SIGKILL
    await Promise.race([
      new Promise<void>(r => handle.process!.on("exit", () => r())),
      new Promise<void>(r => setTimeout(() => { handle.process?.kill("SIGKILL"); r() }, 3000)),
    ])
  }
  
  private async maybeRestart(spec: McpServerSpec, handle: McpServerHandle): Promise<void> {
    if (handle.restartCount >= 1) {
      handle.state = "failed"
      console.error(`[mcp] ${spec.name} permanently failed after restart attempt`)
      return
    }
    handle.restartCount++
    try {
      await this.start(spec)
    } catch {
      handle.state = "failed"
    }
  }
  
  /** Get specs for provider config (Claude mcpServers or Codex config.mcp_servers). */
  getServerConfigs(): Record<string, { command: string[]; env: Record<string, string> }> {
    const configs: Record<string, any> = {}
    for (const [name, handle] of this.servers) {
      if (handle.state === "ready" || handle.state === "starting") {
        // Both Claude and Codex accept command+env format
        configs[name] = { command: handle.spec.command, env: handle.spec.env }
      }
    }
    return configs
  }
}
```

## Integration with Worker Entry

```javascript
// worker-entry.mjs changes:

// At worker startup (before any queries):
const mcpManager = new McpServerManager()

// Per-query:
async function handleQuery(requestId, payload) {
  // Build MCP specs from workspace config
  const mcpSpecs = [
    {
      name: "alive-tools",
      command: ["node", MCP_SERVER_PATHS["alive-tools"]],
      env: { WORKSPACE_ID: payload.workspaceId, WORKSPACE_DIR: payload.cwd, ... }
    },
    {
      name: "alive-workspace",
      command: ["node", MCP_SERVER_PATHS["alive-workspace"]],
      env: { ... }
    },
    // Conditionally: alive-email
  ]
  
  const readyServers = await mcpManager.startAll(mcpSpecs)
  
  // Pass to provider
  const provider = getProvider(payload.provider || "claude")
  const providerConfig = {
    ...buildConfig(payload),
    mcpServers: readyServers.map(name => ({
      name,
      command: mcpSpecs.find(s => s.name === name).command,
      env: mcpSpecs.find(s => s.name === name).env,
    }))
  }
  
  try {
    for await (const event of provider.query(providerConfig)) {
      ipc.send(mapEventToIpc(event, requestId))
    }
  } finally {
    await mcpManager.stopAll()
  }
}
```

## Key Decision: Per-Query vs Per-Worker MCP Servers

**Option A: Per-query** (spawn on each query, kill after)
- Pros: Clean state, no stale connections, simple env isolation
- Cons: ~100-500ms startup cost per query

**Option B: Per-worker** (spawn once, reuse across queries)
- Pros: No startup latency after first query
- Cons: Must handle env changes between queries (different workspace IDs), state leaks

**Recommendation: Per-query for v1.** The startup cost is acceptable (~200ms for a Node.js process). State isolation is more important than latency. Can optimize to per-worker later with env-change detection.

## Handling MCP for Both Providers

The `McpServerManager` returns command+env specs. These map to each provider differently:

```typescript
// Claude SDK:
mcpServers: {
  "alive-tools": {
    command: "node",
    args: ["/path/to/alive-tools/dist/index.js"],
    env: { WORKSPACE_ID: "abc" }
  }
}

// Codex SDK (via config):
config: {
  mcp_servers: {
    "alive-tools": {
      command: ["node", "/path/to/alive-tools/dist/index.js"],
      env: { WORKSPACE_ID: "abc" }
    }
  }
}
```

**Important:** Claude SDK may spawn MCP servers itself OR expect them pre-spawned. Need to verify which. If Claude SDK spawns them, we DON'T pre-spawn — just pass the specs. If Codex SDK spawns them, same.

Actually, **both SDKs spawn MCP servers themselves** via the command config. The `McpServerManager` may not be needed if both SDKs handle stdio server lifecycle internally. 

Revised approach: **Don't manage MCP server processes manually. Just pass command+env specs to the provider SDK.** Both Claude and Codex SDKs will spawn/kill stdio servers as needed.

The `McpServerManager` is only needed if:
1. We want shared MCP servers across providers (unlikely for v1)
2. We want pre-warming (latency optimization, future)
3. We need to handle servers that neither SDK manages (custom lifecycle)

## Revised Recommendation

**v1: Pass specs, let SDKs manage.** Only build `McpServerManager` if we hit problems with SDK-managed servers (crashes, leaks, etc.).

```typescript
// Simple approach:
function buildMcpSpecs(payload: QueryPayload): McpServerDef[] {
  return [
    {
      name: "alive-tools",
      command: ["node", MCP_SERVER_PATHS["alive-tools"]],
      env: { WORKSPACE_ID: payload.workspaceId, ... }
    },
    // ...
  ]
}
// Pass directly to provider, each SDK spawns its own
```
