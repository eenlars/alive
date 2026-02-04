# Shell Server Environment Configuration

Environment-specific configuration for the shell-server terminal application.

## Overview

The shell-server provides a web-based terminal interface for system administration. Configuration is environment-specific (development vs production) to provide different defaults, workspace isolation, and security settings.

## Configuration File

**Location**: `apps/shell-server/config.json`

```json
{
  "development": {
    "port": 3500,
    "defaultWorkspace": "root",
    "defaultCwd": ".alive/shell-server",
    "workspaceBase": "/root/webalive",
    "allowWorkspaceSelection": true
  },
  "production": {
    "port": 3888,
    "defaultWorkspace": "root",
    "defaultCwd": "/root/alive",
    "workspaceBase": "/root/webalive",
    "allowWorkspaceSelection": false
  }
}
```

## Configuration Properties

| Property | Type | Description |
|----------|------|-------------|
| `port` | number | Port the shell-server listens on |
| `defaultWorkspace` | string | Default workspace identifier |
| `defaultCwd` | string | Default working directory (absolute or relative to `process.cwd()`) |
| `workspaceBase` | string | Base path for all workspace operations |
| `allowWorkspaceSelection` | boolean | Whether users can select different workspaces |

## Environment Selection

The server selects configuration based on `NODE_ENV`:

```typescript
const env = process.env.NODE_ENV || 'development'
const envConfig = config[env] || config.development
```

**Default**: Falls back to `development` if `NODE_ENV` not set.

## Path Resolution

### Relative vs Absolute Paths

The `defaultCwd` can be specified as:
- **Absolute path**: Used as-is (e.g., `/root/alive`)
- **Relative path**: Resolved against `process.cwd()` (e.g., `.alive/shell-server`)

```typescript
const resolvedDefaultCwd = envConfig.defaultCwd.startsWith('/')
  ? envConfig.defaultCwd
  : join(process.cwd(), envConfig.defaultCwd)
```

**Use case**: Relative paths enable local development with isolated workspaces.

## Development Mode

### Auto-Creation of Workspace

In development, the server automatically creates the workspace directory if it doesn't exist:

```typescript
if (env === 'development' && !existsSync(resolvedDefaultCwd)) {
  mkdirSync(resolvedDefaultCwd, { recursive: true })

  // Create README to explain the directory
  const readmeContent = `# Local Development Workspace
This directory is your local shell-server workspace for development.
- Auto-created by shell-server on first run
- Gitignored (won't be committed)
- Isolated from production infrastructure
- Safe to experiment with files and scripts`

  writeFileSync(join(resolvedDefaultCwd, 'README.md'), readmeContent)
}
```

**Result**: Developers get a clean, isolated workspace at `.alive/shell-server/` in the project root.

### Workspace Selection

Development mode allows workspace selection (`allowWorkspaceSelection: true`), enabling:
- Testing with different workspace paths
- Simulating multi-tenant scenarios
- Debugging workspace isolation

**Security**: Production mode disables this (`allowWorkspaceSelection: false`).

## Production Mode

### Fixed Configuration

Production uses hardcoded, secure defaults:
- **Port**: 3888 (dedicated port, not dev)
- **Working directory**: `/root/alive` (absolute path)
- **Workspace selection**: Disabled (security)

### Security Considerations

1. **No workspace selection**: Users cannot choose arbitrary paths
2. **Absolute paths**: No ambiguity about working directory
3. **Fixed base**: `workspaceBase` restricts all operations
4. **Rate limiting**: Enforced globally (40 attempts per 10 minutes)
5. **Session persistence**: Rate limit state survives restarts

## Usage in Code

```typescript
// Server startup logs configuration
console.log(`[CONFIG] Environment: ${env}`)
console.log(`[CONFIG] Port: ${envConfig.port}`)
console.log(`[CONFIG] Default workspace: ${resolvedDefaultCwd}`)
console.log(`[CONFIG] Workspace selection: ${envConfig.allowWorkspaceSelection ? 'enabled' : 'disabled'}`)

// Example output (development):
// [CONFIG] Environment: development
// [CONFIG] Port: 3500
// [CONFIG] Default workspace: /root/alive/.alive/shell-server
// [CONFIG] Workspace selection: enabled

// Example output (production):
// [CONFIG] Environment: production
// [CONFIG] Port: 3888
// [CONFIG] Default workspace: /root/alive
// [CONFIG] Workspace selection: disabled
```

## Git Ignore

Development workspaces are gitignored to prevent committing local files:

```gitignore
# .gitignore
.alive/
```

**Result**: Each developer's local workspace is isolated and won't be committed.

## Local Development Setup

### First Run

```bash
# Start in development mode (default)
cd apps/shell-server
bun run dev

# Output:
# [CONFIG] Creating development workspace: /root/alive/.alive/shell-server
# [CONFIG] Environment: development
# [CONFIG] Port: 3500
# [CONFIG] Default workspace: /root/alive/.alive/shell-server
# [CONFIG] Workspace selection: enabled
```

### Access

```bash
# Terminal UI
open http://localhost:3500

# Login with SHELL_PASSWORD environment variable
```

## Production Deployment

```bash
# Set environment
export NODE_ENV=production
export SHELL_PASSWORD="secure_password_here"

# Start server
cd apps/shell-server
bun run start

# Output:
# [CONFIG] Environment: production
# [CONFIG] Port: 3888
# [CONFIG] Default workspace: /root/alive
# [CONFIG] Workspace selection: disabled
```

### Environment Variables

Required in production:
- `NODE_ENV=production` - Selects production config
- `SHELL_PASSWORD` - Authentication password
- `PORT` (optional) - Override config port if needed

## Makefile Integration

The shell-server is integrated with the project Makefile:

```bash
# Start development shell-server
make shell

# Or directly
cd apps/shell-server && bun run dev
```

## Security Notes

### Development
- ✅ Workspace selection enabled (testing)
- ✅ Relative path workspace (isolated)
- ✅ Auto-creation of workspace directory
- ⚠️  Less strict (convenient for development)

### Production
- 🔒 Workspace selection disabled
- 🔒 Absolute path workspace (explicit)
- 🔒 No auto-creation (must exist)
- 🔒 Rate limiting with persistent state
- 🔒 Fixed port, no overrides

## Troubleshooting

### Issue: Workspace Directory Not Found

**Symptom**: `ENOENT: no such file or directory` in production

**Cause**: Production mode doesn't auto-create directories

**Solution**: Manually create the workspace directory
```bash
mkdir -p /root/alive
```

### Issue: Port Already in Use

**Symptom**: `EADDRINUSE: address already in use`

**Cause**: Another process using the configured port

**Solution**: Check config and kill conflicting process
```bash
# Check what's using the port
lsof -ti:3500   # Development
lsof -ti:3888   # Production

# Kill if needed
lsof -ti:3500 | xargs kill
```

### Issue: Workspace Selection Not Working

**Symptom**: UI doesn't show workspace selector

**Cause**: Running in production mode

**Solution**: Check `NODE_ENV` and config
```bash
echo $NODE_ENV
# Should be empty or "development" for workspace selection
```

## See Also

- [Deployment Environments](../deployment/ENVIRONMENTS_CONFIG.md) - Bridge environment config
- [Local Development Setup](../guides/local-development-setup.md) - Development guide
- [Shell Server Recovery](../operations/SHELL_SERVER_RECOVERY.md) - Recovery procedures
