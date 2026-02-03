-- ============================================================================
-- Cleanup Organizations Without Users
-- ============================================================================
-- This script identifies and removes organizations that have no existing users
--
-- What gets cleaned up:
-- 1. Organizations with no memberships at all
-- 2. Organizations where ALL memberships point to deleted/non-existent users
--
-- Related tables affected:
-- - iam.orgs (organizations)
-- - iam.org_memberships (user-org relationships)
-- - iam.org_invites (pending invites)
-- - app.domains (domain ownership - org_id set to NULL)
-- - app.user_onboarding (onboarding data - org_id set to NULL)
-- ============================================================================

-- ============================================================================
-- PHASE 1: ANALYSIS (SAFE - READ ONLY)
-- ============================================================================
-- Run this first to see what will be deleted

-- Show organizations with no memberships at all
SELECT
    'No memberships' as category,
    o.org_id,
    o.name,
    o.credits,
    o.created_at,
    0 as membership_count
FROM iam.orgs o
WHERE NOT EXISTS (
    SELECT 1
    FROM iam.org_memberships om
    WHERE om.org_id = o.org_id
)
ORDER BY o.created_at DESC;

-- Show organizations where ALL memberships point to non-existent users
SELECT
    'All members deleted' as category,
    o.org_id,
    o.name,
    o.credits,
    o.created_at,
    COUNT(om.user_id) as membership_count
FROM iam.orgs o
INNER JOIN iam.org_memberships om ON om.org_id = o.org_id
WHERE NOT EXISTS (
    SELECT 1
    FROM iam.org_memberships om2
    INNER JOIN iam.users u ON u.user_id = om2.user_id
    WHERE om2.org_id = o.org_id
)
GROUP BY o.org_id, o.name, o.credits, o.created_at
ORDER BY o.created_at DESC;

-- Summary of what will be affected
WITH orphaned_orgs AS (
    -- Orgs with no memberships
    SELECT o.org_id
    FROM iam.orgs o
    WHERE NOT EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )

    UNION

    -- Orgs where all members are deleted
    SELECT o.org_id
    FROM iam.orgs o
    WHERE EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )
    AND NOT EXISTS (
        SELECT 1
        FROM iam.org_memberships om2
        INNER JOIN iam.users u ON u.user_id = om2.user_id
        WHERE om2.org_id = o.org_id
    )
)
SELECT
    'CLEANUP SUMMARY' as info,
    (SELECT COUNT(*) FROM orphaned_orgs) as orgs_to_delete,
    (SELECT COUNT(*) FROM iam.org_memberships WHERE org_id IN (SELECT org_id FROM orphaned_orgs)) as memberships_to_delete,
    (SELECT COUNT(*) FROM iam.org_invites WHERE org_id IN (SELECT org_id FROM orphaned_orgs)) as invites_to_delete,
    (SELECT COUNT(*) FROM app.domains WHERE org_id IN (SELECT org_id FROM orphaned_orgs)) as domains_to_unlink,
    (SELECT COUNT(*) FROM app.user_onboarding WHERE org_id IN (SELECT org_id FROM orphaned_orgs)) as onboarding_records_to_unlink;

-- ============================================================================
-- PHASE 2: CLEANUP (DESTRUCTIVE - REQUIRES CONFIRMATION)
-- ============================================================================
-- Only run this after reviewing the analysis above!

-- Step 1: Delete pending invites for orphaned orgs
DELETE FROM iam.org_invites
WHERE org_id IN (
    -- Orgs with no memberships
    SELECT o.org_id
    FROM iam.orgs o
    WHERE NOT EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )

    UNION

    -- Orgs where all members are deleted
    SELECT o.org_id
    FROM iam.orgs o
    WHERE EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )
    AND NOT EXISTS (
        SELECT 1
        FROM iam.org_memberships om2
        INNER JOIN iam.users u ON u.user_id = om2.user_id
        WHERE om2.org_id = o.org_id
    )
);

-- Step 2: Delete memberships for orphaned orgs
DELETE FROM iam.org_memberships
WHERE org_id IN (
    -- Orgs with no memberships
    SELECT o.org_id
    FROM iam.orgs o
    WHERE NOT EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )

    UNION

    -- Orgs where all members are deleted
    SELECT o.org_id
    FROM iam.orgs o
    WHERE EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )
    AND NOT EXISTS (
        SELECT 1
        FROM iam.org_memberships om2
        INNER JOIN iam.users u ON u.user_id = om2.user_id
        WHERE om2.org_id = o.org_id
    )
);

-- Step 3: Unlink domains from orphaned orgs (set org_id to NULL)
UPDATE app.domains
SET org_id = NULL
WHERE org_id IN (
    -- Orgs with no memberships
    SELECT o.org_id
    FROM iam.orgs o
    WHERE NOT EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )

    UNION

    -- Orgs where all members are deleted
    SELECT o.org_id
    FROM iam.orgs o
    WHERE EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )
    AND NOT EXISTS (
        SELECT 1
        FROM iam.org_memberships om2
        INNER JOIN iam.users u ON u.user_id = om2.user_id
        WHERE om2.org_id = o.org_id
    )
);

-- Step 4: Unlink onboarding records from orphaned orgs (set org_id to NULL)
UPDATE app.user_onboarding
SET org_id = NULL
WHERE org_id IN (
    -- Orgs with no memberships
    SELECT o.org_id
    FROM iam.orgs o
    WHERE NOT EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )

    UNION

    -- Orgs where all members are deleted
    SELECT o.org_id
    FROM iam.orgs o
    WHERE EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )
    AND NOT EXISTS (
        SELECT 1
        FROM iam.org_memberships om2
        INNER JOIN iam.users u ON u.user_id = om2.user_id
        WHERE om2.org_id = o.org_id
    )
);

-- Step 5: Finally, delete the orphaned organizations
DELETE FROM iam.orgs
WHERE org_id IN (
    -- Orgs with no memberships
    SELECT o.org_id
    FROM iam.orgs o
    WHERE NOT EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )

    UNION

    -- Orgs where all members are deleted
    SELECT o.org_id
    FROM iam.orgs o
    WHERE EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id
    )
    AND NOT EXISTS (
        SELECT 1
        FROM iam.org_memberships om2
        INNER JOIN iam.users u ON u.user_id = om2.user_id
        WHERE om2.org_id = o.org_id
    )
);

-- ============================================================================
-- PHASE 3: VERIFICATION (SAFE - READ ONLY)
-- ============================================================================
-- Run this after cleanup to verify

-- Verify no orphaned orgs remain
SELECT
    'Verification' as info,
    COUNT(*) as remaining_orphaned_orgs
FROM iam.orgs o
WHERE NOT EXISTS (
    SELECT 1
    FROM iam.org_memberships om
    INNER JOIN iam.users u ON u.user_id = om.user_id
    WHERE om.org_id = o.org_id
);

-- If the count is 0, cleanup was successful!
