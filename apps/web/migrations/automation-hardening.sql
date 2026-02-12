-- Migration: automation-hardening (8.1–8.4)
-- Applied: 2026-02-12
--
-- 8.1: Add job_status state machine (idle/running/paused/disabled)
-- 8.2: CHECK constraints for data integrity
-- 8.3: Partial indexes for scheduler hot path
-- 8.4: messages_uri column on automation_runs (messages stored as files, not DB blobs)
--
-- Run against Supabase:
--   psql "$SUPABASE_DB_URL" -f apps/web/migrations/automation-hardening.sql

BEGIN;

-- ============================================================
-- 8.1: Add explicit job_status state machine
-- ============================================================

DO $$ BEGIN
  CREATE TYPE app.automation_job_status AS ENUM ('idle', 'running', 'paused', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE app.automation_jobs
  ADD COLUMN IF NOT EXISTS status app.automation_job_status NOT NULL DEFAULT 'idle';

-- Backfill from current derived state
UPDATE app.automation_jobs SET status = 'running'  WHERE running_at IS NOT NULL;
UPDATE app.automation_jobs SET status = 'disabled' WHERE is_active = false AND running_at IS NULL;
UPDATE app.automation_jobs SET status = 'idle'     WHERE is_active = true  AND running_at IS NULL;

-- ============================================================
-- 8.2: CHECK constraints
-- ============================================================

-- Fix empty strings to NULL (one-time jobs had '' instead of NULL)
UPDATE app.automation_jobs SET cron_schedule = NULL WHERE cron_schedule = '';

-- Cron jobs MUST have a schedule
ALTER TABLE app.automation_jobs
  ADD CONSTRAINT chk_cron_requires_schedule
  CHECK (trigger_type != 'cron' OR cron_schedule IS NOT NULL);

-- Non-cron jobs must NOT have a schedule
ALTER TABLE app.automation_jobs
  ADD CONSTRAINT chk_non_cron_no_schedule
  CHECK (trigger_type = 'cron' OR cron_schedule IS NULL);

-- Timeout in sane range (10s – 3600s) when set
ALTER TABLE app.automation_jobs
  ADD CONSTRAINT chk_timeout_range
  CHECK (action_timeout_seconds IS NULL OR (action_timeout_seconds >= 10 AND action_timeout_seconds <= 3600));

-- Status and running_at must be consistent
ALTER TABLE app.automation_jobs
  ADD CONSTRAINT chk_status_running_consistent
  CHECK (
    (status = 'running' AND running_at IS NOT NULL)
    OR (status != 'running' AND running_at IS NULL)
  );

-- ============================================================
-- 8.3: Partial indexes for scheduler hot path
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_automation_jobs_due
  ON app.automation_jobs (next_run_at ASC)
  WHERE status = 'idle' AND run_id IS NULL AND next_run_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_jobs_site_id
  ON app.automation_jobs (site_id);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_org_id
  ON app.automation_jobs (org_id);

-- ============================================================
-- 8.4: Add messages_uri to automation_runs
-- ============================================================

ALTER TABLE app.automation_runs
  ADD COLUMN IF NOT EXISTS messages_uri text;

COMMENT ON COLUMN app.automation_runs.messages_uri IS
  'URI to full message transcript (file:///var/log/automation-runs/messages/{run_id}.json). Used instead of inline messages blob.';

-- ============================================================
-- Update claim_due_jobs RPC to set status = running
-- ============================================================

CREATE OR REPLACE FUNCTION app.claim_due_jobs(
  p_server_id text,
  p_limit int,
  p_claimed_by text DEFAULT NULL
)
RETURNS SETOF app.automation_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT j.id
    FROM app.automation_jobs j
    JOIN app.domains d ON d.domain_id = j.site_id
    WHERE j.status = 'idle'
      AND j.is_active = true
      AND j.next_run_at <= now()
      AND j.run_id IS NULL
      AND j.running_at IS NULL
      AND d.server_id = p_server_id
    ORDER BY j.next_run_at ASC
    LIMIT p_limit
    FOR UPDATE OF j SKIP LOCKED
  )
  UPDATE app.automation_jobs j
  SET
    status      = 'running',
    running_at  = now(),
    run_id      = gen_random_uuid(),
    claimed_by  = COALESCE(p_claimed_by, p_server_id),
    lease_expires_at = now() + make_interval(secs => COALESCE(j.action_timeout_seconds, 300) + 120)
  FROM due
  WHERE j.id = due.id
  RETURNING j.*;
END;
$$;

GRANT EXECUTE ON FUNCTION app.claim_due_jobs(text, int, text) TO service_role;

-- ============================================================
-- Cleanup: drop dead SQL
-- ============================================================

-- Legacy RPCs replaced by automation-engine
DROP FUNCTION IF EXISTS app.get_due_automation_jobs();
DROP FUNCTION IF EXISTS app.start_automation_job(text);
DROP FUNCTION IF EXISTS app.finish_automation_job(text, app.automation_run_status, text, jsonb, text[], timestamptz);

-- Duplicate constraint (same as chk_cron_requires_schedule)
ALTER TABLE app.automation_jobs DROP CONSTRAINT IF EXISTS chk_cron_schedule;

-- Superseded indexes (replaced by idx_automation_jobs_due, or useless low-cardinality)
DROP INDEX IF EXISTS app.idx_automation_jobs_next_run;
DROP INDEX IF EXISTS app.idx_automation_jobs_is_active;
DROP INDEX IF EXISTS app.idx_automation_jobs_trigger_type;

COMMIT;
