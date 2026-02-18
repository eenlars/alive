# Fase 3.2 — Monitoring & Observability

## Metrics to Track

### Per-Provider

| Metric | Description | Source |
|--------|-------------|--------|
| `query.count` | Total queries by provider | Worker IPC complete events |
| `query.duration_ms` | End-to-end query time | Worker timestamp diff |
| `query.success` | Successful completions | IPC complete with success=true |
| `query.error` | Failed queries by error type | IPC error events |
| `tokens.input` | Input tokens consumed | turn.completed / result events |
| `tokens.output` | Output tokens consumed | Same |
| `tokens.cached` | Cached input tokens | Same |
| `mcp.tool_calls` | MCP tool calls per server | tool_use / mcp_tool_call events |
| `mcp.tool_errors` | Failed MCP tool calls | tool_result with isError=true |

### Codex-Specific

| Metric | Description |
|--------|-------------|
| `codex.spawn_time_ms` | Time to spawn CLI process |
| `codex.binary_errors` | Binary not found / version mismatch |
| `codex.sandbox_mode` | Distribution of sandbox modes used |

### MCP Server (Standalone)

| Metric | Description |
|--------|-------------|
| `mcp.startup_time_ms` | Time for MCP server to become ready |
| `mcp.crashes` | Unexpected MCP server exits |
| `mcp.restarts` | Successful restart after crash |
| `mcp.latency_per_call_ms` | Overhead of stdio vs in-process |

## Implementation

### Approach: Structured Logging + PostHog Events

Alive already uses PostHog for analytics. Extend with provider metrics:

```typescript
// In provider adapter, after query completes:
posthog.capture("agent_query_completed", {
  provider: "codex",
  duration_ms: endTime - startTime,
  input_tokens: usage.inputTokens,
  output_tokens: usage.outputTokens,
  tools_used: toolCallCount,
  mcp_servers: enabledMcpServers,
  error: errorType || null,
  workspace_id: workspaceId,
})
```

### Structured Logs

Worker already logs to stderr. Add structured JSON for grep/analysis:

```javascript
console.error(JSON.stringify({
  ts: Date.now(),
  level: "info",
  event: "query_complete",
  provider: "codex",
  duration_ms: 4523,
  tokens: { in: 1200, out: 450, cached: 300 },
  tools: 3,
  mcpServers: ["alive-tools", "alive-workspace"],
}))
```

## Alerting

### Critical (immediate notification)

- **Provider down**: 5+ consecutive errors within 5 minutes for same provider
- **Auth failures**: Any auth error (server key rotation failure or upstream auth outage)
- **MCP server permanent failure**: Server failed and couldn't restart

### Warning (daily digest)

- **High error rate**: >10% error rate for a provider over 1 hour
- **Latency spike**: Average query time >2x normal for >30 minutes
- **Token usage anomaly**: Single query uses >500k tokens (runaway agent)

## Dashboard (Future)

Admin panel showing:
- Queries per provider (last 24h, 7d, 30d)
- Error rate by provider
- Token consumption by provider
- Most used MCP tools
- Average query duration by provider
- Active workspaces per provider

For v1: rely on PostHog dashboards and structured log queries.
