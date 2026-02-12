-- Migration: lockbox-rpc-hardening
-- Applied: 2026-02-12
--
-- Purpose:
--   Move lockbox access behind public RPC functions so lockbox schema does not
--   need to be exposed via PostgREST.
--
-- Safety:
--   - SECURITY DEFINER functions
--   - Ownership checks for authenticated callers
--   - Execute rights restricted to service_role
--
-- Run:
--   psql "$SUPABASE_DB_URL" -f apps/web/migrations/lockbox-rpc-hardening.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.lockbox_get(
  p_user_id text,
  p_instance_id text,
  p_namespace text,
  p_name text
)
RETURNS TABLE (
  ciphertext bytea,
  iv bytea,
  auth_tag bytea
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Defense in depth: if this is ever granted to authenticated, enforce self-access.
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
  -- Defense in depth: if this is ever granted to authenticated, enforce self-access.
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
    user_id,
    instance_id,
    namespace,
    name,
    ciphertext,
    iv,
    auth_tag,
    version,
    is_current,
    expires_at,
    created_by,
    updated_by
  ) VALUES (
    p_user_id,
    p_instance_id,
    p_namespace,
    p_name,
    p_ciphertext,
    p_iv,
    p_auth_tag,
    v_next_version,
    true,
    p_expires_at,
    p_user_id,
    p_user_id
  )
  RETURNING user_secret_id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

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
  -- Defense in depth: if this is ever granted to authenticated, enforce self-access.
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

CREATE OR REPLACE FUNCTION public.lockbox_list(
  p_user_id text,
  p_instance_id text,
  p_namespace text
)
RETURNS TABLE (
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
  -- Defense in depth: if this is ever granted to authenticated, enforce self-access.
  IF current_setting('role', true) = 'authenticated' THEN
    IF (SELECT auth.uid())::text != p_user_id THEN
      RAISE EXCEPTION 'Access denied: user mismatch';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    us.user_secret_id,
    us.user_id,
    us.instance_id,
    us.namespace,
    us.name,
    us.ciphertext,
    us.iv,
    us.auth_tag,
    us.version,
    us.is_current,
    us.scope,
    us.expires_at,
    us.last_used_at,
    us.deleted_at,
    us.created_at,
    us.updated_at,
    us.created_by,
    us.updated_by
  FROM lockbox.user_secrets us
  WHERE us.user_id = p_user_id
    AND us.instance_id = p_instance_id
    AND us.namespace = p_namespace
    AND us.is_current = true
  ORDER BY us.created_at DESC;
END;
$$;

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
  -- Defense in depth: if this is ever granted to authenticated, enforce self-access.
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

REVOKE ALL ON FUNCTION public.lockbox_get(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lockbox_get(text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.lockbox_get(text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lockbox_get(text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.lockbox_save(text, text, text, text, bytea, bytea, bytea, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lockbox_save(text, text, text, text, bytea, bytea, bytea, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.lockbox_save(text, text, text, text, bytea, bytea, bytea, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lockbox_save(text, text, text, text, bytea, bytea, bytea, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.lockbox_delete(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lockbox_delete(text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.lockbox_delete(text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lockbox_delete(text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.lockbox_list(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lockbox_list(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.lockbox_list(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lockbox_list(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.lockbox_exists(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lockbox_exists(text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.lockbox_exists(text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lockbox_exists(text, text, text, text) TO service_role;

COMMIT;
