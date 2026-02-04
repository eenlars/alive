# Workspace File Permission Setup

**Status:** ✅ Production — Child Process Isolation (Nov 2, 2025)

## Quick Summary

Claude Bridge automatically ensures all files created in workspaces are owned by the correct Unix user (the workspace's site user, e.g., `site-example-com`), not `root`.

**How it works:**
- Each workspace runs code in a **child process** spawned with the workspace user's UID/GID
- The OS kernel enforces correct ownership for **all** file operations
- No patching, no fragility — just process-level isolation

## Architecture

```
┌─────────────────────────────────────┐
│ Claude Bridge (runs as root)        │
│ /api/claude/stream route handler    │
└────────────┬────────────────────────┘
             │
             │ spawn() with UID/GID
             ↓
┌─────────────────────────────────────┐
│ Child Process (runs as site user)   │
│ scripts/run-agent.mjs               │
│                                     │
│ - SDK writes files/dirs             │
│ - All inherit site user ownership   │
│ - Streams NDJSON back to parent     │
└─────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/lib/workspace-execution/agent-child-runner.ts` | Parent: Spawns child, detects when to use child process |
| `apps/web/scripts/run-agent.mjs` | Child: Runs SDK as workspace user, streams NDJSON |
| `apps/web/app/api/claude/stream/route.ts` | Route: Integrates child process logic |

## Automatic Detection

The system automatically chooses between:

- **Child process mode**: Workspace owned by non-root user (systemd sites)
  ```bash
  stat /srv/webalive/sites/example.com/  # owned by site-example-com
  → Uses child process (correct ownership guaranteed)
  ```

- **In-process mode**: Workspace owned by root (legacy, fallback)
  ```bash
  stat /srv/webalive/sites/legacy.com/   # owned by root
  → Uses in-process (backward compatible)
  ```

## Troubleshooting

### Files still owned by root?

**Cause:** Workspace was created before this implementation (Nov 2, 2025).

**Fix:**
```bash
# Get site user from workspace path
site_user=$(stat -c '%U' /srv/webalive/sites/example.com/)

# Fix ownership recursively
chown -R "$site_user:$site_user" /srv/webalive/sites/example.com/user

# Verify
find /srv/webalive/sites/example.com/user -user root  # Should return nothing
```

### Child process not spawning?

Check logs:
```bash
journalctl -u alive -n 50 | grep -i "child\|agent"
```

**Common issues:**
- `EACCES` (permission denied) → Check workspace ownership
- Missing `WORKSPACE_ROOT` → Verify path in request
- Child exits immediately → Check `scripts/run-agent.mjs` exists

## For New Sites

**New systemd sites automatically use child process isolation:**
```bash
# Deploy new site (uses site-controller)
bun run deploy-site example.com

# Files created by Claude automatically owned by site-example-com
stat /srv/webalive/sites/example.com/user/src/Foo.tsx
# Output: site-example-com site-example-com 644 Foo.tsx ✅
```

## Implementation Details

For developers extending this system, see:
- **[Postmortem: Nov 2, 2025 - Child Process Permission Fix](../postmortems/2025-11-02-child-process-permission-fix.md)** — Full technical rationale, what was tried, why it works
- `lib/workspace-execution/agent-child-runner.ts` — Detection logic
- `scripts/run-agent.mjs` — Child process implementation
