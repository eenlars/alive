# Fase 2.7 — Error Handling & Recovery Patterns

## Problem

Multi-provider introduces new failure modes. Each provider fails differently, and the worker must handle all of them gracefully without leaking provider-specific details to the user.

## Error Categories

### 1. Auth Errors

| Provider | Error Signal | Example |
|----------|-------------|---------|
| Claude | SDK throws `AuthenticationError` or 401 in stream | Invalid API key, expired OAuth token |
| Codex | CLI exits with code 1, stderr contains "authentication" | Invalid OPENAI_API_KEY, expired key |

**Unified handling:**
```typescript
interface ProviderAuthError {
  provider: "claude" | "codex"
  message: string  // User-facing: "Your OpenAI API key is invalid or expired"
  recoverable: boolean  // true = can retry with new key, false = needs re-auth
}
```

**Recovery flow:**
1. Detect auth error in provider adapter
2. Emit `AgentEvent { type: "error", error: "auth_failed", diagnostics: { provider, recoverable } }`
3. Worker sends IPC error with `authError: true`
4. Frontend shows "Update your API key in workspace settings" (not raw error)

### 2. Rate Limit / Quota Errors

| Provider | Error Signal | Retry-After |
|----------|-------------|-------------|
| Claude | `RateLimitError` / 429 | `retry-after` header |
| Codex | CLI stderr "rate limit", exit code 1 | May include retry info |

**Strategy:** Exponential backoff with max 3 retries at the provider level.

```typescript
// In AgentProvider.query() wrapper:
async *queryWithRetry(config: AgentProviderConfig): AsyncIterable<AgentEvent> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      yield* this.query(config)
      return
    } catch (e) {
      if (isRateLimitError(e) && attempt < 2) {
        const delay = Math.min(1000 * 2 ** attempt, 30000)
        await sleep(delay)
        continue
      }
      throw e
    }
  }
}
```

### 3. Codex CLI Spawn Failures

Unique to Codex — the CLI binary might not exist, be wrong version, or fail to start.

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Binary not found | `spawn ENOENT` | Emit clear error: "Codex CLI not installed" |
| Binary wrong version | stderr version mismatch | Emit: "Codex CLI needs update" |
| Binary crashes | exit code != 0, no events | Include stderr in diagnostics |
| Binary hangs | No events within timeout | Kill process, emit timeout error |

```typescript
// CodexProvider startup check:
async validateBinary(): Promise<void> {
  try {
    const { stdout } = await execFile(this.codexPath, ["--version"])
    // Check minimum version
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new ProviderSetupError("Codex CLI not found. Run: npm install -g @openai/codex")
    }
    throw new ProviderSetupError(`Codex CLI check failed: ${e.message}`)
  }
}
```

### 4. MCP Server Process Failures

After refactoring MCP servers to standalone processes, they can crash independently.

| Failure | Detection | Recovery |
|---------|-----------|----------|
| MCP server won't start | spawn error | Skip server, warn in init event |
| MCP server crashes mid-query | broken pipe / EOF on stdio | Attempt restart once, then degrade |
| MCP server timeout | No response within 30s | Kill, report tool as failed |

**Process lifecycle:**
```typescript
class ManagedMcpServer {
  private proc: ChildProcess | null = null
  
  async start(command: string[], env: Record<string, string>): Promise<void> {
    this.proc = spawn(command[0], command.slice(1), { env, stdio: ["pipe", "pipe", "pipe"] })
    this.proc.on("exit", (code) => {
      if (code !== 0) this.handleCrash(code)
    })
  }
  
  private async handleCrash(code: number): Promise<void> {
    if (this.restartAttempts < 1) {
      this.restartAttempts++
      await this.start(this.command, this.env)
    } else {
      this.emit("degraded", { server: this.name, reason: `exited with code ${code}` })
    }
  }
  
  async stop(): Promise<void> {
    this.proc?.kill("SIGTERM")
    // Wait 5s, then SIGKILL
  }
}
```

### 5. Network Errors (Transient)

Both providers can hit transient network issues. Current Alive code already has `isTransientNetworkError()` — extend it:

```typescript
function isTransientNetworkError(error: unknown): boolean {
  // Existing checks for Claude...
  
  // Codex: CLI stderr patterns
  if (typeof error === "string") {
    return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|network|socket hang up/i.test(error)
  }
  return false
}
```

### 6. Provider-Specific Timeout Handling

| Provider | Timeout Mechanism | Default |
|----------|------------------|---------|
| Claude | `AbortSignal` on query() | Alive sets 10min |
| Codex | `AbortSignal` on runStreamed(), kills CLI process | Same 10min |

Both use `AbortSignal` — this is already unified. The worker's existing timeout logic applies to both.

## Error Event Format

Extend the error IPC message to include provider context:

```typescript
// Current:
{ type: "error", requestId, error: string, diagnostics?: object }

// Extended:
{ type: "error", requestId, error: string, diagnostics: {
  provider: "claude" | "codex",
  errorType: "auth" | "rate_limit" | "timeout" | "spawn" | "mcp" | "network" | "unknown",
  recoverable: boolean,
  retried: number,  // how many retries were attempted
  stderr?: string,  // last 500 chars of stderr (Codex)
}}
```

## Graceful Degradation

When a non-critical component fails (e.g., one MCP server), the query should continue:

1. **MCP server fails to start** → Log warning, continue without that server's tools
2. **MCP tool call fails** → Report tool error in stream, agent continues
3. **Codex web search unavailable** → Agent uses other tools (no crash)
4. **Session resume fails** → Start fresh session, warn user "Starting new session (previous session unavailable)"

## Testing Error Paths

```typescript
describe("Error handling", () => {
  it("handles invalid API key gracefully", async () => {
    const provider = new CodexProvider()
    const events = collect(provider.query({ ...config, apiKey: "invalid" }))
    expect(events).toContainEqual(expect.objectContaining({
      type: "error",
      diagnostics: expect.objectContaining({ errorType: "auth" })
    }))
  })
  
  it("handles missing codex binary", async () => {
    const provider = new CodexProvider({ codexPathOverride: "/nonexistent" })
    await expect(provider.validateBinary()).rejects.toThrow("Codex CLI not found")
  })
  
  it("retries on rate limit", async () => {
    // Mock SDK to throw rate limit on first call, succeed on second
  })
})
```
