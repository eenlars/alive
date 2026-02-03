-- ============================================================================
-- Cleanup Test Data from Database
-- ============================================================================
-- This script removes all test-related data from the database
--
-- Identifies test data by:
-- 1. Users with is_test_env = true
-- 2. Domains matching test patterns (tc*.alive.best, test-*.alive.best, etc.)
-- 3. Organizations belonging to test users
--
-- Safe to run periodically (e.g., after E2E tests or via cron)
-- ============================================================================

-- ============================================================================
-- PHASE 1: ANALYSIS (SAFE - READ ONLY)
-- ============================================================================

-- Show test users
SELECT
    'Test Users' as category,
    user_id,
    email,
    created_at,
    is_test_env
FROM iam.users
WHERE is_test_env = true
ORDER BY created_at DESC;

-- Show test domains (by pattern)
SELECT
    'Test Domains' as category,
    d.hostname,
    d.port,
    d.org_id,
    o.name as org_name,
    d.created_at
FROM app.domains d
LEFT JOIN iam.orgs o ON o.org_id = d.org_id
WHERE d.hostname ~ '^(tc\d+|test-concurrent-\d+|test-).*\.(alive\.best|example\.com)$'
ORDER BY d.created_at DESC;

-- Show orgs belonging to test users
SELECT
    'Test User Organizations' as category,
    o.org_id,
    o.name,
    o.credits,
    o.created_at,
    COUNT(DISTINCT om.user_id) as member_count,
    COUNT(DISTINCT d.domain_id) as domain_count
FROM iam.orgs o
INNER JOIN iam.org_memberships om ON om.org_id = o.org_id
INNER JOIN iam.users u ON u.user_id = om.user_id
LEFT JOIN app.domains d ON d.org_id = o.org_id
WHERE u.is_test_env = true
GROUP BY o.org_id, o.name, o.credits, o.created_at
ORDER BY o.created_at DESC;

-- Summary of what will be cleaned
WITH test_users AS (
    SELECT user_id FROM iam.users WHERE is_test_env = true
),
test_orgs AS (
    SELECT DISTINCT om.org_id
    FROM iam.org_memberships om
    WHERE om.user_id IN (SELECT user_id FROM test_users)
),
test_domains AS (
    SELECT domain_id FROM app.domains
    WHERE hostname ~ '^(tc\d+|test-concurrent-\d+|test-).*\.(alive\.best|example\.com)$'
       OR org_id IN (SELECT org_id FROM test_orgs)
)
SELECT
    'CLEANUP SUMMARY' as info,
    (SELECT COUNT(*) FROM test_users) as test_users_to_delete,
    (SELECT COUNT(*) FROM test_orgs) as test_orgs_to_delete,
    (SELECT COUNT(*) FROM test_domains) as test_domains_to_delete,
    (SELECT COUNT(*) FROM iam.org_memberships WHERE user_id IN (SELECT user_id FROM test_users)) as test_memberships_to_delete,
    (SELECT COUNT(*) FROM iam.org_invites WHERE org_id IN (SELECT org_id FROM test_orgs)) as test_invites_to_delete,
    (SELECT COUNT(*) FROM iam.sessions WHERE user_id IN (SELECT user_id FROM test_users)) as test_sessions_to_delete;

-- ============================================================================
-- PHASE 2: CLEANUP (DESTRUCTIVE - REQUIRES CONFIRMATION)
-- ============================================================================
-- Only run this after reviewing the analysis above!

-- Step 1: Delete sessions for test users
DELETE FROM iam.sessions
WHERE user_id IN (
    SELECT user_id FROM iam.users WHERE is_test_env = true
);

-- Step 2: Delete pending invites for test orgs
DELETE FROM iam.org_invites
WHERE org_id IN (
    SELECT DISTINCT om.org_id
    FROM iam.org_memberships om
    WHERE om.user_id IN (SELECT user_id FROM iam.users WHERE is_test_env = true)
);

-- Step 3: Delete test domains (by pattern or org association)
DELETE FROM app.domains
WHERE hostname ~ '^(tc\d+|test-concurrent-\d+|test-).*\.(alive\.best|example\.com)$'
   OR org_id IN (
       SELECT DISTINCT om.org_id
       FROM iam.org_memberships om
       WHERE om.user_id IN (SELECT user_id FROM iam.users WHERE is_test_env = true)
   );

-- Step 4: Delete org memberships for test users
DELETE FROM iam.org_memberships
WHERE user_id IN (
    SELECT user_id FROM iam.users WHERE is_test_env = true
);

-- Step 5: Delete orgs that belonged to test users (and now have no members)
DELETE FROM iam.orgs
WHERE org_id IN (
    SELECT o.org_id
    FROM iam.orgs o
    WHERE NOT EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )
);

-- Step 6: Delete test users
DELETE FROM iam.users
WHERE is_test_env = true;

-- ============================================================================
-- PHASE 3: VERIFICATION (SAFE - READ ONLY)
-- ============================================================================

-- Verify no test users remain
SELECT
    'Test Users Remaining' as check,
    COUNT(*) as count
FROM iam.users
WHERE is_test_env = true;

-- Verify no test domains remain
SELECT
    'Test Domains Remaining' as check,
    COUNT(*) as count
FROM app.domains
WHERE hostname ~ '^(tc\d+|test-concurrent-\d+|test-).*\.(alive\.best|example\.com)$';

-- Verify no orphaned orgs remain
SELECT
    'Orphaned Orgs Remaining' as check,
    COUNT(*) as count
FROM iam.orgs o
WHERE NOT EXISTS (
    SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
);

-- If all counts are 0, cleanup was successful!
