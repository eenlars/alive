# Website Deployment Architecture: A to Z

## Overview

The WebAlive infrastructure provides **secure, isolated, multi-tenant website deployment** using systemd process isolation, Caddy reverse proxy, and integrated user authentication. Each deployed site runs as a dedicated system user with file system restrictions and resource limits.

---

## Architecture Components

### 1. **Deployment Tool: `sitectl`**
- **Location**: `packages/deploy-scripts/src/sitectl.ts`
- **Purpose**: Orchestrates the entire deployment process
- **Alternative**: Manual script at `scripts/deploy-site-systemd.sh`

### 2. **Template System**
- **Location**: `packages/template/user/`
- **Contents**: Base website with Hono server, HTML/CSS/JS assets
- **Includes**: DNS verification file at `.well-known/bridge-verify.txt`

### 3. **Process Management: systemd**
- **Service Pattern**: `site@{domain-slug}.service`
- **Unit File**: `/etc/systemd/system/site@.service`
- **Features**: User isolation, resource limits, security hardening

### 4. **Reverse Proxy: Caddy**
- **Generated Sites**: `generated/Caddyfile.sites` (path derived from `SERVER_CONFIG_PATH` env var)
- **Shim Import**: `<ALIVE_ROOT>/ops/caddy/Caddyfile` (imports generated routing)
- **System Config**: `/etc/caddy/Caddyfile` (imports shim + prod/staging)
- **Features**: Automatic HTTPS, zero-downtime reloads

### 5. **User Management: Supabase**
- **Auth Provider**: Email/password authentication
- **User Table**: `iam.users` with `password_hash` (bcrypt)
- **Workspace Access**: Users linked to domains they own

### 6. **Port Registry**
- **Location**: `domain-passwords.json` (path derived from `SERVER_CONFIG_PATH` env var)
- **Format**: JSON with domain → port/password mappings
- **Auto-increment**: Starts at 3333, increments for each new site

---

## Deployment Flow (A → Z)

### **Phase 1: Pre-Deployment Validation**

```
Input: domain.com (+ optional email for owner)
  ↓
1. Validate domain format
2. Check DNS resolution
3. Verify ports available (3333-65535 range)
4. Check template exists
```

### **Phase 2: System User Creation**

```
Domain: example.com → System User: site-example-com
  ↓
1. Create dedicated Linux user: useradd --system --no-create-home site-example-com
2. Lock password (no direct login): passwd -l site-example-com
3. User restricted to workspace: /srv/webalive/sites/example.com/
```

**Security Features:**
- No shell access (prevents SSH login)
- No home directory (reduces attack surface)
- Process runs with UID of this user (file permissions enforced)

### **Phase 3: Workspace Setup**

```
Create directory structure:
  ↓
/srv/webalive/sites/example.com/
├── user/                    # Application code (from template)
│   ├── index.ts            # Hono server entry point
│   ├── index.html          # Main HTML file
│   ├── styles.css          # Styling
│   ├── public/             # Static assets
│   │   └── .well-known/
│   │       └── bridge-verify.txt  # DNS verification (YOUR_SERVER_IP)
│   ├── js/                 # JavaScript modules
│   └── pages/              # Additional pages
├── package.json            # Dependencies
├── bun.lockb              # Lock file
└── node_modules/          # Installed packages
  ↓
Set ownership: chown -R site-example-com:site-example-com /srv/webalive/sites/example.com/
Set permissions: chmod -R 755 (readable/executable by all, writable by owner)
```

### **Phase 4: Port Assignment**

```
Load registry: domain-passwords.json (from SERVER_CONFIG_PATH dir)
  ↓
Check if domain exists:
  - YES → Reuse existing port
  - NO  → Assign next available port (max + 1)
  ↓
Generate password: "supersecret" (default) or auto-generated
  ↓
Save to registry:
{
  "example.com": {
    "port": 3338,
    "password": "supersecret",
    "deployedAt": "2025-11-20T10:30:00Z"
  }
}
```

### **Phase 5: Systemd Service Creation**

```
Template: /etc/systemd/system/site@.service (parameterized unit)
  ↓
Service configuration:
[Unit]
Description=WebAlive Site: %i
After=network.target

[Service]
Type=simple
User=site-%i                    # Runs as dedicated user
WorkingDirectory=/srv/webalive/sites/%i/
ExecStart=/usr/local/bin/bun user/index.ts
Environment="PORT={assigned_port}"
Restart=always
RestartSec=10

# Security Hardening
ProtectSystem=strict            # Read-only /usr, /boot, /efi
ProtectHome=yes                 # No access to /home
NoNewPrivileges=yes             # Cannot gain privileges
PrivateTmp=yes                  # Isolated /tmp
ReadWritePaths=/srv/webalive/sites/%i/  # Only write to workspace

# Resource Limits
MemoryLimit=512M                # Max memory usage
CPUQuota=50%                    # Max CPU usage
LimitNOFILE=1024                # Max open files

[Install]
WantedBy=multi-user.target
  ↓
Activate service:
1. systemctl daemon-reload      # Load new service
2. systemctl enable site@example-com.service  # Start on boot
3. systemctl start site@example-com.service   # Start now
```

### **Phase 6: Caddy Reverse Proxy Configuration**

```
Generate routing:
bun run --cwd packages/site-controller routing:generate
  ↓
Sync filtered sites file:
bun <ALIVE_ROOT>/scripts/sync-generated-caddy.ts
  ↓
Reload Caddy (zero-downtime):
systemctl reload caddy
  ↓
Caddy handles:
- Automatic HTTPS (Let's Encrypt)
- Certificate renewal
- HTTP → HTTPS redirect
- Request routing to localhost:3338
```

**Two-Tier Caddy Setup:**
- **Main Config**: `/etc/caddy/Caddyfile` (system-wide, imports shim + prod/staging)
- **Shim**: `<ALIVE_ROOT>/ops/caddy/Caddyfile` (imports generated routing)
- **Generated Sites**: `generated/Caddyfile.sites` (path derived from `SERVER_CONFIG_PATH` env var)
- **Sync**: Filtered copy at `<ALIVE_ROOT>/ops/caddy/generated/Caddyfile.sites`

### **Phase 7: User Account Creation (Supabase)**

```
If email provided:
  ↓
Check Supabase: iam.users WHERE email = {email}
  ↓
User exists?
  - YES → Link domain to existing user
  - NO  → Create new user:
    - email: user@example.com
    - password_hash: bcrypt(password)
    - metadata: { domains: ["example.com"] }
  ↓
Update user metadata:
{
  "ownedDomains": ["example.com", "other.com"],
  "createdAt": "2025-11-20T10:30:00Z"
}
```

### **Phase 8: DNS Verification**

```
DNS verification file deployed at:
https://example.com/.well-known/bridge-verify.txt
  ↓
Contents: YOUR_SERVER_IP (server IP)
  ↓
Purpose:
- Validates traffic reaches origin server
- Supports CDN/Cloudflare proxy setups
- Manager dashboard shows "verified via https (proxied)"
```

### **Phase 9: Health Check & Validation**

```
POST-deployment checks:
  ↓
1. systemctl is-active site@example-com.service
   → Expected: "active"
  ↓
2. curl http://localhost:3338
   → Expected: HTTP 200
  ↓
3. curl https://example.com
   → Expected: HTTP 200 (with valid HTTPS)
  ↓
4. curl https://example.com/.well-known/bridge-verify.txt
   → Expected: "YOUR_SERVER_IP"
  ↓
All checks pass → Deployment SUCCESS ✓
```

---

## State Machine Diagram

**📊 [View Complete State Machine Diagram](./site-deployment-state-machine.md)**

The deployment flow is documented in a detailed state machine diagram showing all states, transitions, and error paths with line number references to the actual implementation.

---

## Known Issues & Current Architecture Limitations

**⚠️ Current State:** The deployment architecture described above is **functional but has known issues** being addressed in an upcoming refactoring.

### Critical Issue: Ordering Problem

**Problem:** Infrastructure is deployed BEFORE Supabase registration.

The deployment flow currently executes in this order:

```
1. deploySite() → Infrastructure deployed (systemd, Caddy, files, user)
2. registerDomain() → Supabase registration (user + domain)
```

**Impact:** If Step 2 fails (wrong password, duplicate email, Supabase timeout):
- systemd service is already running
- Port is already consumed in registry
- Linux user is already created
- Files are already deployed
- **NO ROLLBACK MECHANISM EXISTS**

**Example Failure Scenario:**
1. User deploys `example.com` with email `user@test.com` and password `wrong123`
2. Infrastructure deploys successfully (service running on port 3333)
3. Supabase rejects: "Password incorrect for existing user"
4. API returns 400 error to user
5. **Orphaned resources:** Service still running, port consumed, no database entry

### Additional Known Issues

1. **Mixed Concerns**: Infrastructure layer requires `email` parameter but never uses it
   - TypeScript library validates email exists (line 62-64) but only passes it through
   - Creates false dependency between auth and infrastructure

2. **Dual Implementation**: Two complete deployment implementations
   - TypeScript library (205 lines, used by API)
   - Bash script (408 lines, manual deployments only)
   - Maintenance burden, feature parity challenges

3. **Port Registry Divergence**: Two sources of truth for port assignments
   - JSON file (`domain-passwords.json`) written during infrastructure deploy
   - Supabase (`app.domains.port`) written during registration
   - No sync mechanism if they diverge

4. **No Rollback**: Partial failures leave inconsistent state
   - No cleanup of infrastructure if Supabase fails
   - No cleanup of Supabase if infrastructure fails

5. **Concurrent Conflicts**: Limited locking mechanisms
   - Caddy file locking only (30s timeout)
   - No distributed locks for port assignment
   - Potential race conditions

### Detailed Analysis

For complete analysis including:
- 3 complete state machines (API Route, TypeScript Library, Bash Script)
- Database schema details
- Interaction flows and sequence diagrams
- 6 detailed pain points
- Solution space exploration

See: **[REFACTORING_PROBLEM_STATEMENT.md](./REFACTORING_PROBLEM_STATEMENT.md)**

### Current Architecture (As-Is)

For a high-level overview of the current deployment flow with data flows and component responsibilities:

See: **[CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md)**

---

## File Locations Reference

| Component | Path | Purpose |
|-----------|------|---------|
| **Deployment Tool** | `packages/deploy-scripts/src/sitectl.ts` | Main deployment orchestrator |
| **Template** | `packages/template/user/` | Base website code |
| **Workspace** | `/srv/webalive/sites/{domain}/` | Site files (new secure location) |
| **Legacy Workspace** | `/root/webalive/sites/{domain}/` | Old PM2 sites (migrate to systemd) |
| **Systemd Unit** | `/etc/systemd/system/site@.service` | Service template |
| **Caddy Routing** | `generated/Caddyfile.sites` (from `SERVER_CONFIG_PATH` dir) | Generated site routing |
| **Caddy Shim** | `<ALIVE_ROOT>/ops/caddy/Caddyfile` | Imports generated routing |
| **Caddy System** | `/etc/caddy/Caddyfile` | System config + imports |
| **Port Registry** | `domain-passwords.json` (from `SERVER_CONFIG_PATH` dir) | Port assignments |
| **DNS Verification** | `{domain}/.well-known/bridge-verify.txt` | IP verification (YOUR_SERVER_IP) |

---

## Security Architecture

### **Isolation Layers**

1. **Process Isolation** (systemd user)
   - Each site = dedicated Linux user
   - Cannot read/write other sites' files
   - Cannot access system directories

2. **File System Isolation** (ProtectSystem)
   - Read-only: `/usr`, `/boot`, `/efi`
   - No access: `/home`, `/root`
   - Write only: `/srv/webalive/sites/{domain}/`

3. **Resource Isolation** (cgroups)
   - Memory limit: 512MB per site
   - CPU quota: 50% per site
   - File descriptor limit: 1024

4. **Network Isolation** (localhost binding)
   - Sites bind to `localhost:{port}` only
   - No direct external access
   - All traffic via Caddy reverse proxy

### **Authentication Flow**

```
User → Alive Login → Supabase Auth
  ↓
JWT token issued (with user ID)
  ↓
Workspace selection → Verify user owns domain
  ↓
Access granted to /srv/webalive/sites/{domain}/
  ↓
Claude tool calls scoped to workspace (path validation)
```

---

## Deployment Commands

### **Full Deployment (Recommended)**

```bash
# With email (creates/links Supabase user)
export DEPLOY_EMAIL="user@example.com"
bun run deploy-site example.com

# Or using sitectl directly
bun packages/deploy-scripts/src/sitectl.ts example.com
```

### **Manual Steps (Advanced)**

```bash
# 1. Create system user
sudo useradd --system --no-create-home site-example-com
sudo passwd -l site-example-com

# 2. Create workspace
sudo mkdir -p /srv/webalive/sites/example.com
sudo cp -r packages/template/user/* /srv/webalive/sites/example.com/

# 3. Set permissions
sudo chown -R site-example-com:site-example-com /srv/webalive/sites/example.com/
sudo chmod -R 755 /srv/webalive/sites/example.com/

# 4. Install dependencies (as workspace user)
cd /srv/webalive/sites/example.com/
sudo -u site-example-com bun install

# 5. Configure systemd
sudo systemctl daemon-reload
sudo systemctl enable site@example-com.service
sudo systemctl start site@example-com.service

# 6. Update Caddy
bun run --cwd packages/site-controller routing:generate
bun <ALIVE_ROOT>/scripts/sync-generated-caddy.ts
sudo systemctl reload caddy

# 7. Verify
systemctl status site@example-com.service
curl http://localhost:{assigned_port}
curl https://example.com
```

---

## Monitoring & Troubleshooting

### **Check Service Status**

```bash
# View service status
systemctl status site@example-com.service

# View logs (last 50 lines)
journalctl -u site@example-com.service -n 50

# Follow logs in real-time
journalctl -u site@example-com.service -f
```

### **Common Issues**

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| **Service won't start** | `systemctl status` shows "failed" | Check logs: `journalctl -u site@{slug}` |
| **Permission denied** | User can't read/write files | Fix ownership: `chown -R site-{slug}:{slug}` |
| **Port conflict** | Port already in use | Check registry, assign new port |
| **503 Bad Gateway** | Caddy can't reach backend | Verify service is active, port is correct |
| **DNS not resolving** | Domain doesn't point to server | Update DNS A record to YOUR_SERVER_IP |

### **Restart/Reload Commands**

```bash
# Restart site service
sudo systemctl restart site@example-com.service

# Reload Caddy (zero-downtime)
sudo systemctl reload caddy

# Restart Caddy (brief downtime)
sudo systemctl restart caddy

# View Caddy logs
journalctl -u caddy -f
```

---

## Architecture Benefits

1. **Security First**: Process isolation prevents cross-site attacks
2. **Resource Control**: Memory/CPU limits prevent runaway processes
3. **Zero-Downtime Deploys**: Caddy reload without connection drops
4. **Automatic HTTPS**: Let's Encrypt certificates managed by Caddy
5. **User-Friendly**: One account works across all owned domains
6. **CDN Compatible**: DNS verification supports proxied setups
7. **Audit Trail**: systemd logs all process activity
8. **Easy Rollback**: systemd service versioning and snapshots

---

## Migration Path (Legacy PM2 → systemd)

For sites still using PM2:

```bash
# 1. Deploy new systemd version
bun run deploy-site legacy-site.com

# 2. Stop PM2 process
pm2 stop legacy-site

# 3. Verify systemd site works
curl https://legacy-site.com

# 4. Remove from PM2
pm2 delete legacy-site
pm2 save

# 5. Update Caddy (if needed)
# Point domain to new systemd service port
```

---

## Summary

The WebAlive deployment architecture provides **production-grade security and isolation** for multi-tenant website hosting through:

- **Automated deployment** via `sitectl` tool
- **systemd process management** with dedicated users
- **Caddy reverse proxy** with automatic HTTPS
- **Supabase authentication** for user accounts
- **DNS verification** for CDN compatibility
- **Comprehensive monitoring** via systemd logs

Each deployment takes **< 60 seconds** and results in a fully isolated, production-ready website with automatic HTTPS and user authentication.
