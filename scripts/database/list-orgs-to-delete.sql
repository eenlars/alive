-- List all organizations that will be deleted (orphaned orgs without users)
SELECT
    o.org_id,
    o.name,
    o.credits,
    o.created_at,
    o.updated_at,
    CASE
        WHEN NOT EXISTS (SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o.org_id)
        THEN 'No memberships at all'
        ELSE 'All members deleted'
    END as reason
FROM iam.orgs o
WHERE o.org_id IN (
    -- Orgs with no memberships
    SELECT o2.org_id
    FROM iam.orgs o2
    WHERE NOT EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o2.org_id
    )

    UNION

    -- Orgs where all members are deleted
    SELECT o2.org_id
    FROM iam.orgs o2
    WHERE EXISTS (
        SELECT 1 FROM iam.org_memberships om WHERE om.org_id = o2.org_id
    )
    AND NOT EXISTS (
        SELECT 1
        FROM iam.org_memberships om2
        INNER JOIN iam.users u ON u.user_id = om2.user_id
        WHERE om2.org_id = o2.org_id
    )
)
ORDER BY o.created_at DESC;
