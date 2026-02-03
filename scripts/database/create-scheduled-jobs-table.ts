#!/usr/bin/env bun
/**
 * Create the app.scheduled_jobs table for scheduled tasks
 *
 * Run with: bun scripts/database/create-scheduled-jobs-table.ts
 *
 * NOTE: This script requires direct database access (psql) or running via Supabase Dashboard.
 * The SQL is printed for manual execution if programmatic access is not available.
 */

const CREATE_TABLE_SQL = `
-- Create scheduled_jobs table in app schema
-- This stores scheduled tasks that trigger agent conversations at specified times

CREATE TABLE IF NOT EXISTS app.scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES iam.organizations(id) ON DELETE CASCADE,
  workspace TEXT NOT NULL,

  -- Job metadata
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  delete_after_run BOOLEAN NOT NULL DEFAULT false,

  -- Schedule configuration (JSONB for flexibility)
  -- { kind: "at", atMs: number } | { kind: "every", everyMs: number } | { kind: "cron", expr: string, tz?: string }
  schedule JSONB NOT NULL,

  -- Payload - what happens when triggered
  -- { kind: "systemEvent", text: string } | { kind: "agentTurn", message: string, model?: string, ... }
  payload JSONB NOT NULL,

  -- Runtime state
  -- { nextRunAtMs?: number, runningAtMs?: number, lastRunAtMs?: number, lastStatus?: "ok"|"error"|"skipped", lastError?: string, runCount?: number }
  state JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_user_id ON app.scheduled_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_org_id ON app.scheduled_jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_workspace ON app.scheduled_jobs(workspace);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON app.scheduled_jobs(enabled) WHERE enabled = true;

-- Index for finding due jobs (enabled, with nextRunAtMs, not currently running)
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due ON app.scheduled_jobs(enabled, ((state->>'nextRunAtMs')::bigint))
  WHERE enabled = true AND state->>'runningAtMs' IS NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION app.update_scheduled_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheduled_jobs_updated_at ON app.scheduled_jobs;
CREATE TRIGGER trg_scheduled_jobs_updated_at
  BEFORE UPDATE ON app.scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION app.update_scheduled_jobs_updated_at();

-- Row Level Security
ALTER TABLE app.scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own jobs
CREATE POLICY scheduled_jobs_user_select ON app.scheduled_jobs
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can insert their own jobs
CREATE POLICY scheduled_jobs_user_insert ON app.scheduled_jobs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own jobs
CREATE POLICY scheduled_jobs_user_update ON app.scheduled_jobs
  FOR UPDATE
  USING (user_id = auth.uid());

-- Policy: Users can delete their own jobs
CREATE POLICY scheduled_jobs_user_delete ON app.scheduled_jobs
  FOR DELETE
  USING (user_id = auth.uid());

-- Service role bypasses RLS (for scheduler daemon)
-- The service role key is used by the backend scheduler

-- Grant permissions
GRANT ALL ON app.scheduled_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.scheduled_jobs TO authenticated;

-- Comments
COMMENT ON TABLE app.scheduled_jobs IS 'Scheduled tasks that trigger agent conversations at specified times';
COMMENT ON COLUMN app.scheduled_jobs.schedule IS 'Schedule configuration: at (one-shot), every (interval), or cron expression';
COMMENT ON COLUMN app.scheduled_jobs.payload IS 'What to do when triggered: systemEvent or agentTurn';
COMMENT ON COLUMN app.scheduled_jobs.state IS 'Runtime state including next run time, last run status, and run count';
`;

console.log("=".repeat(80));
console.log("SQL to create app.scheduled_jobs table");
console.log("=".repeat(80));
console.log("");
console.log("Run this SQL in the Supabase Dashboard SQL Editor:");
console.log("https://supabase.com/dashboard/project/<your-project-id>/sql/new");
console.log("");
console.log("-".repeat(80));
console.log(CREATE_TABLE_SQL);
console.log("-".repeat(80));
