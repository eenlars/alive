-- View domains that will be unlinked from orphaned orgs
SELECT
    d.hostname,
    d.port,
    d.org_id,
    o.name as org_name,
    o.credits as org_credits
FROM app.domains d
INNER JOIN iam.orgs o ON o.org_id = d.org_id
WHERE d.org_id IN (
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
ORDER BY d.hostname;
