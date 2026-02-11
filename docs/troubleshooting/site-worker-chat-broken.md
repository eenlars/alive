# Site Worker Chat Broken on Server 2 (sonno.tech)

**Date**: 2026-02-10
**Status**: RESOLVED
**Server**: Server 2 (95.217.89.48, sonno.tech)
**Workspace**: huurmatcher.sonno.tech (but affects ALL non-alive site workspaces)

## The Problem

Chat works on Server 1 (alive.best) but crashes on Server 2 (sonno.tech) for any **site workspace** (non-alive workspace like huurmatcher.sonno.tech). The `alive` workspace (which runs as root) works fine on both servers.

When a user sends a message that requires tool use (e.g. "read package.json"), the Claude CLI process exits with code 1 immediately after initialization. Simple messages like "hi" that don't use tools work.

## Architecture Context

The chat flow for site workspaces:

1. Browser → `/api/claude/stream` → Next.js route handler
2. Route handler → **worker pool** → spawns/reuses a persistent worker process
3. Worker starts as **root**, sets up env, then **drops privileges** to site user (e.g. UID 996 `site-huurmatcher-sonno-tech`)
4. Worker calls SDK `query()` which spawns the **Claude CLI** as a subprocess
5. CLI runs as the **site user** (inherited from worker) with:
   - `CLAUDE_CONFIG_DIR=/root/.claude` (shared credentials)
   - `HOME=/var/lib/claude-sessions/huurmatcher.sonno.tech` (per-workspace sessions)
   - 7 MCP servers passed via `--mcp-config` JSON
   - `--strict-mcp-config` flag (added as part of this debugging)

## What Was Fixed

### 1. File Permissions on `/root/.claude/` (FIXED)

The CLI needs read/write access to files in `CLAUDE_CONFIG_DIR` (`/root/.claude/`), but after dropping to site user UID, it couldn't access root-owned files.

**Before** (broken):
```
-rw------- root root  .credentials.json   (600 — site user can't read)
-rw-r--r-- root root  .claude.json        (644 — site user can't write)
drwx------ root root  /root/.claude/      (700 — site user can't enter)
drwx------ root root  todos/              (700 — site user can't write)
drwx------ root root  debug/              (700 — site user can't write)
```

**After** (matching Server 1):
```
-rw-r--r-- root root  .credentials.json   (644 — site user can read)
-rw-rw-rw- root root  .claude.json        (666 — site user can write)
drwxr-xr-x root root  /root/.claude/      (755 — site user can enter)
drwxrwxrwx root root  todos/              (777 — site user can write)
drwxrwxrwx root root  debug/              (777 — site user can write)
```

**How to verify**: `ls -la /root/.claude/.credentials.json /root/.claude/.claude.json && ls -ld /root/.claude/ /root/.claude/todos/ /root/.claude/debug/`

**Server 1 already had these permissions set correctly.**

### 2. `strictMcpConfig: true` Added to worker-entry.mjs (COMMITTED)

Without this flag, the Claude CLI loads MCP servers from:
- **Cloud API** (`api.anthropic.com/v1/mcp_servers`) — user's claude.ai account has a stale Supabase MCP server with expired OAuth tokens → 28-second timeout
- **User settings** (`/root/.claude/settings.json`) — has Playwright MCP server → hangs
- **Project settings** (`.claude/settings.local.json` in workspace) — has supabase MCP config

Adding `strictMcpConfig: true` to the `query()` options makes the CLI only use MCP servers explicitly passed via `mcpServers` option.

**File**: `packages/worker-pool/src/worker-entry.mjs` line 697
**Commit**: `73010e4` on `feat/github-import-modal` branch

**Note**: Server 1 does NOT have this flag and works fine. This may be because the permissions fix alone is sufficient and the CLI handles MCP failures gracefully when it can write to its config dirs. Or Server 1's MCP config state is different.

## What Was Also Fixed (Session Resume + Error Propagation)

### 3. Worker Error Propagation (FIXED)

The CLI was crashing with exit code 1 when tool-using messages were sent through the worker pool. Root cause: **stale session resume**.

When the worker tried to resume a session that no longer existed (from previous failed attempts), the CLI emitted a structured SDK error (`"No conversation found with session ID..."`) but the worker only forwarded the generic "exited with code 1" message upstream. The route handler's session recovery logic couldn't detect the specific error to clear the stale session and retry fresh.

**Fix**: In worker-entry.mjs, when the CLI exits with code 1, extract structured errors from `queryResult.errors` (when `subtype === "error_during_execution"`) and surface those instead of the generic exit code message. This allows the route handler to match the "session-not-found" pattern and retry with a fresh session.

**Also added**: Comprehensive failure diagnostics logging (MCP status summary, recent message types, session ID, etc.) to make future debugging easier.

### 4. `/root/.claude/` Directory Permissions (FIXED)

The CLI does atomic writes — creates `.tmp.*` files before renaming. With `/root/.claude/` at 755, site users couldn't create temp files. Changed to 757.

**Required permissions on Server 2:**
```
drwxr-xrwx root root  /root/.claude/         (757 — site users can create temp files)
-rw-rw-rw- root root  .claude.json           (666 — site users can write)
-rw-r--r-- root root  .credentials.json      (644 — site users can read)
drwxrwxrwx root root  todos/                 (777 — site users can write)
drwxrwxrwx root root  debug/                 (777 — site users can write)
```

## How to Reproduce

### Working (direct CLI):
```bash
su -s /bin/bash site-huurmatcher-sonno-tech -c '
export CLAUDE_CONFIG_DIR=/root/.claude
export HOME=/var/lib/claude-sessions/huurmatcher.sonno.tech
export TMPDIR=/var/lib/claude-sessions/huurmatcher.sonno.tech/tmp
cd /srv/webalive/sites/huurmatcher.sonno.tech/user
timeout 20 /root/.bun/bin/bun /root/alive/.builds/staging/dist.20260210-113927/standalone/packages/worker-pool/node_modules/@anthropic-ai/claude-agent-sdk/cli.js \
  --output-format stream-json --verbose --max-turns 3 --model claude-haiku-4-5 \
  --permission-mode bypassPermissions --strict-mcp-config \
  --print "read package.json and tell me what this project is"
'
```
This returns a full response with tool use (Read → package.json) and project description.

### Broken (via browser):
1. Go to `https://staging.sonno.tech/chat?wk=huurmatcher.sonno.tech`
2. Open a new chat
3. Type "read package.json and tell me what this project is"
4. See error: "I encountered an error while streaming my response"
5. Check logs: `journalctl -u alive-staging --since "1 min ago" | grep "exited with code"`

## Debugging Steps Taken

1. **strace** on CLI process — found EACCES errors on `/root/.claude/` files → fixed permissions
2. **Direct CLI test** with `--debug --debug-file` — found cloud MCP server loading → added `strictMcpConfig`
3. **Compared servers** — found Server 1 already had correct permissions + doesn't need `strictMcpConfig`
4. **Direct CLI test with MCP servers** — needs further testing to isolate if MCP servers cause the exit code 1

## Next Steps to Investigate

1. **Test direct CLI with MCP servers**: Run the direct CLI test but ADD `--mcp-config` with the same MCP servers the worker uses. If it crashes, the MCP servers are the cause.

2. **Test direct CLI with permission mode default**: Run with `--permission-mode default` instead of `bypassPermissions`. If it crashes, the permission handling is the cause.

3. **Clear session state**: Delete `/var/lib/claude-sessions/huurmatcher.sonno.tech/` and recreate it. Stale session data from failed attempts may be corrupting resumes.

4. **Set up real MCP servers**: Replace dummy servers on 8082-8085 with real ones matching Server 1. The dummies may cause crashes when the CLI tries to interact with them during tool execution.

5. **Add stderr capture before SDK query**: The `stderrHandler` in worker-entry.mjs only captures stderr AFTER `query()` starts. If the CLI crashes during initialization (before the SDK starts streaming), stderr may be lost. Consider capturing the subprocess stderr directly.

## Files Involved

- `packages/worker-pool/src/worker-entry.mjs` — Worker that spawns CLI, drops privileges, manages MCP servers
- `/root/.claude/.credentials.json` — OAuth credentials (needs 644)
- `/root/.claude/.claude.json` — CLI config (needs 666)
- `/root/.claude/todos/` — CLI todo state (needs 777)
- `/root/.claude/debug/` — CLI debug logs (needs 777)
- `/var/lib/claude-sessions/huurmatcher.sonno.tech/` — Per-workspace session home
- `/tmp/dummy-mcp.ts` — Dummy MCP servers (ports 8082-8085)
- `/srv/webalive/sites/huurmatcher.sonno.tech/user/` — Workspace directory
