# Image Storage Setup on Hetzner Server

This document explains the image storage system for Alive on the Hetzner server.

## Architecture Overview

The image storage system provides:
- **Multi-tenant isolation**: Each workspace gets its own storage namespace
- **Content-addressed storage**: Images are stored by hash to prevent duplicates
- **Multiple variants**: Automatic generation of different sizes (orig, w640, w1280, thumb)
- **Fast static serving**: Direct file serving via Caddy
- **Workspace integration**: Images are scoped to Alive workspaces

## Storage Structure

Images are stored at `/srv/webalive/storage/` with the following hierarchy:

```
/srv/webalive/storage/
└── t/{tenantId}/
    └── o/{contentHash}/
        └── v/{variant}.webp
```

**Example:**
```
/srv/webalive/storage/t/larsvandeneeden.com/o/f4b33c6157d6346d/v/
├── orig.webp     # Original uploaded image
├── w640.webp     # 640px wide variant
├── w1280.webp    # 1280px wide variant
└── thumb.webp    # Thumbnail variant
```

## Tenant ID Resolution

Tenant IDs are derived from workspace paths:

- **Workspace**: `/srv/webalive/sites/larsvandeneeden.com/user/src`
- **Tenant ID**: `larsvandeneeden.com` (extracted from path)
- **Terminal mode**: Uses workspace-specific tenant IDs, not `terminal-alive-main`

## URL Structure

Images are accessible via `/_images/*` paths:

```
https://terminal.goalive.nl/_images/t/larsvandeneeden.com/o/f4b33c6157d6346d/v/w640.webp
https://larsvandeneeden.com/_images/t/larsvandeneeden.com/o/f4b33c6157d6346d/v/thumb.webp
```

## Caddy Configuration

### Working Configuration (✅)

All domains use `handle_path /_images/*` which strips the `/_images` prefix:

```caddyfile
# In /root/alive/Caddyfile
(image_serving) {
    handle_path /_images/* {
        root * /srv/webalive/storage
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }
}

# In /etc/caddy/Caddyfile
terminal.goalive.nl {
    handle_path /_images/* {
        root * /srv/webalive/storage
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }
    handle {
        reverse_proxy localhost:9000
    }
}
```

### Path Mapping

When Caddy receives: `/_images/t/larsvandeneeden.com/o/hash/v/w640.webp`

1. `handle_path /_images/*` strips `/_images` prefix
2. Remaining path: `t/larsvandeneeden.com/o/hash/v/w640.webp`
3. Combined with root: `/srv/webalive/storage/t/larsvandeneeden.com/o/hash/v/w640.webp`
4. File served directly

### Common Mistakes (❌)

**Wrong**: Using `route /_images/*` without path stripping
```caddyfile
# This looks for /srv/webalive/storage/_images/t/... (wrong!)
route /_images/* {
    root * /srv/webalive/storage
    file_server
}
```

## API Endpoints

### Upload: `POST /api/images/upload`
- Accepts FormData with `file` and optional `workspace`
- Generates multiple WebP variants automatically
- Uses workspace resolution to determine tenant ID
- Returns structured response with variant paths

### List: `GET /api/images/list`
- Optional `workspace` query parameter for terminal mode
- Returns grouped images by content hash with all variants
- Uses same workspace resolution as upload

### Delete: `DELETE /api/images/delete`
- Accepts JSON body with `key` and optional `workspace`
- Deletes all variants for the given content hash
- Validates tenant ownership

## Frontend Integration

The photobook page (`/photobook`) automatically:
- Detects terminal vs standard mode
- Handles workspace parameter for terminal mode
- Displays images with proper variant URLs
- Supports drag & drop upload with progress

## CloudFlare Considerations

**Issue**: `terminal.goalive.nl` goes through CloudFlare which aggressively caches 404s

**Solution**:
- Caddy configuration is correct for all domains
- New images (different content hashes) work immediately
- Cached 404s only affect previously failed paths
- Cache-busting parameters work: `?v=123`

## Troubleshooting

### Images not loading?

1. **Check Caddy config**: Ensure `handle_path /_images/*` not `route /_images/*`
2. **Verify file exists**: `ls /srv/webalive/storage/t/{tenant}/o/{hash}/v/`
3. **Test cache-busting**: Add `?v=123` to URL
4. **Check CloudFlare**: Try different image (new hash)

### Wrong tenant ID?

- Verify workspace path in terminal mode
- Check `workspaceToTenantId()` function in API routes
- Ensure workspace resolution is working

### Upload failing?

- Check authentication (session cookie)
- Verify workspace parameter for terminal mode
- Check file size and type restrictions
- Review storage directory permissions

## File System Permissions

```bash
# Storage directory should be writable by web server
sudo chown -R www-data:www-data /srv/webalive/storage
sudo chmod -R 755 /srv/webalive/storage
```

## Security Features

- **Path validation**: All file paths validated to stay within storage directory
- **Tenant isolation**: Images scoped to workspace-derived tenant IDs
- **Authentication**: All API endpoints require valid session
- **Content-Type**: Proper WebP content-type headers
- **Immutable caching**: Long cache headers for performance

## Monitoring

Check storage usage:
```bash
du -sh /srv/webalive/storage/
find /srv/webalive/storage -name "*.webp" | wc -l
```

View recent uploads:
```bash
find /srv/webalive/storage -name "*.webp" -newermt "1 hour ago" -exec ls -la {} \;
```
