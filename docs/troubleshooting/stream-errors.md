# Stream Error Debugging

When users see "I encountered an error while streaming my response", use this guide.

## Quick Commands

```bash
# Find error by ID shown to user (e.g., "Error ID: abc-123")
journalctl -u alive-staging | grep "STREAM_ERROR:abc-123"

# Recent stream errors
journalctl -u alive-staging --since "10 minutes ago" | grep "STREAM_ERROR"

# Query error buffer via API
curl -s https://terminal.goalive.nl/api/logs/error?category=stream | jq '.errors[:5]'
```

## Log Format

```
[STREAM_ERROR:<requestId>] <message> | build=<branch>@<time> env=<env> workspace=<domain> model=<model>
[STREAM_ERROR:<requestId>] Stack: <stack trace>
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Claude Code process exited with code 1` | Worker crashed (API error, tool failure) | Check logs before crash for API errors |
| `Controller is already closed` | Stream cancelled mid-flight | Usually user abort, not a bug |
| `429 rate limit` | API rate limited | Wait and retry |

## Key Files

- `apps/web/lib/error-logger.ts` - `logStreamError()` 
- `apps/web/lib/stream/ndjson-stream-handler.ts` - Catches and logs errors
- `apps/web/app/api/logs/error/route.ts` - Query API
