# DNS Verification System

## Overview

The DNS verification system validates that domains correctly serve content from our origin server by checking for a unique verification file, rather than relying on IP address matching or CDN-specific logic.

## How It Works

### Verification File

Each site includes a verification file at:
```
/.well-known/alive-verify.txt
```

This file contains the server's origin IP address:
```
YOUR_SERVER_IP
```

### Verification Process

The DNS check (`apps/web/app/api/manager/status/route.ts`) performs the following steps:

1. **DNS Resolution**: Resolve the domain's A record to get the IP it points to
2. **File Fetch**: Attempt to fetch the verification file via HTTPS, then HTTP
3. **Content Validation**: Check if the file content matches our server IP
4. **Proxy Detection**: If the resolved IP differs from our origin IP, mark as proxied

### Verification Methods

The system reports one of these verification methods:

- **`https`**: Verification file successfully fetched via HTTPS
- **`http`**: Verification file successfully fetched via HTTP
- **`direct-ip`**: No verification file, but DNS points directly to origin
- **`none`**: No verification file found and IP doesn't match
- **`error`**: DNS resolution failed

## Benefits

### Works with Any CDN/Proxy

Unlike IP range checking (e.g., Cloudflare IP lists), this approach works with:
- Cloudflare
- Any other CDN or proxy service
- Direct DNS
- Multiple proxies in a chain

### Proves Origin Connectivity

The verification file confirms that:
1. DNS is configured (domain resolves)
2. Traffic reaches our origin server (file is served)
3. The site is actually hosted on our server (correct content)

### No Maintenance Required

- No need to update CDN IP range lists
- No CDN-specific logic
- Future-proof against CDN changes

## Implementation Details

### Template Setup

**File location**: `packages/template/user/public/.well-known/alive-verify.txt`

This file is automatically included in all new sites deployed from the template.

### Adding to Existing Sites

**Script**: `scripts/add-verification-files.sh`

```bash
# Add verification files to all existing sites
./scripts/add-verification-files.sh
```

This script:
1. Iterates through all sites in `/srv/webalive/sites` and `/root/webalive/sites`
2. Creates `public/.well-known/` directory structure
3. Writes verification file with server IP
4. Sets correct ownership to site user (e.g., `site-example-com`)

### DNS Check Logic

**Function**: `checkDnsResolution()` in `apps/web/app/api/manager/status/route.ts`

```typescript
async function checkDnsResolution(
  domain: string,
  serverIp: string
): Promise<{
  pointsToServer: boolean
  resolvedIp: string | null
  isProxied?: boolean
  verificationMethod?: string
}>
```

**Logic**:
1. Resolve DNS A record
2. Try HTTPS: `https://domain/.well-known/alive-verify.txt`
3. If HTTPS fails, try HTTP
4. Compare file content with `serverIp`
5. If match: `pointsToServer = true`, detect proxy if IPs differ
6. If no file: fallback to direct IP comparison

## Manager UI Display

The `/manager` page shows DNS status with details:

- ✅ **"verified via https (proxied)"** - Cloudflare/CDN proxied, verified
- ✅ **"verified via https"** - Direct DNS, verified
- ✅ **"verified via direct-ip"** - No verification file, but IP matches
- ❌ **"points to X.X.X.X (verification failed)"** - Wrong IP or no verification
- ❌ **"not resolved"** - DNS lookup failed

## Future Enhancements

### Per-Domain Verification Tokens

Instead of using the server IP, generate unique tokens per domain:

```
domain-specific-secret-token
```

This would:
- Prevent spoofing (copy-paste verification files)
- Allow multi-server setups
- Enable domain-specific security

### Verification Metadata

Extend the verification file format:

```json
{
  "server_ip": "YOUR_SERVER_IP",
  "domain": "example.com",
  "deployed_at": "2025-11-10T17:00:00Z",
  "version": "1.0"
}
```

This would provide:
- Deployment timestamps
- Domain ownership confirmation
- Version tracking

## Troubleshooting

### Verification Failing for New Site

**Symptoms**: DNS check shows "verification failed" even though site loads

**Solutions**:
1. Ensure `public/.well-known/` directory exists in site
2. Check verification file content: `cat /srv/webalive/sites/domain/user/public/.well-known/alive-verify.txt`
3. Test file accessibility: `curl https://domain/.well-known/alive-verify.txt`
4. Verify file ownership matches site user: `ls -la /srv/webalive/sites/domain/user/public/.well-known/`

### File Not Accessible

**Symptoms**: `curl` returns 404 for verification file

**Solutions**:
1. **Vite**: Files in `public/` are served automatically, no rebuild needed
2. **Next.js**: Files in `public/` require rebuild: `bun run build`
3. **Static server**: Ensure server is configured to serve `.well-known` directory
4. Check if site is running: `systemctl status site@domain.service`

### Wrong Server IP in File

**Symptoms**: Verification method shows "none" even though file exists

**Solutions**:
1. Check server config: `cat "$SERVER_CONFIG_PATH"` (path from `SERVER_CONFIG_PATH` env var, points to `server-config.json`)
2. Update verification file: `echo "YOUR_SERVER_IP" > /srv/webalive/sites/domain/user/public/.well-known/alive-verify.txt`
3. Fix ownership: `chown site-domain-slug:site-domain-slug /srv/webalive/sites/domain/user/public/.well-known/alive-verify.txt`

## Related Files

- `apps/web/app/api/manager/status/route.ts` - DNS check implementation
- `apps/web/app/manager/page.tsx` - Manager UI display
- `apps/web/types/domain.ts` - Type definitions
- `packages/template/user/public/.well-known/alive-verify.txt` - Template file
- `scripts/add-verification-files.sh` - Migration script
- `server-config.json` (located at `SERVER_CONFIG_PATH` env var) - Server IP configuration
