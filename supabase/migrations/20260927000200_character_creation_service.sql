-- Task 2.3: private creation receipts and current Auth eligibility for the server transaction.
-- This migration does not enable player character creation.
CREATE TABLE game.character_creation_receipts (
  account_id uuid NOT NULL REFERENCES game.accounts(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL,
  request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint) = 32),
  character_id uuid NOT NULL UNIQUE REFERENCES game.characters(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, operation_id)
);

REVOKE ALL ON game.character_creation_receipts FROM PUBLIC;

-- The runtime has no direct privilege on auth.users. The trusted migration owner
-- locks the provider row and returns only current eligibility to the caller.
CREATE FUNCTION game.lock_eligible_auth_user(p_auth_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $$
DECLARE
  provider_user auth.users%ROWTYPE;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO provider_user
    FROM auth.users
    WHERE id = p_auth_user_id
    FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN provider_user.email_confirmed_at IS NOT NULL
    AND provider_user.deleted_at IS NULL
    AND NOT coalesce(provider_user.is_anonymous, false)
    AND (provider_user.banned_until IS NULL OR provider_user.banned_until <= clock_timestamp());
END;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default. Revoke before
-- granting the sole application caller, in this migration's transaction.
REVOKE ALL ON FUNCTION game.lock_eligible_auth_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game.lock_eligible_auth_user(uuid) TO hunter_runtime;

GRANT INSERT (auth_user_id) ON game.accounts TO hunter_runtime;
GRANT UPDATE (revision) ON game.accounts TO hunter_runtime;
GRANT INSERT (account_id, display_alias) ON game.characters TO hunter_runtime;
GRANT SELECT ON game.character_creation_receipts TO hunter_runtime;
GRANT INSERT (account_id, operation_id, request_fingerprint, character_id)
  ON game.character_creation_receipts TO hunter_runtime;
GRANT UPDATE (singleton) ON ops.feature_controls TO hunter_runtime;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA game FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON game.character_creation_receipts FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION game.lock_eligible_auth_user(uuid) FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
