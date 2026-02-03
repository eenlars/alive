# Manager Permissions Checker

**Feature Added**: November 10, 2025
**Location**: Manager `/manager` → Domain list → 🔒 button

## Overview

A manual permissions inspection tool in the manager dashboard that allows checking and fixing file ownership for any deployed website. This helps diagnose and resolve the ownership issues discovered in the [components.alive.best postmortem](../postmortems/single-website-allowedhosts-or-blank-page.md).

## Why This Feature Exists

**Problem**: The deployment script had a bug where config generation ran as root AFTER the initial ownership fix, creating files with wrong ownership. This prevented systemd services (which run as dedicated users like `site-domain-com`) from reading their own files.

**Solution**: Manual inspection tool that shows:
- Which files are owned by root (security risk)
- Which files are owned by the wrong user
- One-click fix to correct all ownership

## Usage

### Checking Permissions

1. Go to `/manager` (requires manager authentication)
2. Find the domain you want to inspect
3. Click the 🔒 button next to the domain
4. Modal shows:
   - **Expected Owner**: `site-domain-slug` (the systemd user)
   - **Total Files**: Count of all files in the site directory
   - **Root-Owned Files**: Files owned by root (❌ security issue)
   - **Wrong Owner Files**: Files owned by anyone other than expected owner

### Fixing Permissions

If wrong ownership is detected:
1. Review the sample files shown in the modal
2. Click **"Fix Permissions"** button
3. System runs `chown -R site-domain-slug:site-domain-slug /srv/webalive/sites/domain/`
4. Automatically rechecks to verify fix
5. Modal updates with new results

### Rechecking

After fixing or making manual changes:
1. Click **"Recheck"** button in the modal
2. System re-scans the directory
3. Results update in real-time

## Technical Implementation

### API Endpoints

**GET `/api/manager/permissions?domain=example.com`**
- Requires manager authentication
- Checks file ownership for the domain
- Returns permission stats and sample file lists

**POST `/api/manager/permissions`**
- Body: `{ domain: "example.com", action: "fix" }`
- Requires manager authentication
- Fixes ownership recursively
- Returns updated permission stats

### Backend Logic

```typescript
// File: apps/web/app/api/manager/permissions/route.ts

async function checkDomainPermissions(domain: string) {
  const slug = domain.replace(/[^a-zA-Z0-9]/g, "-")
  const expectedOwner = `site-${slug}`
  const siteDir = `/srv/webalive/sites/${domain}`

  // Count total files
  find "${siteDir}" -type f | wc -l

  // Find root-owned files
  find "${siteDir}" -user root -type f

  // Find wrong-owner files
  find "${siteDir}" ! -user "${expectedOwner}" -type f
}

async function fixDomainPermissions(domain: string) {
  const slug = domain.replace(/[^a-zA-Z0-9]/g, "-")
  const expectedOwner = `site-${slug}`
  const siteDir = `/srv/webalive/sites/${domain}`

  // Verify user exists
  id "${expectedOwner}"

  // Fix ownership recursively
  chown -R "${expectedOwner}:${expectedOwner}" "${siteDir}"
}
```

### Frontend UI

**Button**: Purple lock icon (🔒) in domain list row

**Modal Components**:
- Header: Domain name and "File Permissions" title
- Loading state: Spinner while checking
- Stats grid: Expected owner + Total files
- Root-owned files card: Red if >0, green if 0
- Wrong-owner files card: Orange if >0, green if 0
- Sample files: First 10 files with truncated paths
- Warning banner: Shown if issues detected
- Actions: Close, Fix Permissions (conditional), Recheck

### Color Coding

- 🟢 **Green**: No issues (0 wrong-owner files)
- 🔴 **Red**: Root-owned files detected (critical)
- 🟠 **Orange**: Files owned by wrong user (warning)
- 🟡 **Yellow**: Warning banner when fix is needed

## Security Considerations

### Authentication

- **REQUIRED**: Manager authentication via `isManagerAuthenticated()`
- Only accessible to users logged in to the "manager" workspace
- Uses JWT verification to prevent token tampering

### Command Execution

- All shell commands sanitized via TypeScript template strings
- Domain slugs validated (only alphanumeric and hyphens)
- User existence verified before `chown` operations
- No user input directly passed to shell

### File Access

- Only operates within `/srv/webalive/sites/` directory
- Validates site directory exists before operations
- Cannot access files outside systemd workspace boundaries

## Common Use Cases

### 1. Post-Deployment Verification

After deploying a new site, check that all files have correct ownership:
```
✅ Expected: site-example-com
✅ Total Files: 1,247
✅ Root-Owned Files: 0
✅ Wrong Owner Files: 0
```

### 2. Debugging Permission Errors

Site showing "permission denied" in logs:
```
❌ Root-Owned Files: 3
   /srv/webalive/sites/example.com/user/vite.config.ts
   /srv/webalive/sites/example.com/user/vite.config.docker.ts
   /srv/webalive/sites/example.com/user/package.json

Fix Permissions → Fixed! → Restart service
```

### 3. Manual File Editing Cleanup

After editing files as root by mistake:
```
⚠️ Wrong Owner Files: 15
   All files in user/src/ directory

Fix Permissions → Ownership restored
```

## Comparison to Fix Script

This feature complements the existing `fix-file-ownership.sh` script:

| Feature | Manager UI | fix-file-ownership.sh |
|---------|-----------|----------------------|
| **Access** | Web UI | SSH/root required |
| **Scope** | Single domain | All domains |
| **Verification** | Visual inspection | Log output |
| **Selective** | ✅ Choose which to fix | ❌ Fixes all or none |
| **Sample Files** | ✅ Shows problematic files | ✅ Can list with --dry-run |
| **Automation** | Manual trigger | Can automate with cron |

**When to use Manager UI**:
- Quick inspection of single domain
- Visual verification of fix
- Non-technical users
- One-off checks

**When to use script**:
- Bulk operations on all sites
- Automation/cron jobs
- Dry-run testing
- Server maintenance

## Future Enhancements

### Potential Additions

1. **Automatic Checks**: Run permission check on domain status refresh
2. **Warning Indicators**: Show 🔒⚠️ badge in domain list if issues detected
3. **Scheduled Checks**: Cron job to detect and report permission drift
4. **Permission History**: Log when permissions were last checked/fixed
5. **User-Level Details**: Show which specific user owns wrong files
6. **Dry Run**: Preview changes before applying fix

### Integration with Status Checks

Could add permission status to existing domain status checks:

```typescript
interface DomainStatus {
  // Existing fields...
  httpsAccessible: boolean
  portListening: boolean
  systemdServiceRunning: boolean

  // New fields
  permissionsCorrect?: boolean
  rootOwnedFileCount?: number
  wrongOwnerFileCount?: number
}
```

## Related Documentation

- [Deployment Script Fix](../postmortems/single-website-allowedhosts-or-blank-page.md#prevention-measures) - How deployment script was fixed
- [File Ownership Script](/scripts/fix-file-ownership.sh) - Bulk ownership fix
- [Systemd Deployment](/scripts/deploy-site-systemd.sh) - Secure deployment process
- [Manager Documentation](../../CLAUDE.md#manager) - Manager authentication and features

## Testing

### Manual Testing Steps

1. **Deploy a site with intentional ownership issues**:
   ```bash
   # Deploy normally
   ./scripts/deploy-site-systemd.sh test-permissions.com

   # Break ownership
   touch /srv/webalive/sites/test-permissions.com/user/bad-file.txt
   ```

2. **Check permissions via Manager**:
   - Go to /manager
   - Click 🔒 on test-permissions.com
   - Should show 1 wrong-owner file

3. **Fix via Manager**:
   - Click "Fix Permissions"
   - Should show 0 wrong-owner files after fix

4. **Verify service works**:
   ```bash
   systemctl restart site@test-permissions-com.service
   systemctl status site@test-permissions-com.service
   ```

### API Testing

```bash
# Check permissions (requires manager session cookie)
curl -b cookies.txt \
  "https://terminal.goalive.nl/api/manager/permissions?domain=example.com"

# Fix permissions
curl -X POST -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.com","action":"fix"}' \
  https://terminal.goalive.nl/api/manager/permissions
```

## Troubleshooting

### "User does not exist" Error

**Cause**: Systemd user not created
**Solution**: Redeploy site using `deploy-site-systemd.sh`

### "Site directory does not exist" Error

**Cause**: Domain not deployed or wrong path
**Solution**: Check `/srv/webalive/sites/` directory

### Fix button doesn't appear

**Cause**: All permissions are correct
**Expected**: Button only shows when `wrongOwnerFiles > 0`

### Permissions fixed but service still failing

**Cause**: Need to restart service to pick up changes
**Solution**:
```bash
systemctl restart site@domain-slug.service
```

## Monitoring

Currently no automated monitoring. Consider adding:

1. **Alerting**: Email when wrong permissions detected
2. **Metrics**: Track permission issues per domain over time
3. **Audit Log**: Record who checked/fixed permissions and when
4. **Health Checks**: Include in automated domain health dashboard

---

**Implementation Files**:
- Backend: `apps/web/app/api/manager/permissions/route.ts`
- Frontend: `apps/web/app/manager/page.tsx` (lines 48-52, 520-567, 718-725, 1051-1218)
- Auth: `apps/web/features/auth/lib/auth.ts` (lines 93-99)
