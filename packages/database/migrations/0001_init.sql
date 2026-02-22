-- ============================================================================
-- Claude Bridge Database Schema
-- ============================================================================
--
-- Run this file to set up your database from scratch:
--   psql $DATABASE_URL < migrations/0001_init.sql
--
-- After running, generate TypeScript types:
--   bun run gen:types
--
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================================
-- SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS integrations;
CREATE SCHEMA IF NOT EXISTS lockbox;

COMMENT ON SCHEMA lockbox IS 'Per-user encrypted secrets (app-managed).';

-- ============================================================================
-- CORE FUNCTIONS (public schema)
-- ============================================================================

-- Generate prefixed unique IDs like 'user_1a2b3c4d5e6f7890'
CREATE OR REPLACE FUNCTION public.gen_prefixed_id(p_prefix text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    rnd text := substr(encode(gen_random_bytes(8), 'hex'), 1, 16);
    norm_prefix text := CASE WHEN right(p_prefix, 1) = '_' THEN p_prefix ELSE p_prefix || '_' END;
BEGIN
    RETURN norm_prefix || rnd;
END;
$$;

-- Get current user ID (customize this for your auth system)
-- For Supabase: reads from auth.jwt()
-- For other systems: modify to read from your session/JWT
CREATE OR REPLACE FUNCTION public.sub()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_sub text;
    v_claims json;
BEGIN
    -- Option 1: Read from Supabase JWT (if using Supabase Auth)
    BEGIN
        v_sub := NULLIF((auth.jwt())->>'sub', '');
    EXCEPTION WHEN undefined_function THEN
        v_sub := NULL;
    END;

    -- Option 2: Read from request.jwt.claims (for testing/custom auth)
    IF v_sub IS NULL THEN
        BEGIN
            v_claims := current_setting('request.jwt.claims', true)::json;
            v_sub := NULLIF(v_claims->>'sub', '');
        EXCEPTION WHEN OTHERS THEN
            v_sub := NULL;
        END;
    END IF;

    RETURN v_sub;
END
$$;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE app.automation_action_type AS ENUM ('prompt', 'sync', 'publish');
CREATE TYPE app.automation_run_status AS ENUM ('pending', 'running', 'success', 'failure', 'skipped');
CREATE TYPE app.automation_trigger_type AS ENUM ('cron', 'webhook', 'one-time');
CREATE TYPE app.severity_level AS ENUM ('info', 'warn', 'error', 'debug', 'fatal');
CREATE TYPE iam.org_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE iam.user_status AS ENUM ('active', 'disabled', 'invited');

-- ============================================================================
-- IAM SCHEMA FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION iam.sub() RETURNS text LANGUAGE sql STABLE AS $$ SELECT public.sub(); $$;

CREATE OR REPLACE FUNCTION iam.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION iam.generate_invite_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE candidate text;
BEGIN
  LOOP
    candidate := replace(encode(gen_random_bytes(5), 'base64'), '/', 'A');
    candidate := replace(candidate, '+', 'B');
    candidate := replace(candidate, '=', '');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM iam.users u WHERE u.invite_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION iam.set_invite_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN NEW.invite_code := iam.generate_invite_code(); END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION iam.deduct_credits(p_org_id text, p_amount numeric) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_new_balance NUMERIC;
BEGIN
    UPDATE iam.orgs SET credits = credits - p_amount, updated_at = NOW()
    WHERE org_id = p_org_id AND credits >= p_amount
    RETURNING credits INTO v_new_balance;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION iam.add_credits(p_org_id text, p_amount numeric) RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE iam.orgs SET credits = credits + p_amount, updated_at = NOW() WHERE org_id = p_org_id RETURNING credits INTO new_balance;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN new_balance;
END;
$$;

-- ============================================================================
-- APP SCHEMA FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION app.sub() RETURNS text LANGUAGE sql STABLE AS $$ SELECT public.sub(); $$;

CREATE OR REPLACE FUNCTION app.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION app.automation_jobs_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION app.automation_jobs_generate_webhook_secret() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.trigger_type = 'webhook' AND NEW.webhook_secret IS NULL THEN
        NEW.webhook_secret = encode(gen_random_bytes(32), 'hex');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.automation_runs_compute_duration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.auto_increment_error_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.hash = OLD.hash AND NEW.total_count = 1 THEN
    NEW.total_count := OLD.total_count + 1;
    NEW.last_seen := now();
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- LOCKBOX SCHEMA FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION lockbox.sub() RETURNS text LANGUAGE sql STABLE AS $$ SELECT public.sub(); $$;

CREATE OR REPLACE FUNCTION lockbox.tg_set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'lockbox', 'public' AS $$
BEGIN new.updated_at := now(); RETURN new; END $$;

-- ============================================================================
-- IAM TABLES
-- ============================================================================

CREATE TABLE iam.users (
    user_id text DEFAULT public.gen_prefixed_id('user_'::text) PRIMARY KEY NOT NULL,
    email text UNIQUE,
    display_name text,
    avatar_url text,
    status iam.user_status DEFAULT 'active' NOT NULL,
    metadata jsonb DEFAULT '{}' NOT NULL,
    password_hash text,
    email_verified boolean DEFAULT false,
    invite_code text UNIQUE,
    clerk_id text,
    is_test_env boolean DEFAULT false NOT NULL,
    test_run_id text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE iam.orgs (
    org_id text DEFAULT public.gen_prefixed_id('org_'::text) PRIMARY KEY NOT NULL,
    name text NOT NULL,
    credits numeric DEFAULT 200 NOT NULL,
    is_test_env boolean DEFAULT false,
    test_run_id text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE iam.org_memberships (
    org_id text NOT NULL REFERENCES iam.orgs(org_id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    role text DEFAULT 'member' NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

-- These functions use LANGUAGE sql (validated at creation time), so they must
-- be defined after iam.org_memberships exists.
CREATE OR REPLACE FUNCTION iam.is_org_member(p_org_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'iam' AS $$
    SELECT EXISTS (SELECT 1 FROM iam.org_memberships m WHERE m.org_id = p_org_id AND m.user_id = public.sub())
$$;

CREATE OR REPLACE FUNCTION iam.is_org_admin(p_org_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'iam' AS $$
    SELECT EXISTS (SELECT 1 FROM iam.org_memberships m WHERE m.org_id = p_org_id AND m.user_id = public.sub() AND m.role IN ('owner', 'admin'))
$$;

CREATE TABLE iam.sessions (
    session_id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    domain_id text NOT NULL,
    tab_id text NOT NULL,
    sdk_session_id text NOT NULL,
    last_activity timestamptz DEFAULT now() NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (user_id, domain_id, tab_id)
);

CREATE TABLE iam.user_preferences (
    user_id text PRIMARY KEY NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    current_workspace text,
    selected_org_id text REFERENCES iam.orgs(org_id) ON DELETE SET NULL,
    recent_workspaces jsonb DEFAULT '[]' NOT NULL,
    preferences jsonb DEFAULT '{}' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE iam.org_invites (
    invite_id text DEFAULT public.gen_prefixed_id('invite_'::text) UNIQUE NOT NULL,
    org_id text NOT NULL REFERENCES iam.orgs(org_id) ON DELETE CASCADE,
    email citext NOT NULL,
    role iam.org_role DEFAULT 'member' NOT NULL,
    invited_by text REFERENCES iam.users(user_id),
    token text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE iam.email_invites (
    email_invite_id text DEFAULT public.gen_prefixed_id('emi_'::text) PRIMARY KEY NOT NULL,
    sender_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    email text NOT NULL,
    sent_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (sender_id, email)
);

CREATE TABLE iam.referrals (
    referral_id text DEFAULT public.gen_prefixed_id('ref_'::text) PRIMARY KEY NOT NULL,
    referrer_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    referred_id text NOT NULL UNIQUE REFERENCES iam.users(user_id) ON DELETE CASCADE,
    credits_awarded numeric DEFAULT 500 NOT NULL,
    status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    created_at timestamptz DEFAULT now() NOT NULL,
    completed_at timestamptz
);

-- ============================================================================
-- APP TABLES
-- ============================================================================

CREATE TABLE app.servers (
    server_id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    ip text NOT NULL,
    hostname text,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE app.domains (
    domain_id text DEFAULT public.gen_prefixed_id('dom_'::text) PRIMARY KEY NOT NULL,
    hostname text NOT NULL UNIQUE,
    port integer NOT NULL,
    org_id text REFERENCES iam.orgs(org_id) ON DELETE CASCADE,
    server_id text REFERENCES app.servers(server_id),
    is_test_env boolean DEFAULT false,
    test_run_id text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Add FK for sessions after domains exists
ALTER TABLE iam.sessions ADD CONSTRAINT sessions_domain_id_fkey
    FOREIGN KEY (domain_id) REFERENCES app.domains(domain_id) ON DELETE CASCADE;

CREATE TABLE app.templates (
    template_id text DEFAULT public.gen_prefixed_id('tmpl_'::text) PRIMARY KEY NOT NULL,
    name text NOT NULL,
    description text,
    source_path text NOT NULL,
    preview_url text,
    image_url text,
    deploy_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    ai_description text
);

CREATE TABLE app.conversations (
    conversation_id text DEFAULT (gen_random_uuid())::text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    org_id text NOT NULL REFERENCES iam.orgs(org_id) ON DELETE CASCADE,
    workspace text NOT NULL,
    title text DEFAULT 'New conversation' NOT NULL,
    visibility text DEFAULT 'private' NOT NULL CHECK (visibility IN ('private', 'shared')),
    message_count integer DEFAULT 0 NOT NULL,
    first_user_message_id text,
    auto_title_set boolean DEFAULT false NOT NULL,
    last_message_at timestamptz,
    archived_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE app.conversation_tabs (
    tab_id text DEFAULT (gen_random_uuid())::text PRIMARY KEY NOT NULL,
    conversation_id text NOT NULL REFERENCES app.conversations(conversation_id) ON DELETE CASCADE,
    name text DEFAULT 'current' NOT NULL,
    position integer DEFAULT 0 NOT NULL,
    message_count integer DEFAULT 0 NOT NULL,
    last_message_at timestamptz,
    closed_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE app.messages (
    message_id text DEFAULT (gen_random_uuid())::text PRIMARY KEY NOT NULL,
    tab_id text NOT NULL REFERENCES app.conversation_tabs(tab_id) ON DELETE CASCADE,
    seq integer NOT NULL,
    type text NOT NULL CHECK (type IN ('user', 'assistant', 'tool_use', 'tool_result', 'thinking', 'system', 'sdk_message')),
    content jsonb NOT NULL,
    status text DEFAULT 'complete' NOT NULL CHECK (status IN ('streaming', 'complete', 'interrupted', 'error')),
    error_code text,
    aborted_at timestamptz,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (tab_id, seq)
);

CREATE TABLE app.automation_jobs (
    id text DEFAULT public.gen_prefixed_id('auto_job_'::text) PRIMARY KEY NOT NULL,
    site_id text NOT NULL REFERENCES app.domains(domain_id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    org_id text NOT NULL REFERENCES iam.orgs(org_id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    trigger_type app.automation_trigger_type NOT NULL,
    cron_schedule text,
    cron_timezone text,
    run_at timestamptz,
    webhook_secret text,
    action_type app.automation_action_type NOT NULL,
    action_prompt text,
    action_source jsonb,
    action_target_page text,
    action_format_prompt text,
    action_model text,
    action_timeout_seconds integer DEFAULT 300,
    skills text[] DEFAULT '{}',
    is_active boolean DEFAULT true NOT NULL,
    delete_after_run boolean DEFAULT false,
    running_at timestamptz,
    next_run_at timestamptz,
    last_run_at timestamptz,
    last_run_status app.automation_run_status,
    last_run_error text,
    last_run_duration_ms integer,
    consecutive_failures integer DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT chk_cron_schedule CHECK ((trigger_type <> 'cron') OR (cron_schedule IS NOT NULL)),
    CONSTRAINT chk_one_time_run_at CHECK ((trigger_type <> 'one-time') OR (run_at IS NOT NULL)),
    CONSTRAINT chk_prompt_action CHECK ((action_type <> 'prompt') OR (action_prompt IS NOT NULL))
);

CREATE TABLE app.automation_runs (
    id text DEFAULT public.gen_prefixed_id('auto_run_'::text) PRIMARY KEY NOT NULL,
    job_id text NOT NULL REFERENCES app.automation_jobs(id) ON DELETE CASCADE,
    status app.automation_run_status DEFAULT 'pending' NOT NULL,
    triggered_by text,
    trigger_context jsonb,
    result jsonb,
    messages jsonb,
    changes_made text[],
    error text,
    duration_ms integer,
    started_at timestamptz DEFAULT now() NOT NULL,
    completed_at timestamptz
);

CREATE TABLE app.user_quotas (
    user_id text PRIMARY KEY NOT NULL REFERENCES iam.users(user_id),
    max_sites integer DEFAULT 2 NOT NULL,
    max_storage_mb integer DEFAULT 500,
    max_monthly_builds integer DEFAULT 100,
    max_custom_domains integer DEFAULT 1,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE app.user_onboarding (
    user_id text PRIMARY KEY NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    org_id text REFERENCES iam.orgs(org_id) ON DELETE SET NULL,
    role text,
    industry text,
    team_size integer CHECK ((team_size IS NULL) OR (team_size >= 1)),
    primary_goal text,
    top_tasks text[] DEFAULT '{}' NOT NULL,
    success_metric text,
    autonomy text DEFAULT 'review' NOT NULL CHECK (autonomy IN ('manual', 'review', 'auto')),
    approval_rules jsonb DEFAULT '{}' NOT NULL,
    data_sources text[] DEFAULT '{}' NOT NULL,
    preferred_apps text[] DEFAULT '{}' NOT NULL,
    experience text DEFAULT 'new' NOT NULL CHECK (experience IN ('new', 'intermediate', 'power')),
    time_budget_min_per_week integer CHECK ((time_budget_min_per_week IS NULL) OR (time_budget_min_per_week >= 0)),
    notify_channels text[] DEFAULT ARRAY['inapp'] NOT NULL,
    timezone text DEFAULT 'UTC',
    locale text DEFAULT 'en-US',
    tos_accepted_at timestamptz,
    privacy_accepted_at timestamptz,
    marketing_opt_in boolean DEFAULT false NOT NULL,
    status text DEFAULT 'in_progress' NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
    completed_at timestamptz,
    ip_address text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE app.user_profile (
    user_profile_id text DEFAULT public.gen_prefixed_id('usr_pr'::text) PRIMARY KEY NOT NULL,
    clerk_id text NOT NULL UNIQUE,
    about text,
    goals text,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE app.gateway_settings (
    gateway_setting_id text DEFAULT public.gen_prefixed_id('gw_'::text) PRIMARY KEY NOT NULL,
    clerk_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    gateway text NOT NULL CHECK (gateway IN ('openai-api', 'openrouter-api', 'groq-api', 'anthropic-api')),
    is_enabled boolean DEFAULT true NOT NULL,
    enabled_models jsonb DEFAULT '[]' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (clerk_id, gateway)
);

CREATE TABLE app.feedback (
    feedback_id text DEFAULT public.gen_prefixed_id('fbk_'::text) PRIMARY KEY NOT NULL,
    user_id text DEFAULT public.sub(),
    content text NOT NULL,
    context jsonb,
    status text DEFAULT 'new',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE app.errors (
    id bigserial PRIMARY KEY NOT NULL,
    hash text NOT NULL UNIQUE,
    message text NOT NULL,
    stack text,
    location text NOT NULL,
    env text NOT NULL CHECK (env IN ('production', 'development')),
    severity app.severity_level DEFAULT 'error' NOT NULL,
    clerk_id text,
    error jsonb,
    total_count integer DEFAULT 1 NOT NULL,
    last_seen timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- INTEGRATIONS TABLES
-- ============================================================================

CREATE TABLE integrations.providers (
    provider_id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    provider_key text NOT NULL UNIQUE,
    display_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    visibility_level text DEFAULT 'admin_only' NOT NULL,
    logo_path text,
    default_scopes jsonb DEFAULT '[]',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE integrations.access_policies (
    policy_id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    provider_id uuid NOT NULL REFERENCES integrations.providers(provider_id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE (provider_id, user_id)
);

-- ============================================================================
-- LOCKBOX TABLES
-- ============================================================================

CREATE TABLE lockbox.user_secrets (
    user_secret_id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    instance_id text DEFAULT 'default' NOT NULL,
    namespace text DEFAULT 'default' NOT NULL,
    name citext NOT NULL CHECK ((char_length(name::text) >= 1) AND (char_length(name::text) <= 128)),
    ciphertext bytea NOT NULL,
    iv bytea NOT NULL CHECK (octet_length(iv) = 12),
    auth_tag bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
    scope jsonb DEFAULT '{}' NOT NULL,
    version integer DEFAULT 1 NOT NULL CHECK (version > 0),
    is_current boolean DEFAULT true NOT NULL,
    expires_at timestamptz,
    last_used_at timestamptz,
    deleted_at timestamptz,
    created_by text,
    updated_by text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE lockbox.secret_keys (
    secret_id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
    instance_id text DEFAULT 'default' NOT NULL,
    key_id text NOT NULL UNIQUE,
    name citext NOT NULL CHECK ((char_length(name::text) >= 1) AND (char_length(name::text) <= 128)),
    secret_hash text NOT NULL,
    scopes jsonb DEFAULT '[]' NOT NULL,
    environment text DEFAULT 'live' NOT NULL CHECK (char_length(environment) > 0),
    rate_limit_pm integer,
    expires_at timestamptz,
    revoked_at timestamptz,
    last_used_at timestamptz,
    created_by text,
    updated_by text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- LOCKBOX RPC FUNCTIONS (PUBLIC SCHEMA)
-- ============================================================================

-- Read current secret payload
CREATE OR REPLACE FUNCTION public.lockbox_get(
    p_user_id text,
    p_instance_id text,
    p_namespace text,
    p_name text
)
RETURNS TABLE(ciphertext bytea, iv bytea, auth_tag bytea)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF current_setting('role', true) = 'authenticated' THEN
        IF (SELECT auth.uid())::text != p_user_id THEN
            RAISE EXCEPTION 'Access denied: user mismatch';
        END IF;
    END IF;

    RETURN QUERY
    SELECT us.ciphertext, us.iv, us.auth_tag
    FROM lockbox.user_secrets us
    WHERE us.user_id = p_user_id
      AND us.instance_id = p_instance_id
      AND us.namespace = p_namespace
      AND us.name = p_name
      AND us.is_current = true
    LIMIT 1;
END;
$$;

-- Save/rotate secret payload (creates next version and marks current)
CREATE OR REPLACE FUNCTION public.lockbox_save(
    p_user_id text,
    p_instance_id text,
    p_namespace text,
    p_name text,
    p_ciphertext bytea,
    p_iv bytea,
    p_auth_tag bytea,
    p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_next_version integer;
    v_new_id uuid;
BEGIN
    IF current_setting('role', true) = 'authenticated' THEN
        IF (SELECT auth.uid())::text != p_user_id THEN
            RAISE EXCEPTION 'Access denied: user mismatch';
        END IF;
    END IF;

    SELECT COALESCE(MAX(us.version), 0) + 1
    INTO v_next_version
    FROM lockbox.user_secrets us
    WHERE us.user_id = p_user_id
      AND us.instance_id = p_instance_id
      AND us.namespace = p_namespace
      AND us.name = p_name;

    UPDATE lockbox.user_secrets
    SET is_current = false,
        updated_at = now(),
        updated_by = p_user_id
    WHERE user_id = p_user_id
      AND instance_id = p_instance_id
      AND namespace = p_namespace
      AND name = p_name
      AND is_current = true;

    INSERT INTO lockbox.user_secrets (
        user_id, instance_id, namespace, name,
        ciphertext, iv, auth_tag,
        version, is_current, expires_at,
        created_by, updated_by
    ) VALUES (
        p_user_id, p_instance_id, p_namespace, p_name,
        p_ciphertext, p_iv, p_auth_tag,
        v_next_version, true, p_expires_at,
        p_user_id, p_user_id
    )
    RETURNING user_secret_id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Delete all versions for one logical secret key
CREATE OR REPLACE FUNCTION public.lockbox_delete(
    p_user_id text,
    p_instance_id text,
    p_namespace text,
    p_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF current_setting('role', true) = 'authenticated' THEN
        IF (SELECT auth.uid())::text != p_user_id THEN
            RAISE EXCEPTION 'Access denied: user mismatch';
        END IF;
    END IF;

    DELETE FROM lockbox.user_secrets
    WHERE user_id = p_user_id
      AND instance_id = p_instance_id
      AND namespace = p_namespace
      AND name = p_name;
END;
$$;

-- List current secrets in one namespace (metadata + ciphertext for decryption in app)
CREATE OR REPLACE FUNCTION public.lockbox_list(
    p_user_id text,
    p_instance_id text,
    p_namespace text
)
RETURNS TABLE(
    user_secret_id uuid,
    user_id text,
    instance_id text,
    namespace text,
    name citext,
    ciphertext bytea,
    iv bytea,
    auth_tag bytea,
    version integer,
    is_current boolean,
    scope jsonb,
    expires_at timestamptz,
    last_used_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz,
    created_by text,
    updated_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF current_setting('role', true) = 'authenticated' THEN
        IF (SELECT auth.uid())::text != p_user_id THEN
            RAISE EXCEPTION 'Access denied: user mismatch';
        END IF;
    END IF;

    RETURN QUERY
    SELECT us.user_secret_id, us.user_id, us.instance_id, us.namespace, us.name,
           us.ciphertext, us.iv, us.auth_tag,
           us.version, us.is_current, us.scope,
           us.expires_at, us.last_used_at, us.deleted_at,
           us.created_at, us.updated_at, us.created_by, us.updated_by
    FROM lockbox.user_secrets us
    WHERE us.user_id = p_user_id
      AND us.instance_id = p_instance_id
      AND us.namespace = p_namespace
      AND us.is_current = true
    ORDER BY us.created_at DESC;
END;
$$;

-- Existence check for one logical secret key
CREATE OR REPLACE FUNCTION public.lockbox_exists(
    p_user_id text,
    p_instance_id text,
    p_namespace text,
    p_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_exists boolean;
BEGIN
    IF current_setting('role', true) = 'authenticated' THEN
        IF (SELECT auth.uid())::text != p_user_id THEN
            RAISE EXCEPTION 'Access denied: user mismatch';
        END IF;
    END IF;

    SELECT EXISTS(
        SELECT 1
        FROM lockbox.user_secrets us
        WHERE us.user_id = p_user_id
          AND us.instance_id = p_instance_id
          AND us.namespace = p_namespace
          AND us.name = p_name
          AND us.is_current = true
    ) INTO v_exists;

    RETURN v_exists;
END;
$$;

-- Restrict execution surface
REVOKE ALL ON FUNCTION public.lockbox_get(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lockbox_save(text, text, text, text, bytea, bytea, bytea, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lockbox_delete(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lockbox_list(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lockbox_exists(text, text, text, text) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.lockbox_get(text, text, text, text) FROM anon;
        REVOKE ALL ON FUNCTION public.lockbox_save(text, text, text, text, bytea, bytea, bytea, timestamptz) FROM anon;
        REVOKE ALL ON FUNCTION public.lockbox_delete(text, text, text, text) FROM anon;
        REVOKE ALL ON FUNCTION public.lockbox_list(text, text, text) FROM anon;
        REVOKE ALL ON FUNCTION public.lockbox_exists(text, text, text, text) FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON FUNCTION public.lockbox_get(text, text, text, text) FROM authenticated;
        REVOKE ALL ON FUNCTION public.lockbox_save(text, text, text, text, bytea, bytea, bytea, timestamptz) FROM authenticated;
        REVOKE ALL ON FUNCTION public.lockbox_delete(text, text, text, text) FROM authenticated;
        REVOKE ALL ON FUNCTION public.lockbox_list(text, text, text) FROM authenticated;
        REVOKE ALL ON FUNCTION public.lockbox_exists(text, text, text, text) FROM authenticated;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.lockbox_get(text, text, text, text) TO service_role;
        GRANT EXECUTE ON FUNCTION public.lockbox_save(text, text, text, text, bytea, bytea, bytea, timestamptz) TO service_role;
        GRANT EXECUTE ON FUNCTION public.lockbox_delete(text, text, text, text) TO service_role;
        GRANT EXECUTE ON FUNCTION public.lockbox_list(text, text, text) TO service_role;
        GRANT EXECUTE ON FUNCTION public.lockbox_exists(text, text, text, text) TO service_role;
    END IF;
END;
$$;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- IAM indexes
CREATE INDEX idx_users_email_ci ON iam.users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX idx_users_clerk_id ON iam.users (clerk_id) WHERE clerk_id IS NOT NULL;
CREATE INDEX idx_users_status ON iam.users (status);
CREATE INDEX idx_users_invite_code ON iam.users (invite_code);
CREATE INDEX idx_users_is_test_env ON iam.users (is_test_env);
CREATE INDEX idx_users_test_run_id ON iam.users (test_run_id);

CREATE INDEX idx_orgs_name_ci ON iam.orgs (lower(name));
CREATE INDEX idx_orgs_is_test_env ON iam.orgs (is_test_env);
CREATE INDEX idx_orgs_test_run_id ON iam.orgs (test_run_id);

CREATE INDEX idx_org_memberships_user ON iam.org_memberships (user_id);
CREATE INDEX idx_org_memberships_org ON iam.org_memberships (org_id);
CREATE INDEX idx_org_memberships_org_role ON iam.org_memberships (org_id, role);

CREATE INDEX idx_sessions_user ON iam.sessions (user_id);
CREATE INDEX idx_sessions_domain ON iam.sessions (domain_id);
CREATE INDEX idx_sessions_expires_at ON iam.sessions (expires_at);
CREATE INDEX idx_sessions_sdk_session ON iam.sessions (sdk_session_id);

CREATE INDEX idx_user_preferences_org ON iam.user_preferences (selected_org_id);
CREATE INDEX idx_org_invites_email_ci ON iam.org_invites (lower(email::text));
CREATE INDEX idx_org_invites_org_email ON iam.org_invites (org_id, lower(email::text));
CREATE UNIQUE INDEX idx_org_invites_token ON iam.org_invites (token);
CREATE UNIQUE INDEX uniq_open_invite_per_email_org ON iam.org_invites (org_id, email) WHERE accepted_at IS NULL;

CREATE INDEX idx_email_invites_sender_date ON iam.email_invites (sender_id, sent_at);
CREATE INDEX idx_referrals_referrer ON iam.referrals (referrer_id);
CREATE INDEX idx_referrals_status ON iam.referrals (status);

-- App indexes
CREATE UNIQUE INDEX idx_domains_hostname_ci ON app.domains (lower(hostname));
CREATE INDEX idx_domains_org ON app.domains (org_id);
CREATE INDEX idx_domains_is_test_env ON app.domains (is_test_env);
CREATE INDEX idx_domains_test_run_id ON app.domains (test_run_id);
CREATE INDEX domains_server_id_idx ON app.domains (server_id);

CREATE INDEX idx_conversations_user_workspace ON app.conversations (user_id, workspace, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_user_updated ON app.conversations (user_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_org_shared ON app.conversations (org_id, visibility, updated_at DESC) WHERE deleted_at IS NULL AND visibility = 'shared';

CREATE INDEX idx_conversation_tabs_conversation ON app.conversation_tabs (conversation_id, position) WHERE closed_at IS NULL;

CREATE INDEX idx_messages_tab_seq ON app.messages (tab_id, seq);
CREATE INDEX idx_messages_tab_created ON app.messages (tab_id, created_at);

CREATE INDEX idx_automation_jobs_site_id ON app.automation_jobs (site_id);
CREATE INDEX idx_automation_jobs_user_id ON app.automation_jobs (user_id);
CREATE INDEX idx_automation_jobs_org_id ON app.automation_jobs (org_id);
CREATE INDEX idx_automation_jobs_is_active ON app.automation_jobs (is_active);
CREATE INDEX idx_automation_jobs_trigger_type ON app.automation_jobs (trigger_type);
CREATE INDEX idx_automation_jobs_next_run ON app.automation_jobs (next_run_at) WHERE is_active = true AND next_run_at IS NOT NULL;

CREATE INDEX idx_automation_runs_job_id ON app.automation_runs (job_id);
CREATE INDEX idx_automation_runs_started_at ON app.automation_runs (started_at DESC);
CREATE INDEX idx_automation_runs_status ON app.automation_runs (status);

CREATE INDEX idx_user_quotas_user_id ON app.user_quotas (user_id);
CREATE INDEX idx_gateway_settings_clerk ON app.gateway_settings (clerk_id);
CREATE UNIQUE INDEX errors_hash_uidx ON app.errors (hash);
CREATE INDEX errors_env_last_seen_idx ON app.errors (env, last_seen DESC);

-- Integrations indexes
CREATE INDEX idx_providers_visibility ON integrations.providers (is_active, visibility_level);
CREATE INDEX idx_policies_lookup ON integrations.access_policies (user_id, provider_id);

-- Lockbox indexes
CREATE UNIQUE INDEX user_secrets_instance_version_idx ON lockbox.user_secrets (user_id, instance_id, namespace, name, version DESC);
CREATE UNIQUE INDEX user_secrets_one_current_per_instance_idx ON lockbox.user_secrets (user_id, instance_id, namespace, name) WHERE is_current = true;
CREATE INDEX idx_user_secrets_expires_at ON lockbox.user_secrets (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX secret_keys_user_idx ON lockbox.secret_keys (user_id);
CREATE INDEX secret_keys_user_instance_idx ON lockbox.secret_keys (user_id, instance_id);
CREATE INDEX idx_secret_keys_secret_hash ON lockbox.secret_keys (secret_hash);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON iam.users FOR EACH ROW EXECUTE FUNCTION iam.set_updated_at();
CREATE TRIGGER trg_users_set_invite_code BEFORE INSERT ON iam.users FOR EACH ROW EXECUTE FUNCTION iam.set_invite_code();
CREATE TRIGGER set_orgs_updated_at BEFORE UPDATE ON iam.orgs FOR EACH ROW EXECUTE FUNCTION iam.set_updated_at();
CREATE TRIGGER set_org_memberships_updated_at BEFORE UPDATE ON iam.org_memberships FOR EACH ROW EXECUTE FUNCTION iam.set_updated_at();

CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON app.conversations FOR EACH ROW EXECUTE FUNCTION app.update_updated_at();
CREATE TRIGGER messages_updated_at BEFORE UPDATE ON app.messages FOR EACH ROW EXECUTE FUNCTION app.update_updated_at();
CREATE TRIGGER automation_jobs_updated_at BEFORE UPDATE ON app.automation_jobs FOR EACH ROW EXECUTE FUNCTION app.automation_jobs_updated_at();
CREATE TRIGGER automation_jobs_generate_webhook_secret BEFORE INSERT ON app.automation_jobs FOR EACH ROW EXECUTE FUNCTION app.automation_jobs_generate_webhook_secret();
CREATE TRIGGER automation_runs_compute_duration BEFORE UPDATE ON app.automation_runs FOR EACH ROW EXECUTE FUNCTION app.automation_runs_compute_duration();
CREATE TRIGGER auto_increment_error_count_trigger BEFORE INSERT OR UPDATE ON app.errors FOR EACH ROW EXECUTE FUNCTION app.auto_increment_error_count();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON lockbox.user_secrets FOR EACH ROW EXECUTE FUNCTION lockbox.tg_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON lockbox.secret_keys FOR EACH ROW EXECUTE FUNCTION lockbox.tg_set_updated_at();

-- ============================================================================
-- DONE
-- ============================================================================
-- Your database is ready. Now run: bun run gen:types
