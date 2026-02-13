-- Phase 1b: Tighten user-route RLS surface
-- Goal:
-- 1) Remove legacy/duplicate non-rls_* policies on migrated tables.
-- 2) Remove broad authenticated grants inherited from earlier schema setup.
-- 3) Re-apply least-privilege grants required by current RLS-backed routes.
--
-- Idempotent: safe to re-run.

-- Keep RLS enabled on all migrated tables.
ALTER TABLE iam.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversation_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.messages ENABLE ROW LEVEL SECURITY;

-- Drop all legacy policies on target tables; keep only rls_* policies.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE (schemaname, tablename) IN (
      ('iam', 'orgs'),
      ('iam', 'org_memberships'),
      ('app', 'conversations'),
      ('app', 'conversation_tabs'),
      ('app', 'messages')
    )
      AND policyname NOT LIKE 'rls\_%' ESCAPE '\'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- Tighten authenticated grants to least-privilege for migrated routes.
REVOKE ALL PRIVILEGES ON TABLE iam.orgs FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE iam.org_memberships FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE app.conversations FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE app.conversation_tabs FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE app.messages FROM authenticated;

GRANT SELECT, UPDATE ON TABLE iam.orgs TO authenticated;
GRANT SELECT ON TABLE iam.org_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.conversation_tabs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.messages TO authenticated;
