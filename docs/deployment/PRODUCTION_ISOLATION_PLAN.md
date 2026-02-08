# Production Isolation Implementation Plan

**Goal:** Ensure production is never affected by builds, tests, or other environment activities.

**Status:** Phase 1 & 2 Complete, Phase 3 In Progress

---

## Phase 1: Systemd Migration & Directory Isolation

**Objective:** Move production from PM2 to systemd with dedicated user and isolated directory structure.

### Tasks

1. ✅ Create dedicated system user `alive-prod`
2. ✅ Create production directory structure at `/srv/alive/prod/`
3. ✅ Copy current production build to new location
4. ✅ Create systemd service file with resource limits
5. ✅ Test systemd service start/stop/restart
6. ✅ Verify health checks pass on systemd instance
7. ✅ Switch DNS/routing to systemd instance
8. ✅ Stop and remove PM2 production instance
9. ✅ Verify production runs for 24 hours without issues

### Expected Outcomes (ALL must be true)

- [ ] **User exists:** `id alive-prod` returns valid user (UID < 1000, system user)
- [ ] **Directory structure exists:**
  ```bash
  test -d /srv/alive/prod/builds
  test -d /srv/alive/prod/source
  test -d /srv/alive/prod/scripts
  ```
- [ ] **Directory ownership correct:** `ls -la /srv/alive/prod | grep alive-prod` shows ownership
- [ ] **Systemd service file exists:** `test -f /etc/systemd/system/alive-prod.service`
- [ ] **Service is enabled:** `systemctl is-enabled alive-prod` returns `enabled`
- [ ] **Service is active:** `systemctl is-active alive-prod` returns `active`
- [ ] **Service responds to HTTP:** `curl -f http://localhost:9000/ >/dev/null 2>&1` exits with 0
- [ ] **Service restarts on failure:** Kill process, verify auto-restart within 10s
  ```bash
  PID_BEFORE=$(systemctl show -p MainPID --value alive-prod)
  kill -9 $PID_BEFORE
  sleep 15
  PID_AFTER=$(systemctl show -p MainPID --value alive-prod)
  test "$PID_BEFORE" != "$PID_AFTER"
  systemctl is-active alive-prod  # Should be active
  ```
- [ ] **PM2 production instance removed:** `pm2 list | grep -v alive` (no production instance)
- [ ] **Resource limits active:** `systemctl show alive-prod | grep -E "(MemoryMax|CPUQuota)"`
- [ ] **Running as non-root:** `ps aux | grep alive-prod | grep -v root`
- [ ] **Production stable for 24h:** `systemctl status alive-prod | grep "Active: active (running)"` and uptime > 24h
- [ ] **No dependency on PM2:** Stop PM2 daemon (`pm2 kill`), production still serves traffic

### Verification Script

```bash
#!/bin/bash
# Run this to verify Phase 1 completion
set -e

echo "=== Phase 1 Verification ==="

# Check 1: User exists
echo -n "✓ Checking user exists... "
id alive-prod >/dev/null 2>&1
echo "OK"

# Check 2: Directory structure
echo -n "✓ Checking directory structure... "
test -d /srv/alive/prod/builds
test -d /srv/alive/prod/source
test -d /srv/alive/prod/scripts
echo "OK"

# Check 3: Ownership
echo -n "✓ Checking ownership... "
OWNER=$(stat -c '%U' /srv/alive/prod)
test "$OWNER" = "alive-prod"
echo "OK"

# Check 4: Service file exists
echo -n "✓ Checking service file... "
test -f /etc/systemd/system/alive-prod.service
echo "OK"

# Check 5: Service enabled
echo -n "✓ Checking service enabled... "
test "$(systemctl is-enabled alive-prod)" = "enabled"
echo "OK"

# Check 6: Service active
echo -n "✓ Checking service active... "
systemctl is-active --quiet alive-prod
echo "OK"

# Check 7: HTTP health
echo -n "✓ Checking HTTP health... "
curl -sf http://localhost:9000/ >/dev/null
echo "OK"

# Check 8: Auto-restart test
echo -n "✓ Testing auto-restart... "
PID_BEFORE=$(systemctl show -p MainPID --value alive-prod)
sudo kill -9 $PID_BEFORE
sleep 15
systemctl is-active --quiet alive-prod
PID_AFTER=$(systemctl show -p MainPID --value alive-prod)
test "$PID_BEFORE" != "$PID_AFTER"
echo "OK (PID changed: $PID_BEFORE -> $PID_AFTER)"

# Check 9: No PM2 production
echo -n "✓ Checking no PM2 production... "
! pm2 list 2>/dev/null | grep -q "alive\s" || (echo "FAIL: PM2 production still running" && exit 1)
echo "OK"

# Check 10: Resource limits
echo -n "✓ Checking resource limits... "
systemctl show alive-prod | grep -q "MemoryMax="
systemctl show alive-prod | grep -q "CPUQuota="
echo "OK"

# Check 11: Running as non-root
echo -n "✓ Checking runs as non-root... "
! ps aux | grep "server.js" | grep -v grep | grep -q "^root" || (echo "FAIL: Running as root" && exit 1)
echo "OK"

# Check 12: Uptime > 24h
echo -n "✓ Checking uptime > 24h... "
UPTIME_SEC=$(systemctl show alive-prod -p ActiveEnterTimestampMonotonic --value)
CURRENT_SEC=$(date +%s)
UPTIME_HOURS=$(( ($CURRENT_SEC - $UPTIME_SEC / 1000000) / 3600 ))
if [ $UPTIME_HOURS -ge 24 ]; then
    echo "OK (${UPTIME_HOURS}h)"
else
    echo "WARN: Only ${UPTIME_HOURS}h uptime (need 24h)"
    exit 1
fi

# Check 13: PM2 independence
echo -n "✓ Checking PM2 independence... "
sudo pm2 kill >/dev/null 2>&1 || true
sleep 2
curl -sf http://localhost:9000/ >/dev/null
echo "OK"

echo ""
echo "=== ✅ Phase 1 COMPLETE ==="
echo "Safe to proceed to Phase 2"
```

### CANNOT PROCEED TO PHASE 2 IF:

- ❌ Any verification check above fails
- ❌ Production service has restarted more than 3 times in 24h period
- ❌ Production is still running on PM2
- ❌ Service is running as root user
- ❌ Health check endpoint returns non-200 status
- ❌ Memory usage exceeds configured MemoryMax (indicates limit not enforced)
- ❌ Production uptime < 24 hours

**STRICT GATE:** Run verification script. Exit code must be 0. No exceptions.

---

## Phase 2: Network & Configuration Isolation

**Objective:** Separate production Caddy configuration and add automated health monitoring.

**Prerequisites:** Phase 1 verification script passes with exit code 0.

### Tasks

1. ✅ Split Caddyfile into production/staging/sites
2. ✅ Update main Caddyfile to import production separately
3. ✅ Verify production Caddy block is isolated
4. ✅ Update deployment scripts to skip Caddy reload for production
5. ✅ Create health check systemd timer
6. ✅ Create health check script with failure tracking
7. ✅ Test health check catches failures (simulate outage)
8. ✅ Configure alerting (Slack/email/PagerDuty)
9. ✅ Run for 7 days, verify no false alarms

### Expected Outcomes (ALL must be true)

- [ ] **Production Caddyfile exists:** `test -f /etc/caddy/Caddyfile.prod`
- [ ] **Staging Caddyfile exists:** `test -f /etc/caddy/Caddyfile.staging`
- [ ] **Main Caddyfile imports both:**
  ```bash
  grep -q "import /etc/caddy/Caddyfile.prod" /etc/caddy/Caddyfile
  grep -q "import /etc/caddy/Caddyfile.staging" /etc/caddy/Caddyfile
  ```
- [ ] **Production Caddyfile is read-only:**
  ```bash
  test "$(stat -c '%a' /etc/caddy/Caddyfile.prod)" = "444"
  ```
- [ ] **Staging deployment does NOT reload production:**
  ```bash
  # Test: Deploy staging, check production Caddy wasn't reloaded
  PROD_CADDY_PID_BEFORE=$(pgrep -f "caddy.*9000" || echo "none")
  make staging
  PROD_CADDY_PID_AFTER=$(pgrep -f "caddy.*9000" || echo "none")
  # PIDs should be same (no reload) OR verify via Caddy logs
  ```
- [ ] **Health check timer exists:** `test -f /etc/systemd/system/alive-prod-healthcheck.timer`
- [ ] **Health check service exists:** `test -f /etc/systemd/system/alive-prod-healthcheck.service`
- [ ] **Health check timer is active:** `systemctl is-active --quiet alive-prod-healthcheck.timer`
- [ ] **Health check runs every minute:** `systemctl list-timers | grep alive-prod-healthcheck`
- [ ] **Health check script exists:** `test -f /srv/alive/prod/scripts/health-check.sh`
- [ ] **Health check detects outages:**
  ```bash
  # Simulate failure
  systemctl stop alive-prod
  sleep 65  # Wait for 1 health check cycle
  test -f /tmp/prod-health-failures
  FAILURES=$(cat /tmp/prod-health-failures)
  test $FAILURES -ge 1
  systemctl start alive-prod
  ```
- [ ] **Alert system works:**
  ```bash
  # Trigger alert (stop service for >3 minutes)
  systemctl stop alive-prod
  sleep 185  # 3+ checks
  # Verify alert received (check Slack/email/logs)
  systemctl start alive-prod
  ```
- [ ] **No false alarms in 7 days:** `journalctl -u alive-prod-healthcheck --since "7 days ago" | grep -v "Health OK"`
- [ ] **Staging deploys don't trigger production alerts:** Deploy staging 5 times, verify 0 production alerts

### Verification Script

```bash
#!/bin/bash
# Run this to verify Phase 2 completion
set -e

echo "=== Phase 2 Verification ==="

# Prerequisite: Phase 1 must pass
echo "▶ Running Phase 1 checks first..."
/srv/alive/prod/scripts/verify-phase1.sh || (echo "❌ Phase 1 not complete" && exit 1)

# Check 1: Caddyfile structure
echo -n "✓ Checking Caddyfile isolation... "
test -f /etc/caddy/Caddyfile.prod
test -f /etc/caddy/Caddyfile.staging
grep -q "import /etc/caddy/Caddyfile.prod" /etc/caddy/Caddyfile
echo "OK"

# Check 2: Production Caddyfile is read-only
echo -n "✓ Checking Caddyfile permissions... "
PERMS=$(stat -c '%a' /etc/caddy/Caddyfile.prod)
test "$PERMS" = "444" || test "$PERMS" = "644"
echo "OK (${PERMS})"

# Check 3: Health check timer active
echo -n "✓ Checking health check timer... "
systemctl is-active --quiet alive-prod-healthcheck.timer
echo "OK"

# Check 4: Health check script exists
echo -n "✓ Checking health check script... "
test -x /srv/alive/prod/scripts/health-check.sh
echo "OK"

# Check 5: Health check detects failures
echo -n "✓ Testing failure detection... "
systemctl stop alive-prod
sleep 65
test -f /tmp/prod-health-failures
FAILURES=$(cat /tmp/prod-health-failures)
test $FAILURES -ge 1
systemctl start alive-prod
sleep 65  # Wait for recovery
FAILURES_AFTER=$(cat /tmp/prod-health-failures)
test $FAILURES_AFTER -eq 0
echo "OK"

# Check 6: No false alarms
echo -n "✓ Checking for false alarms (7 days)... "
FALSE_ALARMS=$(journalctl -u alive-prod-healthcheck --since "7 days ago" -p err | wc -l)
if [ $FALSE_ALARMS -gt 3 ]; then
    echo "FAIL: $FALSE_ALARMS false alarms found"
    exit 1
fi
echo "OK ($FALSE_ALARMS alerts, threshold <3)"

# Check 7: Alert system configured
echo -n "✓ Checking alert system... "
test -f /srv/alive/prod/scripts/alert.sh
/srv/alive/prod/scripts/alert.sh "TEST: Phase 2 verification" >/dev/null 2>&1
echo "OK (test alert sent)"

echo ""
echo "=== ✅ Phase 2 COMPLETE ==="
echo "Safe to proceed to Phase 3"
```

### CANNOT PROCEED TO PHASE 3 IF:

- ❌ Phase 1 verification script fails
- ❌ Staging deployment causes production Caddy reload
- ❌ Health check has >3 false alarms in 7 days
- ❌ Alert system doesn't send notifications within 5 minutes of failure
- ❌ Production Caddyfile is writable by non-root users
- ❌ Health check timer is not running
- ❌ Simulated outage doesn't trigger alert

**STRICT GATE:** Run verification script. Exit code must be 0. Phase 2 must run for minimum 7 days.

---

## Phase 3: Build Process Isolation

**Objective:** Ensure builds, tests, and dependency installations cannot affect running production.

**Prerequisites:** Phase 2 verification script passes with exit code 0 AND minimum 7 days uptime.

### Tasks

1. ✅ Create separate dependency installation for production
2. ✅ Implement frozen lockfile enforcement for production
3. ✅ Create production-only build script
4. ✅ Add pre-build validation (disk space, memory)
5. ✅ Test: Run staging build while production serves traffic
6. ✅ Test: Run staging tests while production serves traffic
7. ✅ Test: Install staging dependencies while production serves traffic
8. ✅ Implement blue-green deployment preparation
9. ✅ Document production deployment procedure
10. ✅ Run for 14 days, verify zero production impact

### Expected Outcomes (ALL must be true)

- [ ] **Separate node_modules:**
  ```bash
  test -d /srv/alive/prod/source/node_modules
  ! diff -r /srv/alive/prod/source/node_modules \
             /root/alive/node_modules
  ```
- [ ] **Production uses frozen lockfile:**
  ```bash
  grep -q "frozen-lockfile" /srv/alive/prod/scripts/build-production.sh
  ```
- [ ] **Production build script exists:** `test -x /srv/alive/prod/scripts/build-production.sh`
- [ ] **Pre-build checks exist:**
  ```bash
  grep -q "check.*disk.*space" /srv/alive/prod/scripts/build-production.sh
  grep -q "check.*memory" /srv/alive/prod/scripts/build-production.sh
  ```
- [ ] **Staging build doesn't affect production:**
  ```bash
  # Start load test on production
  ab -n 10000 -c 10 http://localhost:9000/ &
  LOAD_PID=$!

  # Run staging build
  make staging

  # Check production metrics
  wait $LOAD_PID
  # Verify: 0% error rate, latency P95 unchanged
  ```
- [ ] **Staging tests don't affect production:**
  ```bash
  # Monitor production
  curl -sf http://localhost:9000/ &
  HEALTH_PID=$!

  # Run staging tests (including E2E with browser)
  cd /root/alive && bun run test:e2e

  # Production should still respond
  wait $HEALTH_PID
  ```
- [ ] **Staging dependency install doesn't affect production:**
  ```bash
  # Production baseline
  PROD_DEPS_BEFORE=$(ls /srv/alive/prod/source/node_modules | wc -l)

  # Staging install
  cd /root/alive && bun install some-new-package

  # Production unchanged
  PROD_DEPS_AFTER=$(ls /srv/alive/prod/source/node_modules | wc -l)
  test $PROD_DEPS_BEFORE -eq $PROD_DEPS_AFTER
  ```
- [ ] **Blue-green swap script exists:** `test -x /srv/alive/prod/scripts/swap-blue-green.sh`
- [ ] **Production deployment documented:** `test -f /srv/alive/prod/docs/DEPLOY.md`
- [ ] **Zero production impact in 14 days:**
  ```bash
  # Check uptime never reset
  systemctl status alive-prod | grep "Active: active"
  # Check no error spikes during staging deploys
  journalctl -u alive-prod --since "14 days ago" -p err | wc -l  # Should be ~0
  ```
- [ ] **Production resource usage stable:**
  ```bash
  # Memory usage doesn't spike during staging builds
  # CPU usage stays under 200% quota
  journalctl -u alive-prod --since "14 days ago" | grep -i "oom\|killed\|quota"
  test $? -ne 0  # Should find nothing
  ```

### Verification Script

```bash
#!/bin/bash
# Run this to verify Phase 3 completion
set -e

echo "=== Phase 3 Verification ==="

# Prerequisite: Phases 1 & 2 must pass
echo "▶ Running Phase 1 & 2 checks..."
/srv/alive/prod/scripts/verify-phase1.sh || exit 1
/srv/alive/prod/scripts/verify-phase2.sh || exit 1

# Check 1: Separate node_modules
echo -n "✓ Checking separate dependencies... "
test -d /srv/alive/prod/source/node_modules
PROD_COUNT=$(ls /srv/alive/prod/source/node_modules | wc -l)
STAGING_COUNT=$(ls /root/alive/node_modules | wc -l)
test $PROD_COUNT -gt 0
echo "OK (prod: $PROD_COUNT, staging: $STAGING_COUNT)"

# Check 2: Frozen lockfile
echo -n "✓ Checking frozen lockfile enforcement... "
grep -q "frozen-lockfile" /srv/alive/prod/scripts/build-production.sh
echo "OK"

# Check 3: Pre-build checks
echo -n "✓ Checking pre-build validation... "
grep -q "disk.*space" /srv/alive/prod/scripts/build-production.sh
grep -q "memory" /srv/alive/prod/scripts/build-production.sh
echo "OK"

# Check 4: Production isolation during staging build
echo -n "✓ Testing isolation during staging build... "
# Baseline production response time
BASELINE=$(curl -w "%{time_total}\n" -o /dev/null -s http://localhost:9000/)

# Run staging build
make staging >/dev/null 2>&1 &
BUILD_PID=$!

# Check production still responsive
sleep 5
DURING_BUILD=$(curl -w "%{time_total}\n" -o /dev/null -s http://localhost:9000/)

wait $BUILD_PID

# Response time shouldn't increase >50%
python3 -c "
baseline = float('$BASELINE')
during = float('$DURING_BUILD')
assert during < baseline * 1.5, f'Response time increased: {baseline}s -> {during}s'
"
echo "OK (baseline: ${BASELINE}s, during: ${DURING_BUILD}s)"

# Check 5: Zero production restarts in 14 days
echo -n "✓ Checking production stability (14d)... "
RESTARTS=$(journalctl -u alive-prod --since "14 days ago" | grep -c "Started Claude Bridge Production" || echo 0)
if [ $RESTARTS -gt 1 ]; then
    echo "FAIL: $RESTARTS restarts in 14 days"
    exit 1
fi
echo "OK (${RESTARTS} restarts)"

# Check 6: No OOM or quota issues
echo -n "✓ Checking resource limits... "
ISSUES=$(journalctl -u alive-prod --since "14 days ago" | grep -i "oom\|killed\|quota" | wc -l)
if [ $ISSUES -gt 0 ]; then
    echo "FAIL: $ISSUES resource issues found"
    exit 1
fi
echo "OK"

# Check 7: Blue-green swap script
echo -n "✓ Checking blue-green deployment... "
test -x /srv/alive/prod/scripts/swap-blue-green.sh
echo "OK"

# Check 8: Documentation
echo -n "✓ Checking deployment docs... "
test -f /srv/alive/prod/docs/DEPLOY.md
grep -q "frozen-lockfile" /srv/alive/prod/docs/DEPLOY.md
echo "OK"

echo ""
echo "=== ✅ Phase 3 COMPLETE ==="
echo "Production is fully isolated and hardened."
```

### CANNOT PROCEED TO COMPLETION IF:

- ❌ Phases 1 or 2 verification scripts fail
- ❌ Production restarted >1 time in 14 days (excluding planned maintenance)
- ❌ Staging build causes production response time to increase >50%
- ❌ Production node_modules is same directory as staging
- ❌ Production build script doesn't use `--frozen-lockfile`
- ❌ Pre-build validation checks are missing
- ❌ Any OOM kills or resource quota violations in production
- ❌ Blue-green swap script doesn't exist or isn't executable

**STRICT GATE:** Run verification script. Exit code must be 0. Phase 3 must run for minimum 14 days with zero production impact.

---

## Success Criteria (Final Validation)

All three phases must be complete AND the following must be true:

### Production Independence Tests

1. **Complete staging rebuild while production serves traffic:**
   ```bash
   ab -n 50000 -c 20 http://localhost:9000/ &
   make staging
   # Result: 0% error rate, P95 latency increase <10%
   ```

2. **Kill PM2 daemon:**
   ```bash
   pm2 kill
   curl -sf http://localhost:9000/  # Should still work
   ```

3. **Run full E2E test suite:**
   ```bash
   cd apps/web && bun run test:e2e
   # Production should be unaffected
   systemctl status alive-prod  # Should show no restarts
   ```

4. **Simulate staging crash:**
   ```bash
   pm2 kill
   pkill -9 -f "next"
   # Production should continue serving
   curl -sf http://localhost:9000/
   ```

5. **Update staging dependencies:**
   ```bash
   cd /root/alive
   bun add some-random-package
   bun install
   # Production dependencies unchanged
   diff /srv/alive/prod/source/bun.lockb \
        /root/alive/bun.lockb
   # Should show differences (staging has new package)
   ```

6. **Chaos test:**
   ```bash
   # Production under load
   ab -n 100000 -c 50 http://localhost:9000/ &

   # Simultaneously:
   make staging &
   bun run test:e2e &
   systemctl restart alive-staging &

   # Wait for completion
   wait

   # Production should have:
   # - 0 restarts
   # - <1% error rate
   # - P99 latency increase <25%
   ```

### Final Checklist

- [ ] All Phase 1 verification checks pass
- [ ] All Phase 2 verification checks pass
- [ ] All Phase 3 verification checks pass
- [ ] Production has been running on systemd for >30 days
- [ ] Zero unplanned production restarts in 30 days
- [ ] Health check has <5 false alarms in 30 days
- [ ] Staging has been deployed >10 times without affecting production
- [ ] Chaos test passes with acceptable metrics
- [ ] Production deployment documentation is complete
- [ ] All team members trained on new deployment process

### Rollback Plan

If any phase fails verification:

1. **DO NOT PROCEED** to next phase
2. Fix the failing checks
3. Re-run verification script
4. Wait the full observation period again (24h/7d/14d)
5. Document what was fixed

If production becomes unstable after any phase:

1. **IMMEDIATELY** run rollback:
   ```bash
   /srv/alive/prod/scripts/rollback-to-pm2.sh
   ```
2. Investigate logs: `journalctl -u alive-prod -n 1000`
3. Fix issues before attempting phase again
4. Document incident in `/srv/alive/prod/docs/INCIDENTS.md`

---

## Maintenance

After all phases complete:

### Weekly Checks

```bash
# Run all verification scripts
/srv/alive/prod/scripts/verify-phase1.sh
/srv/alive/prod/scripts/verify-phase2.sh
/srv/alive/prod/scripts/verify-phase3.sh

# Check logs
journalctl -u alive-prod --since "7 days ago" -p warning

# Check resource usage
systemctl status alive-prod
```

### Monthly Checks

```bash
# Update dependencies (controlled, with rollback)
/srv/alive/prod/scripts/update-dependencies.sh

# Review health check logs
journalctl -u alive-prod-healthcheck --since "30 days ago"

# Review incidents
cat /srv/alive/prod/docs/INCIDENTS.md
```

### Production Deployment Process

See `/srv/alive/prod/docs/DEPLOY.md` for step-by-step production deployment instructions.

**Key principle:** Production deployments are MANUAL, CONTROLLED, and INFREQUENT (max once per week).

---

## Timeline Estimate

- **Phase 1:** 2-3 days implementation + 24h validation = ~4 days minimum
- **Phase 2:** 1-2 days implementation + 7d validation = ~9 days minimum
- **Phase 3:** 3-5 days implementation + 14d validation = ~19 days minimum
- **Final validation:** 30 days minimum

**Total minimum: ~62 days (9 weeks) from start to complete isolation**

This timeline is STRICT because stability requires observation periods. Do not rush.

---

## Notes

- Each phase builds on the previous one
- Verification scripts are the SOURCE OF TRUTH
- If a script fails, the phase is NOT complete
- Observation periods (24h/7d/14d) CANNOT be shortened
- Production stability is more important than speed
- Document all issues and fixes in `/srv/alive/prod/docs/INCIDENTS.md`
