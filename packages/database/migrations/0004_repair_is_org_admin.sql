-- Repair iam.is_org_admin() predicate for owner/admin write authorization.
-- Idempotent: safe to re-run.
--
-- Why:
-- Staging/runtime verification showed owner/admin writes resolving as denied.
-- Re-applying the canonical function body ensures org admin checks are based on
-- current user membership with role IN ('owner', 'admin').

CREATE OR REPLACE FUNCTION iam.is_org_admin(p_org_id text) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'iam'
AS $$
    SELECT EXISTS (
      SELECT 1
      FROM iam.org_memberships m
      WHERE m.org_id = p_org_id
        AND m.user_id = public.sub()
        AND m.role IN ('owner', 'admin')
    )
$$;
