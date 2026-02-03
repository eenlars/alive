-- Migration: Add test_run_id columns for E2E test isolation
--
-- STATUS: ✅ Already applied to production/staging databases
-- This file is kept for documentation and new database setup purposes.
-- TypeScript types are already generated and up-to-date in lib/supabase/*.types.ts
--
-- This migration adds test_run_id columns to enable isolated E2E test execution.
-- Each Playwright worker gets a unique test_run_id (e.g., "E2E_2025-11-21T10:30:00Z")
-- which tags all created resources for fast cleanup after tests complete.
--
-- Related files:
-- - apps/web/e2e-tests/global-setup.ts (creates test_run_id)
-- - apps/web/e2e-tests/global-teardown.ts (deletes by test_run_id)
-- - apps/web/app/api/test/bootstrap-tenant/route.ts (uses test_run_id)
--
-- Date: 2025-11-23

-- ============================================================================
-- IAM Schema: Users
-- ============================================================================

-- Add test_run_id column to iam.users
ALTER TABLE iam.users
ADD COLUMN IF NOT EXISTS test_run_id TEXT DEFAULT NULL;

-- Add index for fast cleanup queries
CREATE INDEX IF NOT EXISTS idx_users_test_run_id
ON iam.users (test_run_id)
WHERE test_run_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN iam.users.test_run_id IS
'E2E test run identifier for isolation and cleanup (e.g., E2E_2025-11-21T10:30:00Z)';


-- ============================================================================
-- IAM Schema: Organizations
-- ============================================================================

-- Add test_run_id column to iam.orgs
ALTER TABLE iam.orgs
ADD COLUMN IF NOT EXISTS test_run_id TEXT DEFAULT NULL;

-- Add index for fast cleanup queries
CREATE INDEX IF NOT EXISTS idx_orgs_test_run_id
ON iam.orgs (test_run_id)
WHERE test_run_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN iam.orgs.test_run_id IS
'E2E test run identifier for isolation and cleanup (e.g., E2E_2025-11-21T10:30:00Z)';


-- ============================================================================
-- APP Schema: Domains
-- ============================================================================

-- Add test_run_id column to app.domains
ALTER TABLE app.domains
ADD COLUMN IF NOT EXISTS test_run_id TEXT DEFAULT NULL;

-- Add index for fast cleanup queries
CREATE INDEX IF NOT EXISTS idx_domains_test_run_id
ON app.domains (test_run_id)
WHERE test_run_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN app.domains.test_run_id IS
'E2E test run identifier for isolation and cleanup (e.g., E2E_2025-11-21T10:30:00Z)';


-- ============================================================================
-- Verify Migration
-- ============================================================================

-- Verify columns exist
DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'iam'
        AND table_name = 'users'
        AND column_name = 'test_run_id'
    ), 'iam.users.test_run_id column not created';

    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'iam'
        AND table_name = 'orgs'
        AND column_name = 'test_run_id'
    ), 'iam.orgs.test_run_id column not created';

    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app'
        AND table_name = 'domains'
        AND column_name = 'test_run_id'
    ), 'app.domains.test_run_id column not created';

    RAISE NOTICE '✓ Migration complete: test_run_id columns added successfully';
END $$;
