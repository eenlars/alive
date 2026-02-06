# Package Installation with Automatic Dev Server Restart

## Overview

The package installer tool now automatically restarts the dev server after successful package installation. This ensures that new dependencies are immediately available to the running application.

## Problem

Previously, when the `install_package` tool installed a missing package (e.g., `zustand`), the dev server would not pick up the new dependency. Users had to manually restart the dev server to use the newly installed package, causing build failures and requiring manual intervention.

**Example:** In `startup.alive.best`, the missing `zustand` package caused import errors that prevented Tailwind CSS from loading.

## Solution

### Architecture

The solution uses a two-stage process:

1. **Install package** - Uses `bun add` to install the package (unchanged)
2. **Detect workspace domain** - Extracts the domain from the workspace path
3. **Restart systemd service** - Automatically restarts the site's systemd service via `systemctl restart`

### Files Modified

#### 1. New File: `lib/workspace-service-manager.ts`

Utility functions for workspace service management:

- `extractDomainFromWorkspace(workspaceRoot)` - Extracts domain from path like `/srv/webalive/sites/example.com/user`
- `domainToServiceName(domain)` - Converts domain to systemd service name (e.g., `site@example-com.service`)
- `restartSystemdService(domain, requestId)` - Restarts the systemd service
- `isServiceRunning(domain, requestId)` - Checks if service is currently running

**Security features:**
- No shell injection (uses `spawnSync` with `shell: false`)
- Service names validated before restart
- Proper error handling and logging

#### 2. Updated: `lib/error-codes.ts`

Added two new error codes following the existing convention:

```typescript
PACKAGE_INSTALL_FAILED: "PACKAGE_INSTALL_FAILED",
DEV_SERVER_RESTART_FAILED: "DEV_SERVER_RESTART_FAILED",
```

With corresponding error messages via `getErrorMessage()`:
- `PACKAGE_INSTALL_FAILED` - When `bun add` fails
- `DEV_SERVER_RESTART_FAILED` - When systemctl restart fails (but package was installed)

#### 3. Updated: `app/api/install-package/route.ts`

Modified to use the new utility functions and error codes:

**Before:** Installation returned simple success/failure
**After:** Installation + restart with three possible outcomes:

1. **Complete Success** (200 OK)
   - Package installed
   - Dev server restarted
   - Returns: `ok: true, message: "...", details: { devServerRestarted: true }`

2. **Partial Success** (500 with `DEV_SERVER_RESTART_FAILED`)
   - Package installed ✓
   - Dev server restart failed ✗
   - Returns: `ok: false, error: DEV_SERVER_RESTART_FAILED, details: { packageInstalled: true }`

3. **Installation Failed** (500 with `PACKAGE_INSTALL_FAILED`)
   - Package install failed ✗
   - Returns: `ok: false, error: PACKAGE_INSTALL_FAILED`

4. **No Domain Detected** (200 OK, partial success)
   - Package installed ✓
   - Domain couldn't be extracted from path
   - Dev server NOT restarted
   - Returns: `ok: true, message: "...", details: { devServerRestarted: false }`

## How It Works

### Workspace Path Detection

The domain is extracted from the `workspaceRoot` parameter:

```
/srv/webalive/sites/startup.alive.best/user → startup.alive.best
/srv/webalive/sites/two.goalive.nl/user/    → two.goalive.nl
/root/webalive/sites/test/user              → test
```

**Validation:**
- Path must end with `/user`
- Domain must match alphanumeric + dots (e.g., `example.com`)

### Service Restart

Once domain is extracted, the systemd service is restarted:

```bash
systemctl restart site@startup-alive-best.service
```

The service name is derived by:
1. Replacing dots with hyphens: `startup.alive.best` → `startup-alive-best`
2. Prefixing with `site@`: `site@startup-alive-best.service`

### Error Handling

**systemctl restart can fail for:**
- Service doesn't exist (workspace not deployed)
- Permission denied (running as unprivileged user)
- Service timeout (systemd issues)

When restart fails, we return `DEV_SERVER_RESTART_FAILED` to distinguish from `PACKAGE_INSTALL_FAILED`:
- Tells user the package IS installed (they can see it in `package.json`)
- Explains the dev server needs manual restart
- Preserves state in error details for debugging

## Usage Example

When the tool installs a package:

```typescript
// User request
{
  "packageName": "zustand",
  "workspaceRoot": "/srv/webalive/sites/startup.alive.best/user"
}

// Success response (200 OK)
{
  "ok": true,
  "message": "Successfully installed zustand and restarted dev server",
  "details": {
    "packageSpec": "zustand",
    "devServerRestarted": true
  }
}

// Partial success response (500)
{
  "ok": false,
  "error": "DEV_SERVER_RESTART_FAILED",
  "message": "Failed to restart site@startup-alive-best.service",
  "details": {
    "service": "site@startup-alive-best.service",
    "packageInstalled": true,
    "packageSpec": "zustand"
  }
}
```

## Testing

### Unit Tests

The workspace path extraction logic was tested with 7 test cases:

```
✓ /srv/webalive/sites/startup.alive.best/user → startup.alive.best
✓ /srv/webalive/sites/two.goalive.nl/user/ → two.goalive.nl
✓ /srv/webalive/sites/example.com/user → example.com
✓ /root/webalive/sites/test/user → test
✓ /srv/webalive/sites/staging.goalive.nl/user → staging.goalive.nl
✓ /invalid/path → null (handled gracefully)
✓ /srv/webalive/sites/example.com/src → null (not a /user path)
```

### Manual Testing

To test the feature:

1. Install a missing package in a site workspace:
   ```bash
   curl -X POST http://localhost:8997/api/install-package \
     -H "Content-Type: application/json" \
     -d '{
       "workspaceRoot": "/srv/webalive/sites/startup.alive.best/user",
       "packageName": "zustand"
     }'
   ```

2. Verify the response includes `devServerRestarted: true`

3. Check that the service restarted:
   ```bash
   systemctl status site@startup-alive-best.service
   # Should show "Active: active (running)" with recent start time
   ```

## Security Considerations

✅ **No shell injection** - Uses `spawnSync(..., { shell: false })` with args array
✅ **Service name validation** - Rejects invalid domain names before calling systemctl
✅ **Proper error handling** - Errors logged but don't crash the API
✅ **Follows error conventions** - Uses centralized `ErrorCodes` enum
✅ **Workspace isolation** - Service restart is scoped to the detected workspace

## Known Limitations

1. **Synchronous restart** - Dev server restart blocks the response (30s timeout). This is acceptable because:
   - Timeout is generous (packages are small, restart is fast)
   - Blocking ensures client knows immediately if restart succeeded
   - Alternative (async restart) would require polling and more complexity

2. **No automatic discovery** - Requires workspace path to be passed correctly
   - Already validated at the API level
   - Graceful fallback if domain extraction fails

3. **Service must exist** - Requires systemd service to be deployed
   - Only applies to systemd-managed sites
   - Legacy PM2 sites will have dev server NOT restarted (by design)

## Future Enhancements

Possible improvements (not required for current implementation):

- [ ] Add metrics tracking (restart success rate)
- [ ] Support PM2-managed sites (alternative restart method)
- [ ] Async restart option with polling endpoint
- [ ] Configurable restart timeout
- [ ] Integration with workspace health checks

## Rollback

If issues arise with the automatic restart:

1. Comment out the `restartSystemdService()` call in the route
2. Build and deploy via Makefile: `make staging` or contact devops for production
3. Users can manually restart services as before

No database changes or migrations required.

## Related

- **Error handling**: `lib/error-codes.ts`
- **Workspace management**: `docs/guides/workspace-permission-setup.md`
- **Systemd deployment**: `/root/webalive/CLAUDE.md` - Infrastructure section
- **Similar feature**: `app/api/manager/route.ts` - Workspace restart endpoint
