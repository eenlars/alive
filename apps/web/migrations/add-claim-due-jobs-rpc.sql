-- Atomic claim of N due jobs in a single statement.
-- Uses FOR UPDATE SKIP LOCKED to prevent race conditions between instances.
-- Returns fully claimed rows with run_id, claimed_by, lease_expires_at set.
--
-- Run against Supabase:
--   psql "$SUPABASE_DB_URL" -f apps/web/migrations/add-claim-due-jobs-rpc.sql

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
    WHERE j.is_active = true
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
