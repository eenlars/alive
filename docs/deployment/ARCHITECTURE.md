# Build System Architecture

**Purpose:** Technical design, internals, and failure mode analysis.

## Design Goals

1. **Zero downtime** - No partial builds served
2. **Atomic swaps** - Either old or new, never half-baked
3. **Quick rollback** - Keep last 3 builds ready
4. **Staging isolation** - Dev server independent of production
5. **Failure resilience** - 92% of failure scenarios protected

## How It Works

### Build Isolation

**Problem:** Traditional builds write to `dist/` while PM2 serves from `dist/` → race condition

**Solution:** Build to temporary location, move to timestamped directory, atomically swap symlink

```
Step 1: Build                  Step 2: Timestamp             Step 3: Atomic Swap
apps/web/.next/               .builds/dist.TIMESTAMP/        .builds/current → new
       ↓                              ↓                              ↓
.builds/dist/                 mv to timestamped              ln -sfn (atomic)
       ↓                              ↓                              ↓
(temporary)                    (permanent)                    PM2 restart
```

**Why atomic?**
- `ln -sfn` is a kernel-level atomic operation (POSIX guarantee)
- Old symlink replaced in single syscall
- No intermediate state where symlink is broken
- PM2 restart happens AFTER symlink is stable

### Directory Structure

```
.builds/                               # Isolated at project root
├── current → dist.20251105-180718     # Symlink (atomic swap)
├── dist.20251105-180718/              # Latest build
│   ├── standalone/                    # Next.js standalone output
│   │   └── apps/web/
│   │       ├── server.js              # PM2 serves this
│   │       ├── .next/static/          # CSS, JS (copied from build)
│   │       └── public/                # Assets (copied from build)
│   ├── static/                        # Original Next.js output
│   └── server/                        # Server chunks
├── dist.20251105-180529/              # Previous (rollback ready)
└── dist.20251105-180347/              # Backup

apps/web/
└── .next/                             # Build source + staging dev
    └── dev/                           # Staging dev server only
```

### Build Process

```bash
# 1. Preserve staging
if [ -d apps/web/.next/dev ]; then
    mv apps/web/.next/dev apps/web/.next.dev-backup
fi

# 2. Build (Next.js writes to apps/web/.next/)
cd apps/web && bun run build

# 3. Move to isolated location
mv apps/web/.next .builds/dist

# 4. Copy static assets to standalone
cp -r .builds/dist/static .builds/dist/standalone/apps/web/.next/static
cp -r apps/web/public .builds/dist/standalone/apps/web/public

# 5. Restore staging
if [ -d apps/web/.next.dev-backup ]; then
    mkdir -p apps/web/.next
    mv apps/web/.next.dev-backup apps/web/.next/dev
fi

# 6. Timestamp
mv .builds/dist .builds/dist.TIMESTAMP

# 7. Atomic symlink swap
cd .builds && ln -sfn dist.TIMESTAMP current

# 8. Cleanup (keep last 3)
ls -dt dist.* | tail -n +4 | xargs rm -rf
```

### Static Asset Handling

**Problem:** Next.js standalone mode doesn't auto-copy `.next/static` and `public/`

**Why?** Standalone bundles server code but expects assets to be served separately (e.g., CDN)

**Solution:** Build script explicitly copies:
```bash
# CSS, JS, chunks
.builds/dist/static → .builds/dist/standalone/apps/web/.next/static

# Images, fonts, etc
apps/web/public → .builds/dist/standalone/apps/web/public
```

This ensures `/_next/static/chunks/*.css` resolves correctly.

### Staging Isolation

**Challenge:** Production build removes `.next` directory, breaking staging dev server

**Solution:** Backup/restore pattern

```bash
# Before build
DEV_BACKUP=""
if [ -d apps/web/.next/dev ]; then
    DEV_BACKUP="apps/web/.next.dev-backup"
    mv apps/web/.next/dev "$DEV_BACKUP"
fi

# After build moves .next → .builds/dist
if [ -n "$DEV_BACKUP" ]; then
    mkdir -p apps/web/.next
    mv "$DEV_BACKUP" apps/web/.next/dev
fi
```

**Result:**
- Production builds to `.next` → moves to `.builds/`
- Staging uses `.next/dev` (preserved across builds)
- Complete isolation: no interference

## Protection Analysis

### Failure Mode Coverage: 12/13 (92%)

| Scenario | Protected | Method |
|----------|-----------|--------|
| Concurrent deploys | ✅ | Lock file (`/tmp/claude-bridge-deploy.lock`) |
| Corrupted server | ✅ | PM2 detects crash, sets status "errored" |
| Failed builds | ✅ | Old build untouched until symlink swap |
| Port conflicts | ✅ | Check `pm2 list` before deploy |
| Disk exhaustion | ✅ | Pre-check: require 250MB available |
| Static assets missing | ✅ | Explicit copy to standalone |
| Staging broken | ✅ | Dev files backed up/restored |
| Zombie processes | ✅ | `pkill -f "next start"` before PM2 start |
| Network failures | ✅ | Git pull is non-fatal (continues with local) |
| Build cleanup | ✅ | Auto-remove builds beyond last 3 |
| Symlink race | ✅ | Kernel-level atomic operation |
| Build isolation | ✅ | Separate paths until atomic swap |
| Rollback to broken | ⚠️ | **Untested** (requires breaking 2 builds) |

### How Each Protection Works

**1. Concurrent Deploys**

Lock file with PID:
```bash
LOCK_FILE="/tmp/claude-bridge-deploy.lock"
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE")
    echo "ERROR: Deployment already in progress (PID: $PID)"
    exit 1
fi
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT
```

**2. Port Conflicts**

Check PM2 process list (not lsof, which shows interpreter):
```bash
if pm2 list | grep -q "claude-bridge.*online"; then
    # Our process, will be replaced
else
    # Non-PM2 process, block deploy
    exit 1
fi
```

**3. Disk Space**

Pre-build check:
```bash
REQUIRED_MB=250
AVAILABLE_MB=$(df -BM "$PROJECT_ROOT" | tail -1 | awk '{print $4}' | sed 's/M//')
if [ "$AVAILABLE_MB" -lt "$REQUIRED_MB" ]; then
    echo "ERROR: Insufficient disk space"
    exit 1
fi
```

**4. Static Assets**

Explicit copy after build:
```bash
if [ -d "$TEMP_BUILD_DIR/static" ]; then
    mkdir -p "$STANDALONE_DIR/.next"
    cp -r "$TEMP_BUILD_DIR/static" "$STANDALONE_DIR/.next/static"
fi

if [ -d "$WEB_DIR/public" ]; then
    cp -r "$WEB_DIR/public" "$STANDALONE_DIR/public"
fi
```

**5. Failed Builds**

Build verification before swap:
```bash
if [ ! -d ".builds/dist" ]; then
    echo "ERROR: Build directory not found"
    exit 1  # Old build remains active
fi
```

**6. Cleanup Policy**

Auto-remove old builds:
```bash
cd .builds
OLD_BUILDS=$(ls -dt dist.* 2>/dev/null | tail -n +4)
if [ -n "$OLD_BUILDS" ]; then
    echo "$OLD_BUILDS" | xargs rm -rf
fi
```

Keeps:
- Current (via symlink)
- Previous (rollback target)
- Backup (safety)

## Configuration Deep Dive

### Next.js Config

```javascript
// apps/web/next.config.js
const nextConfig = {
  distDir: ".next",           // Always build to .next (moved by script)
  output: "standalone",       // Creates self-contained server.js
  // ...
}
```

**Why `.next` not `.builds/dist`?**
1. Next.js must write to directory under app root
2. Build script moves it to `.builds/` after compilation
3. Cleaner separation: build artifact vs deploy artifact

### PM2 Config

**Production:**
```javascript
{
  script: '.builds/current/standalone/apps/web/server.js',
  interpreter: 'bun',
  cwd: '/root/webalive/claude-bridge',
  env: { PORT: '8999', NODE_ENV: 'production' }
}
```

**Staging:**
```javascript
{
  script: 'bunx',
  args: 'next dev --turbo -p 8998',
  cwd: '/root/webalive/claude-bridge/apps/web',
  env: { NODE_ENV: 'development' }
}
```

## Testing & Verification

### Manual Tests Performed

1. **Concurrent deploys**: Second deploy blocked with PID
2. **CSS loading**: HTTP 200 on `/_next/static/chunks/*.css`
3. **Staging isolation**: Both servers HTTP 200 after deploy
4. **Failed build**: Syntax error → old build still active
5. **Port conflict**: Non-PM2 process → deploy blocked
6. **Disk space**: Free space check prevents build start
7. **Build cleanup**: Only last 3 builds remain
8. **Manual build**: `bun run build` doesn't affect production

### Automated Checks

Build script verifies:
- ✅ Disk space (250MB)
- ✅ Port availability (PM2 process check)
- ✅ Build output exists (`.builds/dist` directory)
- ✅ Staging dev files backed up
- ✅ Static assets copied to standalone

## Performance

**Build times:**
- Tools package: ~2s
- Web app: ~15s
- Total: ~17s

**Deploy times:**
- Full deploy: ~25s (includes git, install, build, PM2 restart)
- Build only: ~17s
- PM2 restart: ~1-2s

**Disk usage:**
- Per build: ~127MB
- Last 3 builds: ~400MB
- Standalone includes all dependencies (self-contained)

## Why This Design

### Timestamped Directories

**Alternative:** Overwrite `dist/` directory

**Problem:** Race condition if PM2 reads during build

**Solution:** Build to new timestamped directory, swap symlink atomically

**Benefit:** Zero-downtime, instant rollback

### Symlink-Based Deployment

**Alternative:** Copy files to fixed location

**Problem:** Copy takes time, PM2 might serve partial copy

**Solution:** Symlink update is atomic (kernel syscall)

**Benefit:** No intermediate broken state

### Standalone Mode

**Alternative:** `bun next start` (requires node_modules)

**Problem:** Production needs node_modules directory

**Solution:** Standalone bundles all dependencies

**Benefit:** Self-contained, portable, no node_modules in production

### Build Isolation

**Alternative:** Build in `apps/web/.next/`

**Problem:** Pollutes source tree, conflicts with staging

**Solution:** Move to `.builds/` at project root

**Benefit:** Clean source, staging independence, gitignored

## Future Improvements

**High priority:**
- [ ] Health check before declaring success
- [ ] Build timeout (currently can hang forever)
- [ ] Monitor stale lock files (cron job cleanup)

**Medium priority:**
- [ ] Test rollback to corrupted build scenario
- [ ] Add alerting on build failure
- [ ] Implement automatic rollback on health check failure

**Low priority:**
- [ ] Document recovery procedures for each failure mode
- [ ] Add webhook notifications
- [ ] Implement canary deployments
