# OAuth Credentials Issue: "Invalid API key" Error

## The Error

Users on production (e.g., `alive.best`) see:
```
Invalid API key · Fix external API key
```

## Root Cause

**Three separate issues combined:**

> Note: This only shows up with the persistent worker pool (`WORKER_POOL.ENABLED=true`).
> The per-request runner in `apps/web/scripts/run-agent.mjs` copies credentials each request,
> so stale handles and root traversal issues are much less likely there.

### 1. OAuth Tokens ≠ API Keys

Claude has two authentication methods:
- **API Keys**: `sk-ant-api01-...` - Can be used directly with `ANTHROPIC_API_KEY` env var
- **OAuth Tokens**: `sk-ant-oat01-...` - Must be used through the SDK's internal OAuth flow

We incorrectly tried to pass OAuth tokens as `ANTHROPIC_API_KEY`:
```javascript
// WRONG - OAuth tokens can't be used as API keys
process.env.ANTHROPIC_API_KEY = oauthAccessToken
```

The SDK rejects this because OAuth tokens require the SDK to read from `.credentials.json` and handle the OAuth protocol internally.

### 2. File Permission Problem

Workers drop privileges from root to site-specific users (e.g., `site-alive-best`):
```
Worker starts as root
    ↓
Sets CLAUDE_CONFIG_DIR=/root/.claude
    ↓
Drops to UID 958 (site-alive-best)
    ↓
SDK tries to read /root/.claude/.credentials.json
    ↓
FAILS - file has 600 permissions (root only)
```

The credentials file:
```
-rw------- 1 root root 771 /root/.claude/.credentials.json
```

Non-root users cannot read this file. This is especially common after a token refresh because `apps/web/lib/anthropic-oauth.ts` writes the file with `0600` for security.

Also ensure directory traversal is allowed (typical in production here, but not guaranteed):
```
drwx--x--x /root
drwx--x--x /root/.claude
```

### 3. File Handle Caching

When the Claude Code CLI runs `/login` (or the refresh logic writes new tokens), it does an atomic write (write to temp, rename). This creates a NEW file inode. Any process that had the old file open still sees old data via cached file handles.

Evidence found:
```bash
lsof -p <claude-pid> | grep credentials
# Shows: /root/.claude/.credentials.json (deleted)
```

The running Claude process had a file handle to a DELETED version of the credentials file with stale/expired credentials, while the actual file on disk had refreshed credentials.

## The Fix

### 1. File Permissions (Required)

Ensure the credentials file is readable by worker users:

```
chmod 644 /root/.claude/.credentials.json
chmod 711 /root /root/.claude
```

If you have a watcher (systemd path unit or cron) that re-applies `chmod 644` after `/login` or token refresh, keep it enabled. Otherwise, re-run the chmods after any credential refresh.

If your security policy does not allow opening `/root` to traversal, move the credentials to a shared location (e.g., `/var/lib/claude-credentials`) and update `packages/worker-pool/src/worker-entry.mjs` to respect a pre-set `CLAUDE_CONFIG_DIR` instead of forcing `/root/.claude`.

### 2. Don't Pass OAuth Tokens as API Keys

Let the SDK read credentials directly:
```javascript
// CORRECT - let SDK handle OAuth internally
if (payload.apiKey) {
  // User-provided real API key
  process.env.ANTHROPIC_API_KEY = payload.apiKey
} else {
  // OAuth - SDK reads from CLAUDE_CONFIG_DIR
  delete process.env.ANTHROPIC_API_KEY
}
```

### 3. Restart Workers After /login (Stale Handles)

Because `/login` does an atomic replace, long-lived workers may keep reading the deleted inode. Restart the bridge service (or worker pool) after credentials change so the SDK re-reads the file. This is only necessary for persistent workers.

```
# Production helper (detects changes + restarts service)
scripts/sync-credentials.sh

# Or restart the service directly (env-specific)
systemctl restart claude-bridge-production
```

### 4. Single Source of Truth

`/root/.claude/.credentials.json` is the ONLY credentials location:
- CLI writes here after `/login`
- All workers read from here via `CLAUDE_CONFIG_DIR=/root/.claude`
- File permissions: `644` (readable by all)
- Per-request runner (when worker pool is disabled) copies from here to a temp HOME

## Architecture

```
┌─────────────────┐     ┌──────────────────────────┐
│   Claude CLI    │────▶│ /root/.claude/           │
│   (/login)      │     │ .credentials.json (644)  │
└─────────────────┘     └──────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│ Worker (root) │         │ Worker (root) │         │ Worker (root) │
│      ↓        │         │      ↓        │         │      ↓        │
│ Drop to       │         │ Drop to       │         │ Drop to       │
│ site-alice    │         │ site-bob      │         │ site-alive    │
│      ↓        │         │      ↓        │         │      ↓        │
│ SDK reads     │         │ SDK reads     │         │ SDK reads     │
│ credentials   │         │ credentials   │         │ credentials   │
└───────────────┘         └───────────────┘         └───────────────┘
```

## Verification

```bash
# Check file permissions
ls -la /root/.claude/.credentials.json
# Should be: -rw-r--r-- (644)

# Check systemd watcher is active (if installed)
systemctl status claude-credentials-fix.path
# Should be: active (waiting)

# Ensure workers don't hold a deleted inode
lsof -p <claude-pid> | grep credentials
# Should NOT show "(deleted)"

# Test after /login (Claude Code CLI)
/login
ls -la /root/.claude/.credentials.json
# Should still be 644 (auto-fixed if you have a watcher)
```

## Related Files

- `/etc/systemd/system/claude-credentials-fix.path` - Watches for file changes (if installed)
- `/etc/systemd/system/claude-credentials-fix.service` - Fixes permissions (if installed)
- `scripts/sync-credentials.sh` - Restarts service on credential changes
- `packages/worker-pool/src/worker-entry.mjs` - Worker credential handling
- `apps/web/scripts/run-agent.mjs` - Per-request runner credential copy
- `apps/web/app/api/claude/stream/route.ts` - API route
- `apps/web/lib/anthropic-oauth.ts` - OAuth helpers
