# Workspace Isolation & Privilege Separation

**Core security pattern**: Each website runs as dedicated system user with file system isolation.

## Overview

Alive uses multi-layered isolation to prevent cross-tenant file access:

1. **Workspace boundaries** - Path validation prevents directory traversal
2. **systemd user isolation** - Each site runs as unprivileged user (e.g., `site-example-com`)
3. **UID switching** - SDK child processes drop to workspace user credentials
4. **OS-level enforcement** - Kernel prevents user from reading other users' files

## Workspace Structure

### Secure Location (New Sites)

```
/srv/webalive/sites/
├── example.com/              # Owned by site-example-com
│   ├── user/
│   │   ├── src/             # Application code
│   │   ├── package.json
│   │   └── index.ts
│   ├── worktrees/
│   │   └── feature-x/        # Git worktree checkout
│   └── .env
│
└── demo.site.com/            # Owned by site-demo-site-com
    └── user/
        └── src/
```

**Permissions:**
```bash
drwx------ site-example-com:site-example-com /srv/webalive/sites/example.com
```

### Legacy Location (Old Sites)

```
/root/webalive/sites/
└── custom-project/           # Manual workspace (terminal mode only)
```

## Workspace Resolution

### getWorkspace()

Resolves hostname → workspace root with security checks:

```typescript
export function getWorkspace(host: string): Workspace {
  const root = resolveWorkspace(host)  // Resolve with symlink safety
  const st = fs.statSync(root)

  return {
    root,                    // Absolute workspace path
    uid: st.uid,            // For child process UID switching
    gid: st.gid,            // For child process GID switching
    tenantId,               // Normalized workspace name
  }
}
```

### resolveWorkspace()

Handles:
- Symlink resolution (prevent escape via symlinks)
- Tenant ID aliasing (`barendbootsma-com` → `barendbootsma.com`)
- Containment verification (path doesn't escape base)

```typescript
export function resolveWorkspace(host: string): string {
  const BASE = process.env.WORKSPACE_BASE ?? "/srv/webalive/sites"
  const tenant = hostToTenantId(host.toLowerCase())
  const intended = path.join(BASE, tenant, "user", "src")

  const real = fs.realpathSync(intended)     // Resolve symlinks
  const baseReal = fs.realpathSync(BASE)

  if (!real.startsWith(baseReal + path.sep)) {
    throw new Error("Workspace resolution escaped base")
  }

  return real
}
```

### Worktree Resolution (When Provided)

When an optional `worktree` slug is present in the request, the resolver must:

1. Resolve the base workspace from the domain as usual.
2. Build the worktree path: `<siteRoot>/worktrees/<slug>`.
3. Resolve realpath and enforce containment against `<siteRoot>/worktrees`.
4. Verify the target exists in `git worktree list --porcelain`.

This prevents path traversal, symlink escapes, and phantom worktree paths. Auth remains domain-based; worktrees do not change access rules.

Additional constraints:
- The base workspace must be a repo root. Reject `.git` files (worktree paths) and return a clear error.
- Worktree mutations use a per-repo lock at `.git/bridge-worktree.lock` to prevent concurrent git worktree changes.

## Path Validation

### ensurePathWithinWorkspace()

Called before every SDK file operation:

```typescript
export function ensurePathWithinWorkspace(
  filePath: string,
  workspaceRoot: string
): void {
  const norm = path.normalize(filePath)

  if (!norm.startsWith(workspaceRoot + path.sep)) {
    throw new Error(`Path outside workspace: ${norm}`)
  }
}
```

**Prevents:**
- Path traversal (`../../../etc/passwd`)
- Absolute path escapes (`/root/secrets.json`)
- Symlink escapes (when combined with `realpathSync`)

## Systemd Isolation

### User Creation

Each site gets dedicated unprivileged user:

```bash
useradd -r \
  -s /bin/false \
  -d /srv/webalive/sites/example.com \
  site-example-com

chown -R site-example-com:site-example-com /srv/webalive/sites/example.com
chmod 700 /srv/webalive/sites/example.com
```

**Result:** OS prevents `site-example-com` from reading `site-demo-com` files.

### systemd Service Config

```ini
[Service]
User=site-example-com
Group=site-example-com
WorkingDirectory=/srv/webalive/sites/example.com/user

# Security hardening
PrivateTmp=yes
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/webalive/sites/example.com
```

**Hardening:**
- `PrivateTmp=yes` - Isolated /tmp
- `NoNewPrivileges=true` - Prevent privilege escalation
- `ProtectSystem=strict` - Read-only /usr, /boot, /efi
- `ReadWritePaths` - Explicit write access only to workspace

## Child Process UID Switching

### Why Needed

Bridge runs as root (needs access to all workspaces), but SDK operations should run as workspace user to ensure correct file ownership.

**Without UID switching:**
```bash
# Bridge runs as root
# SDK creates file
ls -la /srv/webalive/sites/example.com/user/src/new-file.ts
# -rw-r--r-- root:root new-file.ts  ❌ Wrong owner!
```

**With UID switching:**
```bash
# Bridge spawns child, child calls setegid/seteuid
ls -la /srv/webalive/sites/example.com/user/src/new-file.ts
# -rw-r--r-- site-example-com:site-example-com new-file.ts  ✅ Correct!
```

### Implementation

**Detection (automatic):**

```typescript
export function shouldUseChildProcess(workspaceRoot: string): boolean {
  const st = statSync(workspaceRoot)
  return st.uid !== 0 && st.gid !== 0  // Non-root owner = systemd site
}
```

**Child process spawn:**

```typescript
// lib/agent-child-runner.ts
export async function runAgentInChildProcess(
  workspace: Workspace,
  options: AgentOptions
): Promise<AgentResult> {
  const child = spawn('node', ['scripts/run-agent.mjs'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      WORKSPACE_UID: String(workspace.uid),
      WORKSPACE_GID: String(workspace.gid),
      WORKSPACE_ROOT: workspace.root,
      // ... agent options
    }
  })

  // Parse structured output (JSON lines)
  // Return result
}
```

**UID switching in child:**

```javascript
// scripts/run-agent.mjs
const targetUid = Number(process.env.WORKSPACE_UID)
const targetGid = Number(process.env.WORKSPACE_GID)

if (targetUid && targetGid) {
  process.setegid(targetGid)  // Kernel-level GID switch
  process.seteuid(targetUid)  // Kernel-level UID switch
  // All subsequent file operations inherit workspace credentials
}

// Run SDK query with switched privileges
```

## Multi-Tenant Security

### Layer 1: Authentication

User authenticates for specific workspace → JWT with workspace list:

```typescript
// JWT payload
{
  workspaces: ["example.com", "demo.site.com"],
  iat: 1234567890,
  exp: 1237159890
}
```

### Layer 2: Workspace Resolution

Request maps to workspace based on authentication:

```typescript
const workspace = getWorkspace(host)  // Only if user has access
```

### Layer 3: Path Validation

Every file operation validated:

```typescript
ensurePathWithinWorkspace(filePath, workspace.root)
```

### Layer 4: OS Enforcement

Even if path validation bypassed, OS prevents cross-user access:

```bash
# site-example-com user tries to read site-demo-com files
cat /srv/webalive/sites/demo.site.com/user/src/index.ts
# Permission denied (OS-level)
```

## Testing Workspace Boundaries

### Unit Tests

```typescript
describe('ensurePathWithinWorkspace', () => {
  it('allows files within workspace', () => {
    expect(() =>
      ensurePathWithinWorkspace(
        '/srv/webalive/sites/example.com/user/src/index.ts',
        '/srv/webalive/sites/example.com/user/src'
      )
    ).not.toThrow()
  })

  it('denies path traversal', () => {
    expect(() =>
      ensurePathWithinWorkspace(
        '/srv/webalive/sites/example.com/user/src/../../secrets.json',
        '/srv/webalive/sites/example.com/user/src'
      )
    ).toThrow('Path outside workspace')
  })

  it('denies absolute path escape', () => {
    expect(() =>
      ensurePathWithinWorkspace(
        '/etc/passwd',
        '/srv/webalive/sites/example.com/user/src'
      )
    ).toThrow('Path outside workspace')
  })
})
```

### Manual Testing

```bash
# Start dev server
bun run dev

# Login with test workspace
POST /api/login { "workspace": "test", "passcode": "test" }

# Try path traversal
POST /api/claude/stream { "message": "read ../../../etc/passwd" }

# Verify denied with "path_outside_workspace" error
```

## Common Issues

**"Path outside workspace" for valid paths:**
- Ensure path normalization uses `path.normalize()`
- Verify `workspaceRoot + path.sep` (separator matters)
- Check both paths are normalized before comparison

**File ownership wrong:**
- Verify `shouldUseChildProcess()` returns true for systemd sites
- Check workspace directory owned by site user (not root)
- Ensure child process UID switching working (check logs)

**Symlink escapes:**
- Use `realpathSync()` before `ensurePathWithinWorkspace()`
- Verify symlink target also within workspace

## See Also

- [Security: Workspace Enforcement](../security/workspace-enforcement.md) - Tool whitelisting, MCP security
- [Security: Authentication](../security/authentication.md) - JWT sessions, workspace auth
- [Testing: Security Tests](../testing/unit-testing.md#security-tests) - How to test boundary checks
