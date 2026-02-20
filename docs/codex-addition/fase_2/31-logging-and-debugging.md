# Logging & Debugging — Codex Provider

## Stderr Capture

The SDK captures stderr from the Codex CLI process in a buffer:
```typescript
const stderrChunks: Buffer[] = [];
child.stderr.on("data", (data) => stderrChunks.push(data));
```

Stderr is only surfaced when the process exits non-zero. This means **debug/warning output from Codex is invisible during normal operation**.

### Recommendation

Add stderr streaming to Alive's logging:

```typescript
class CodexSession {
  private setupStderrLogging(child: ChildProcess): void {
    child.stderr?.on("data", (chunk) => {
      const line = chunk.toString().trim();
      if (line) {
        logger.debug(`[codex:${this.workspaceId}] ${line}`);
      }
    });
  }
}
```

Since we don't have direct access to the child process (SDK manages it), we'd need to either:
1. Fork/extend the SDK to expose stderr events
2. Use `config.codexPathOverride` to point to a wrapper script that tees stderr
3. Accept that stderr is only visible on failure (pragmatic v1 choice)

**v1 Decision**: Accept stderr-on-failure only. The JSONL events provide sufficient observability.

## JSONL Event Logging

Every event from Codex is a JSON line. Log these for debugging:

```typescript
async *query(input: string): AsyncGenerator<AliveEvent> {
  const { events } = await this.thread.runStreamed(input, { signal });
  
  for await (const event of events) {
    // Raw event log for debugging (structured, searchable)
    logger.debug({
      provider: "codex",
      workspace: this.workspaceId,
      eventType: event.type,
      ...(event.type.startsWith("item.") && { itemType: event.item.type }),
    });
    
    yield* this.normalizeEvent(event);
  }
}
```

## Parse Error Handling

The SDK throws if a JSONL line can't be parsed:
```typescript
parsed = JSON.parse(item) as ThreadEvent;
// throws: "Failed to parse item: <raw line>"
```

This is a hard failure — the entire stream dies. In Alive, we should catch and continue:

```typescript
// In a custom exec layer (if we wrap the SDK):
try {
  parsed = JSON.parse(line);
} catch {
  logger.warn(`Unparseable Codex output: ${line.substring(0, 200)}`);
  continue; // skip malformed lines
}
```

Since we use the SDK as-is for v1, this error propagates through `runStreamed()`. We catch it in `CodexSession.query()` and emit an error event.

## Debug Mode

For development/troubleshooting, add a debug mode that:
1. Logs the full CLI command being executed
2. Logs all env vars (redacted API keys)
3. Logs raw JSONL events before normalization
4. Logs the `.codex/config.toml` content written before each session

Toggle via env: `ALIVE_CODEX_DEBUG=1`

## Sentry Integration

Alive uses Sentry. Add Codex-specific breadcrumbs:

```typescript
Sentry.addBreadcrumb({
  category: "codex",
  message: `Thread ${threadId} started`,
  level: "info",
  data: { model, workspaceId, sandboxMode },
});
```

Error events should be captured with provider context:

```typescript
Sentry.withScope((scope) => {
  scope.setTag("provider", "codex");
  scope.setTag("workspace", workspaceId);
  scope.setContext("codex", { threadId, model, sandboxMode });
  Sentry.captureException(error);
});
```
