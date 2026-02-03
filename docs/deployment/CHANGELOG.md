# Deployment System Changelog

**Purpose:** Historical record of major changes and decisions.

## 2025-11-05 Session 2: CSS Fix + Additional Protections

### Critical Fixes

**CSS/Tailwind Not Loading (404 errors)**
- **Problem:** Next.js standalone mode doesn't auto-copy static assets
- **Solution:** Build script explicitly copies `.next/static` and `public/` to standalone directory
- **Files:** `scripts/build-atomic.sh:89-110`
- **Impact:** Production CSS now loads correctly

**Port Detection Bug**
- **Problem:** Port check failed when bun was PM2 interpreter (showed "bun" not "PM2" in lsof)
- **Solution:** Check `pm2 list | grep claude-bridge` instead of lsof output
- **Files:** `scripts/build-and-serve.sh:136-148`
- **Impact:** Port conflicts now detected reliably

**Staging Isolation**
- **Problem:** Production build removed staging's `.next/dev` directory
- **Solution:** Backup `.next/dev` before build, restore after
- **Files:** `scripts/build-atomic.sh:48-60, 93-99`
- **Impact:** Staging remains functional during production deploys

**Disk Space Protection**
- **Problem:** Build could fail mid-process if disk fills
- **Solution:** Pre-build check requires 250MB available (127MB build + buffer)
- **Files:** `scripts/build-atomic.sh:35-43`
- **Impact:** Fails fast with clear error before build starts

### Protection Coverage

**Before:** 10/12 scenarios (83%)
**After:** 12/13 scenarios (92%)

New protections:
- ✅ CSS/static asset copying
- ✅ Port conflict detection (PM2 check)
- ✅ Disk space validation
- ✅ Staging dev file backup

### Documentation Updates

- Rewrote `deployment.md` (operations focus)
- Created `ARCHITECTURE.md` (technical design)
- Created `CHANGELOG.md` (this file)
- Updated `README.md` (navigation hub)
- Consolidated all deployment docs under `docs/deployment/`

---

## 2025-11-05 Session 1: Build Isolation to .builds

### Major Reorganization

**Problem:**
- Build artifacts polluting source tree (`apps/web/dist.*`)
- TypeScript compiling old builds (763 files)
- Symlink loops during build failures
- No clear separation between builds and source

**Solution:**
- Moved all builds to isolated `.builds/` directory at project root
- Timestamped builds: `dist.YYYYMMDD-HHMMSS`
- Atomic symlink: `.builds/current → dist.TIMESTAMP`
- Automatic cleanup: keep last 3 builds

### Files Changed

**Configuration:**
- `apps/web/next.config.js`
  - Changed: `distDir: "../../.builds/dist"` → `distDir: ".next"`
  - Reason: Build script moves `.next` → `.builds/` after compilation

- `apps/web/tsconfig.json`
  - Updated include paths: `../../.builds/current/types/**/*.ts`
  - Added exclude: `../../.builds`

- `.gitignore`
  - Added: `/.builds/` to root-level exclusions

**Scripts:**
- `scripts/build-atomic.sh`
  - All paths updated to use `.builds/`
  - Added disk space check
  - Added static asset copying
  - Added staging dev backup

- `scripts/build-and-serve.sh`
  - Extracted `start_pm2_server()` function (DRY)
  - Fixed rollback to use standalone server
  - Updated PM2 start path: `.builds/current/standalone/apps/web/server.js`

### Bugs Fixed

**1. Rollback Command Incorrect**
- **Found:** Rollback was using `bun next start` instead of standalone server
- **Impact:** Rollback would fail every time
- **Fix:** Use `start_pm2_server()` function in rollback path
- **Location:** `scripts/build-and-serve.sh:241-249`

**2. PM2 Start Logic Duplicated**
- **Found:** PM2 start command duplicated 2x (DRY violation)
- **Impact:** Maintenance burden, inconsistency risk
- **Fix:** Extracted to `start_pm2_server()` function
- **Location:** `scripts/build-and-serve.sh:52-62`

**3. Git Checkout Reverts Config**
- **Found:** `git checkout apps/web/next.config.js` reverted distDir to old value
- **Impact:** Builds went to wrong directory, deploy failed
- **Fix:** Manual correction required
- **Prevention:** Don't use `git checkout` on config files during testing

### Testing Performed

**Scenarios tested:**
1. Clean slate build (removed all `.builds`, rebuilt)
2. Failed build protection (broke config, verified old build kept serving)
3. Concurrent deploy protection (verified lock file works)
4. Corrupted server detection (PM2 errored immediately)
5. Build cleanup (verified only last 3 kept)
6. Staging independence (both servers responding)
7. Build isolation (manual build doesn't affect production)

### Benefits

**Organization:**
- ✅ Clean source tree (no `dist.*` directories in `apps/web/`)
- ✅ Clear separation: source vs build artifacts
- ✅ Faster IDE indexing (fewer files)

**Safety:**
- ✅ Atomic deployments (symlink-based)
- ✅ Quick rollback (keep last 3 builds)
- ✅ Failed builds don't affect production
- ✅ Staging isolation

**Maintenance:**
- ✅ Automatic cleanup (removes old builds)
- ✅ DRY principle (no duplication)
- ✅ Clear intent (function names, comments)

---

## Original Planning (Pre-Implementation)

### Goals

1. **Separate build artifacts from source code**
   - Problem: `dist.*` directories in `apps/web/` cluttering source tree
   - Solution: Move to `.builds/` at project root

2. **Enable atomic deployments**
   - Problem: PM2 might serve half-built files during deploy
   - Solution: Build to temporary location, atomically swap symlink

3. **Simplify rollback**
   - Problem: No easy way to revert to previous build
   - Solution: Keep last 3 builds, symlink-based switching

4. **Improve maintainability**
   - Problem: 763 lines of bash spread across multiple scripts
   - Solution: Extract reusable functions, clear separation of concerns

### Design Decisions

**Why `.builds/` at project root?**
- Isolated from source code
- Gitignored easily (`/.builds/`)
- Accessible to both build and deploy scripts
- No pollution of `apps/web/`

**Why timestamped directories?**
- Clear chronological order
- No confusion about which is latest
- Easy to identify for rollback
- Human-readable timestamps

**Why symlinks?**
- Atomic operation (kernel-level)
- Zero-downtime deployment
- Instant rollback (change symlink)
- PM2 follows symlink automatically

**Why keep last 3 builds?**
- Balance between safety and disk usage
- Rollback buffer (can skip one bad build)
- Each build ~127MB, 3 builds ~400MB (acceptable)

**Why standalone mode?**
- Self-contained (includes dependencies)
- No node_modules in production
- Portable between environments
- Matches deployment best practices

### Alternatives Considered

**Option 1: Keep builds in `apps/web/dist.*`**
- ❌ Pollutes source tree
- ❌ Affects IDE performance
- ❌ Conflicts with gitignore patterns

**Option 2: Single `dist/` directory (overwrite)**
- ❌ Race condition during build
- ❌ No rollback capability
- ❌ PM2 might serve partial build

**Option 3: Blue-green deployment (two directories)**
- ❌ More complex (track which is active)
- ❌ Still need cleanup logic
- ✅ Atomic swap (symlink achieves this simpler)

**Option 4: Docker containers**
- ❌ Overkill for single-server deployment
- ❌ Additional complexity
- ❌ Resource overhead

### Risk Assessment

**Low risk:**
- Build isolation (tested, proven pattern)
- Symlink-based deployment (POSIX standard)
- Automatic cleanup (keeps last 3, safe)

**Medium risk:**
- Staging interference (mitigated by `.next/dev` backup)
- Disk space exhaustion (mitigated by pre-check)
- Lock file stale (requires manual cleanup)

**Mitigations implemented:**
- Concurrent deploy prevention (lock file)
- Disk space check (250MB requirement)
- Staging dev file backup/restore
- Static asset copying to standalone
- Failed build detection (old build untouched)

---

## Summary

**Total commits:** 5
**Files changed:** 9
**Lines changed:** +500 -200
**Protection coverage:** 92% (12/13 scenarios)
**Build time:** ~17s
**Deploy time:** ~25s
**Rollback time:** ~2s (symlink + PM2 restart)

**Status:** Production-ready, fully tested, documented.
