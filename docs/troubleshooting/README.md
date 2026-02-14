# Troubleshooting

Common issues, solutions, and postmortems.

## Common Issues

### Authentication

**Error: "Unauthorized" (401)**

**Causes:**
- No session cookie
- Invalid/expired JWT
- Missing required JWT scope (for example `workspace:access` or `workspace:list`)
- Workspace's organization not in the user's org memberships

**Solution:**
```bash
# Check session cookie exists
# Login again
POST /api/login { "email": "user@example.com", "password": "..." }

# Verify JWT scope + org access claims
# JWT should include scopes, orgIds, and orgRoles

# Verify workspace maps to an org the user belongs to
# Authorization now uses workspace -> org and user -> org membership checks
```

### Path Validation

**Error: "Path outside workspace"**

**Causes:**
- Path traversal attempt (`../../../etc/passwd`)
- Absolute path outside workspace
- Symlink escape

**Solution:**
```typescript
// Ensure path normalization
const normalized = path.normalize(filePath)
ensurePathWithinWorkspace(normalized, workspace.root)

// For symlinks, resolve first
const resolved = fs.realpathSync(filePath)
ensurePathWithinWorkspace(resolved, workspace.root)
```

### Session Not Persisting

**Error: "No conversation found with session ID"**

**Cause:** Session ID exists in database but conversation data file is missing

**Current solution (automatic):**
- Workers use stable HOME directories at `/var/lib/claude-sessions/<workspace>/`
- Stream route automatically detects this error and recovers:
  1. Clears stale session ID from database
  2. Retries as fresh conversation

**Manual verification:**
```bash
# Check session directory exists
ls -la /var/lib/claude-sessions/

# Check conversation files for a workspace
ls -la /var/lib/claude-sessions/example-com/.claude/projects/
```

**See:** [Session Management](../architecture/session-management.md)

### Tool Not Whitelisted

**Error:** `tool_not_allowed: ToolName`

**Cause:** Tool not in `ALLOWED_SDK_TOOLS` or `ALLOWED_MCP_TOOLS`

**Solution:**
```typescript
// Add to whitelist in lib/claude/tool-permissions.ts
export const ALLOWED_SDK_TOOLS = new Set([
  "Write", "Edit", "Read", "Glob", "Grep",
  "NewTool"  // Add here
])
```

### File Ownership Wrong

**Error:** Site service can't read/write files

**Cause:** Files owned by root instead of site user

**Solution:**
```bash
# Check ownership
ls -la /srv/webalive/sites/example.com

# Fix ownership
sudo chown -R site-example-com:site-example-com /srv/webalive/sites/example.com

# Ensure child process UID switching enabled
# Check shouldUseChildProcess() returns true
```

### Site Service Won't Start

**Error:** `systemctl start site@example-com.service` fails

**Diagnose:**
```bash
# Check logs
journalctl -u site@example-com.service -n 50

# Check file permissions
ls -la /srv/webalive/sites/example.com

# Verify user exists
id site-example-com

# Test manual start
sudo -u site-example-com bun /srv/webalive/sites/example.com/user/index.ts
```

**Common causes:**
- File ownership wrong
- Missing dependencies (`bun install`)
- Port already in use
- Workspace directory doesn't exist

### Conversation Locked

**Error:** 409 Conflict "Conversation in progress"

**Cause:** Previous request didn't release lock (server crashed)

**Solution:**
```typescript
// Current implementation uses in-memory Set (clears on restart)
// Restart server to clear locks

// OR implement Redis locks with TTL
await redis.set(conversationKey, "locked", "EX", 60)  // 60s expiry
```

### Memory/CPU Limit Exceeded

**Error:** Site killed by systemd

**Cause:** Exceeded `MemoryMax` or `CPUQuota`

**Solution:**
```bash
# Edit service file
sudo vi /etc/systemd/system/site@.service

# Increase limits
MemoryMax=1G        # Was 512M
CPUQuota=100%       # Was 50%

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart site@example-com.service
```

## Debug Checklist

Before asking for help:

- [ ] Check logs (`journalctl -u alive-dev`)
- [ ] Verify authentication (session cookie valid)
- [ ] Test path validation manually
- [ ] Check file ownership and permissions
- [ ] Review error messages in detail
- [ ] Try in local dev mode (`ALIVE_ENV=local`)

## Postmortems

Historical issue analyses preserved in `/docs/archive/` for learning.

## Getting Help

1. Check logs first
2. Review relevant documentation
3. Search closed issues
4. Open new issue with:
   - Error message
   - Steps to reproduce
   - Environment (dev/staging/production)
   - Relevant logs

## See Also

- [Security: Workspace Enforcement](../security/workspace-enforcement.md) - Path validation
- [Architecture: Session Management](../architecture/session-management.md) - Session debugging
- [Testing](../testing/README.md) - Test your fixes
