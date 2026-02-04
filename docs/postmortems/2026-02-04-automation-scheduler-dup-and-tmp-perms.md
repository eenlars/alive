# Postmortem: 2026-02-04 Automation Scheduler Duplication and Temp Permission Failures

## Summary
Between February 2 and February 4, 2026, scheduled automations for `zomaar.alive.best` exhibited two systemic issues:

1. The cron scheduler ran in both production and staging, causing duplicate executions and repeated inserts.
2. Automation runs intermittently failed with a temp directory permission error, even when articles were inserted.

Earlier on Feb 2-3, the same automation also failed with a request-scope cookies error before reaching execution.

## Impact
- Duplicate runs produced duplicate article inserts.
- UI and logs reported failures even when content was inserted successfully.
- Operators lost confidence in automation reliability.

## Timeline (UTC)
- **2026-02-02 09:00 - 09:03**: Automation failed repeatedly with `cookies` called outside request scope, then disabled after retries.
- **2026-02-03 morning**: Additional failures reported as `Claude Code process exited with code 1`.
- **2026-02-04 16:55, 17:00, 17:05**: Same automation executed in both production and staging (duplicate runs observed in logs).
- **2026-02-04 17:05**: `bash` tool invocation returned `/tmp/claude-XXXX-cwd: Permission denied` while still inserting articles.

## Root Causes
1. **Scheduler duplication across environments**
   - `CronService` started based solely on `NODE_ENV === "production"`.
   - Staging runs a production build with `NODE_ENV=production`, so CronService started in staging too.
   - Both environments read the same database, leading to duplicate job executions.

2. **Temp directory permissions**
   - Automation runs as the workspace user, but temp directories were created under `/tmp` with ownership that did not match the site user.
   - When `bash` tools attempted to use that temp directory, they failed with `Permission denied`.
   - Result: a run was marked as error even though inserts succeeded.

3. **Request-scope cookies usage in background context (Feb 2-3)**
   - Background automation hit `cookies()` outside a request scope.
   - This indicates request-scoped utilities (e.g., Next.js `cookies()` or SSR client) being accessed without a request context.

## Contributing Factors
- No explicit environment gate for scheduler beyond `NODE_ENV`.
- No dedicated, workspace-owned temp directory for automation runs.
- Automations are not idempotent (re-runs insert duplicates).

## Detection
- User reports of failures.
- Systemd logs for production and staging showed concurrent `CronService` runs.
- `/var/log/automation-runs/*.jsonl` confirmed duplicate start events and temp permission errors.

## Resolution (Implemented)
1. **CronService production-only gate**
   - Updated instrumentation to start CronService only when `BRIDGE_ENV=production`.

2. **Workspace-owned temp directory**
   - Set `TMPDIR/TMP/TEMP` inside worker and child runner to a workspace-owned path.
   - This avoids `/tmp` permission issues and ensures temp files are owned by the site user.

## Follow-ups
- Ensure systemd services set `BRIDGE_ENV=production` (prod) and `BRIDGE_ENV=staging` (staging).
- Add a safety guard: disable scheduler unless `BRIDGE_ENV=production` is explicitly set.
- Make automation inserts idempotent or detect duplicates.
- Add monitoring for duplicate job execution (same jobId and runAtMs in close succession).
- Audit background jobs for request-scoped `cookies()` usage.

## What Went Well
- Logs and run-history JSONL provided enough signal to pinpoint the duplication.
- Articles still inserted, limiting user-facing downtime.

## What Went Wrong
- Staging behaved like production because of shared `NODE_ENV` semantics.
- Temp ownership was not enforced for background jobs.
- Prior request-scope cookie failures were not caught earlier.

## Where We Got Lucky
- The duplicate runs did not corrupt data beyond duplication.
- The temp permission issue did not block all runs, only marked them as failed.
