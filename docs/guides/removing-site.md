# How to Remove a Site from WebAlive Infrastructure

This guide explains how to completely remove a deployed site from the WebAlive infrastructure.

## When to Remove a Site

- Site deployment failed and left partial artifacts
- Domain is no longer needed
- Site needs to be redeployed from scratch
- Cleaning up test/development sites

## Complete Removal Steps

Follow these steps in order to ensure all traces of the site are removed:

### 1. Stop the systemd Service

```bash
systemctl stop site@domain-slug.service
```

Note: Replace `domain-slug` with the domain converted to systemd format (dots become dashes).
Example: `larsvandeneeden.com` becomes `larsvandeneeden-com`

### 2. Remove from Domain Registry

Edit `/var/lib/alive/domain-passwords.json` and remove the domain entry:

```json
{
  "other-domain.com": {
    "password": "supersecret",
    "port": 3340
  },
  "domain-to-remove.com": {    ← Remove this entire block
    "password": "supersecret",   ← Remove this entire block
    "port": 3342                 ← Remove this entire block
  }                              ← Remove this entire block
}
```

### 3. Remove from Caddyfile

Edit `/root/alive/Caddyfile` and remove the domain block:

```
domain-to-remove.com {           ← Remove this entire block
    import common_headers        ← Remove this entire block
    reverse_proxy localhost:3342 {  ← Remove this entire block
        header_up Host {host}    ← Remove this entire block
        header_up X-Real-IP {remote_host}  ← Remove this entire block
        header_up X-Forwarded-For {remote_host}  ← Remove this entire block
        header_up X-Forwarded-Proto {scheme}  ← Remove this entire block
    }                            ← Remove this entire block
}                                ← Remove this entire block
```

### 4. Remove System User

```bash
userdel site-domain-slug
```

Example: `userdel site-larsvandeneeden-com`

### 5. Remove Environment File

```bash
rm -f /etc/sites/domain-slug.env
```

Example: `rm -f /etc/sites/larsvandeneeden-com.env`

### 6. Remove Site Directory

```bash
rm -rf /srv/webalive/sites/domain.com
```

Example: `rm -rf /srv/webalive/sites/larsvandeneeden.com`

### 7. Reload Caddy Configuration

```bash
systemctl reload caddy
```

This applies the Caddyfile changes immediately.

## Verification

After removal, verify the site is completely gone:

```bash
# Check no systemd service exists
systemctl status site@domain-slug.service

# Check user was removed
id site-domain-slug

# Check environment file is gone
ls /etc/sites/domain-slug.env

# Check site directory is gone
ls /srv/webalive/sites/domain.com

# Check domain not in registry
grep "domain.com" /var/lib/alive/domain-passwords.json

# Check domain not in Caddyfile
grep "domain.com" /root/alive/Caddyfile
```

All commands should return "not found" or similar errors.

## Example: Complete Removal

Here's a complete example removing `larsvandeneeden.com`:

```bash
# 1. Stop service
systemctl stop site@larsvandeneeden-com.service

# 2. Edit domain-passwords.json (remove larsvandeneeden.com entry)
# 3. Edit Caddyfile (remove larsvandeneeden.com block)

# 4. Remove user
userdel site-larsvandeneeden-com

# 5. Remove environment file
rm -f /etc/sites/larsvandeneeden-com.env

# 6. Remove site directory
rm -rf /srv/webalive/sites/larsvandeneeden.com

# 7. Reload Caddy
systemctl reload caddy
```

## Notes

- **Order matters**: Stop the service first to prevent file access issues
- **Backup first**: If the site has valuable data, backup `/srv/webalive/sites/domain.com` before removal
- **Port reuse**: Once removed, the port becomes available for new deployments
- **DNS**: You may also want to remove the domain's DNS A record if it's no longer needed

## Common Issues

**Permission denied**: Make sure you're running as root or with sudo

**Service still running**: The systemd service may restart automatically. Use `systemctl disable site@domain-slug.service` first, then stop it

**Port still occupied**: Check if another process grabbed the port with `netstat -tuln | grep :PORT`