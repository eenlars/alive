-- ============================================================================
-- RLS hardening for user-facing routes
-- ============================================================================
--
-- Goals:
-- 1) Ensure key user-facing tables are protected by RLS policies.
-- 2) Align lockbox policies to Alive JWT (`public.sub()` via lockbox.sub()).
-- 3) Keep migration idempotent and safe to re-run.
--
-- NOTE: Do not include environment-specific credentials in migrations.

-- ----------------------------------------------------------------------------
-- Enable RLS on targeted tables (no-op if already enabled)
-- ----------------------------------------------------------------------------
ALTER TABLE app.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversation_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lockbox.secret_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE lockbox.user_secrets ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Grants required for authenticated role to reach policies
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.domains TO authenticated;
GRANT SELECT, UPDATE ON TABLE iam.orgs TO authenticated;
GRANT SELECT ON TABLE iam.org_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE iam.user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.conversation_tabs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.messages TO authenticated;
GRANT SELECT ON TABLE app.automation_jobs TO authenticated;
GRANT SELECT ON TABLE app.automation_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lockbox.secret_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lockbox.user_secrets TO authenticated;

-- ----------------------------------------------------------------------------
-- app.domains policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_domains_select_member ON app.domains;
DROP POLICY IF EXISTS rls_domains_insert_admin ON app.domains;
DROP POLICY IF EXISTS rls_domains_update_admin ON app.domains;
DROP POLICY IF EXISTS rls_domains_delete_admin ON app.domains;

CREATE POLICY rls_domains_select_member ON app.domains
  FOR SELECT USING (org_id IS NOT NULL AND iam.is_org_member(org_id));

CREATE POLICY rls_domains_insert_admin ON app.domains
  FOR INSERT WITH CHECK (org_id IS NOT NULL AND iam.is_org_admin(org_id));

CREATE POLICY rls_domains_update_admin ON app.domains
  FOR UPDATE USING (org_id IS NOT NULL AND iam.is_org_admin(org_id))
  WITH CHECK (org_id IS NOT NULL AND iam.is_org_admin(org_id));

CREATE POLICY rls_domains_delete_admin ON app.domains
  FOR DELETE USING (org_id IS NOT NULL AND iam.is_org_admin(org_id));

-- ----------------------------------------------------------------------------
-- iam.orgs / iam.org_memberships policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_orgs_select_member ON iam.orgs;
DROP POLICY IF EXISTS rls_orgs_update_admin ON iam.orgs;
DROP POLICY IF EXISTS rls_org_memberships_select_self ON iam.org_memberships;

CREATE POLICY rls_orgs_select_member ON iam.orgs
  FOR SELECT USING (iam.is_org_member(org_id));

CREATE POLICY rls_orgs_update_admin ON iam.orgs
  FOR UPDATE USING (iam.is_org_admin(org_id))
  WITH CHECK (iam.is_org_admin(org_id));

CREATE POLICY rls_org_memberships_select_self ON iam.org_memberships
  FOR SELECT USING (user_id = public.sub());

-- ----------------------------------------------------------------------------
-- iam.user_preferences policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_user_preferences_select_self ON iam.user_preferences;
DROP POLICY IF EXISTS rls_user_preferences_insert_self ON iam.user_preferences;
DROP POLICY IF EXISTS rls_user_preferences_update_self ON iam.user_preferences;

CREATE POLICY rls_user_preferences_select_self ON iam.user_preferences
  FOR SELECT USING (user_id = public.sub());

CREATE POLICY rls_user_preferences_insert_self ON iam.user_preferences
  FOR INSERT WITH CHECK (user_id = public.sub());

CREATE POLICY rls_user_preferences_update_self ON iam.user_preferences
  FOR UPDATE USING (user_id = public.sub())
  WITH CHECK (user_id = public.sub());

-- ----------------------------------------------------------------------------
-- app.conversations / app.conversation_tabs / app.messages policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_conversations_select_visible ON app.conversations;
DROP POLICY IF EXISTS rls_conversations_insert_owner ON app.conversations;
DROP POLICY IF EXISTS rls_conversations_update_owner ON app.conversations;
DROP POLICY IF EXISTS rls_conversations_delete_owner ON app.conversations;

DROP POLICY IF EXISTS rls_conversation_tabs_select_visible ON app.conversation_tabs;
DROP POLICY IF EXISTS rls_conversation_tabs_insert_owner ON app.conversation_tabs;
DROP POLICY IF EXISTS rls_conversation_tabs_update_owner ON app.conversation_tabs;
DROP POLICY IF EXISTS rls_conversation_tabs_delete_owner ON app.conversation_tabs;

DROP POLICY IF EXISTS rls_messages_select_visible ON app.messages;
DROP POLICY IF EXISTS rls_messages_insert_owner ON app.messages;
DROP POLICY IF EXISTS rls_messages_update_owner ON app.messages;
DROP POLICY IF EXISTS rls_messages_delete_owner ON app.messages;

CREATE POLICY rls_conversations_select_visible ON app.conversations
  FOR SELECT USING (
    user_id = public.sub()
    OR (visibility = 'shared' AND iam.is_org_member(org_id))
  );

CREATE POLICY rls_conversations_insert_owner ON app.conversations
  FOR INSERT WITH CHECK (
    user_id = public.sub()
    AND iam.is_org_member(org_id)
  );

CREATE POLICY rls_conversations_update_owner ON app.conversations
  FOR UPDATE USING (user_id = public.sub())
  WITH CHECK (
    user_id = public.sub()
    AND iam.is_org_member(org_id)
  );

CREATE POLICY rls_conversations_delete_owner ON app.conversations
  FOR DELETE USING (user_id = public.sub());

CREATE POLICY rls_conversation_tabs_select_visible ON app.conversation_tabs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM app.conversations c
      WHERE c.conversation_id = conversation_id
        AND (
          c.user_id = public.sub()
          OR (c.visibility = 'shared' AND iam.is_org_member(c.org_id))
        )
    )
  );

CREATE POLICY rls_conversation_tabs_insert_owner ON app.conversation_tabs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM app.conversations c
      WHERE c.conversation_id = conversation_id
        AND c.user_id = public.sub()
    )
  );

CREATE POLICY rls_conversation_tabs_update_owner ON app.conversation_tabs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM app.conversations c
      WHERE c.conversation_id = conversation_id
        AND c.user_id = public.sub()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM app.conversations c
      WHERE c.conversation_id = conversation_id
        AND c.user_id = public.sub()
    )
  );

CREATE POLICY rls_conversation_tabs_delete_owner ON app.conversation_tabs
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM app.conversations c
      WHERE c.conversation_id = conversation_id
        AND c.user_id = public.sub()
    )
  );

CREATE POLICY rls_messages_select_visible ON app.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM app.conversation_tabs t
      JOIN app.conversations c ON c.conversation_id = t.conversation_id
      WHERE t.tab_id = tab_id
        AND (
          c.user_id = public.sub()
          OR (c.visibility = 'shared' AND iam.is_org_member(c.org_id))
        )
    )
  );

CREATE POLICY rls_messages_insert_owner ON app.messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM app.conversation_tabs t
      JOIN app.conversations c ON c.conversation_id = t.conversation_id
      WHERE t.tab_id = tab_id
        AND c.user_id = public.sub()
    )
  );

CREATE POLICY rls_messages_update_owner ON app.messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM app.conversation_tabs t
      JOIN app.conversations c ON c.conversation_id = t.conversation_id
      WHERE t.tab_id = tab_id
        AND c.user_id = public.sub()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM app.conversation_tabs t
      JOIN app.conversations c ON c.conversation_id = t.conversation_id
      WHERE t.tab_id = tab_id
        AND c.user_id = public.sub()
    )
  );

CREATE POLICY rls_messages_delete_owner ON app.messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM app.conversation_tabs t
      JOIN app.conversations c ON c.conversation_id = t.conversation_id
      WHERE t.tab_id = tab_id
        AND c.user_id = public.sub()
    )
  );

-- ----------------------------------------------------------------------------
-- app.automation_jobs / app.automation_runs policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_automation_jobs_select_self ON app.automation_jobs;
DROP POLICY IF EXISTS rls_automation_runs_select_self ON app.automation_runs;

CREATE POLICY rls_automation_jobs_select_self ON app.automation_jobs
  FOR SELECT USING (user_id = public.sub());

CREATE POLICY rls_automation_runs_select_self ON app.automation_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM app.automation_jobs j
      WHERE j.id = job_id
        AND j.user_id = public.sub()
    )
  );

-- ----------------------------------------------------------------------------
-- lockbox policy alignment: drop user policies referencing auth.uid()
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'lockbox'
      AND tablename IN ('secret_keys', 'user_secrets')
      AND (
        coalesce(qual, '') ILIKE '%auth.uid(%'
        OR coalesce(with_check, '') ILIKE '%auth.uid(%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS rls_secret_keys_select_self ON lockbox.secret_keys;
DROP POLICY IF EXISTS rls_secret_keys_insert_self ON lockbox.secret_keys;
DROP POLICY IF EXISTS rls_secret_keys_update_self ON lockbox.secret_keys;
DROP POLICY IF EXISTS rls_secret_keys_delete_self ON lockbox.secret_keys;

DROP POLICY IF EXISTS rls_user_secrets_select_self ON lockbox.user_secrets;
DROP POLICY IF EXISTS rls_user_secrets_insert_self ON lockbox.user_secrets;
DROP POLICY IF EXISTS rls_user_secrets_update_self ON lockbox.user_secrets;
DROP POLICY IF EXISTS rls_user_secrets_delete_self ON lockbox.user_secrets;

CREATE POLICY rls_secret_keys_select_self ON lockbox.secret_keys
  FOR SELECT USING (user_id = lockbox.sub());

CREATE POLICY rls_secret_keys_insert_self ON lockbox.secret_keys
  FOR INSERT WITH CHECK (user_id = lockbox.sub());

CREATE POLICY rls_secret_keys_update_self ON lockbox.secret_keys
  FOR UPDATE USING (user_id = lockbox.sub())
  WITH CHECK (user_id = lockbox.sub());

CREATE POLICY rls_secret_keys_delete_self ON lockbox.secret_keys
  FOR DELETE USING (user_id = lockbox.sub());

CREATE POLICY rls_user_secrets_select_self ON lockbox.user_secrets
  FOR SELECT USING (user_id = lockbox.sub());

CREATE POLICY rls_user_secrets_insert_self ON lockbox.user_secrets
  FOR INSERT WITH CHECK (user_id = lockbox.sub());

CREATE POLICY rls_user_secrets_update_self ON lockbox.user_secrets
  FOR UPDATE USING (user_id = lockbox.sub())
  WITH CHECK (user_id = lockbox.sub());

CREATE POLICY rls_user_secrets_delete_self ON lockbox.user_secrets
  FOR DELETE USING (user_id = lockbox.sub());
