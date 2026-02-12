-- Add lease-based distributed locking columns to automation_jobs
--
-- run_id: UUID claim token. Only the runner holding this run_id can finish/update the job.
-- claimed_by: server_id that claimed the job (for debugging and cross-server visibility).
-- lease_expires_at: dynamic expiry based on job timeout + buffer. Reaper uses this instead of hardcoded 1h.
--
-- Run against Supabase:
--   psql "$SUPABASE_DB_URL" -f apps/web/migrations/add-automation-lease-columns.sql

ALTER TABLE app.automation_jobs
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

-- Index for the dynamic reaper query (find expired leases)
CREATE INDEX IF NOT EXISTS idx_automation_jobs_lease_expires
  ON app.automation_jobs (lease_expires_at)
  WHERE running_at IS NOT NULL AND lease_expires_at IS NOT NULL;

COMMENT ON COLUMN app.automation_jobs.run_id IS 'UUID claim token for lease-based locking. Only the holder can finish the job.';
COMMENT ON COLUMN app.automation_jobs.claimed_by IS 'server_id that claimed this job execution.';
COMMENT ON COLUMN app.automation_jobs.lease_expires_at IS 'When the lease expires. Stale reaper uses this instead of hardcoded thresholds.';
