# Graceful Degradation & Provider Availability

## Scenario: Codex Binary Not Found

The SDK resolves the binary path at construction time via `findCodexPath()` which:
1. Checks `codexPathOverride` option
2. Tries `require.resolve("@openai/codex")` (vendored binary)
3. Falls back to platform-specific packages (`@openai/codex-linux-x64`, etc.)

If none found → throws at `new Codex()` construction.

### Handling in Alive

```typescript
class CodexProvider implements AgentProvider {
  static isAvailable(): boolean {
    try {
      new Codex(); // Will throw if binary not found
      return true;
    } catch {
      return false;
    }
  }
}
```

The provider registry should check availability at startup and disable unavailable providers:

```typescript
class ProviderRegistry {
  private providers = new Map<string, AgentProvider>();

  register(name: string, factory: () => AgentProvider): void {
    try {
      this.providers.set(name, factory());
    } catch (e) {
      logger.warn(`Provider ${name} unavailable: ${e.message}`);
    }
  }

  get(name: string): AgentProvider {
    const p = this.providers.get(name);
    if (!p) throw new ProviderUnavailableError(name);
    return p;
  }

  available(): string[] {
    return Array.from(this.providers.keys());
  }
}
```

## Scenario: Codex API Key Invalid/Missing

The SDK sets `CODEX_API_KEY` in the child process env. If invalid:
- CLI will emit a `turn.failed` event with auth error message
- Or a top-level `error` event

### Detection

```typescript
private *normalizeEvent(event: ThreadEvent): Generator<AliveEvent> {
  if (event.type === "turn.failed") {
    const msg = event.error.message.toLowerCase();
    if (msg.includes("auth") || msg.includes("api key") || msg.includes("401")) {
      yield { type: "error", code: "PROVIDER_AUTH_FAILED", message: "Codex API key is invalid", recoverable: false };
      return;
    }
  }
}
```

## Scenario: Rate Limiting

OpenAI rate limits apply. When hit:
- Codex CLI may retry internally (unclear from source)
- If not, `turn.failed` with rate limit error

### Strategy
- Surface rate limit errors clearly in UI: "OpenAI rate limit reached. Try again in X seconds."
- Don't auto-retry at Alive level — let the user decide
- Consider offering "Switch to Claude" as a one-click fallback in the error UI

## Scenario: Codex CLI Crashes Mid-Session

The SDK's `exec.ts` handles this:
- Non-zero exit code → throws `Error("Codex Exec exited with code/signal: stderr")`
- This propagates through the async generator, terminating the event stream

### Handling
- Catch the error in CodexSession.query()
- Emit a terminal error event
- Clean up any temp files (output schema file)
- Don't auto-retry — the workspace may be in a partial state

## Scenario: MCP Server Fails to Start

If an MCP server defined in `.codex/config.toml` with `required = true` fails:
- Codex CLI should fail fast with an error
- If `required = false` (or omitted), Codex continues without it

### Strategy for v1
- Mark all Alive MCP servers as `required = true`
- If they fail, the entire query fails with a clear error
- Avoids silent degradation where the agent can't use tools but tries anyway

## Provider Fallback (v2 Feature)

Future consideration: automatic provider fallback.

```
User selects Codex → Codex unavailable → Fall back to Claude
```

This should be **opt-in per workspace**, not automatic. Reasons:
- Different providers may produce different results for the same prompt
- Cost implications of falling back to a different provider
- User should be aware which provider is running

For v1: surface the error, let the user manually switch.
