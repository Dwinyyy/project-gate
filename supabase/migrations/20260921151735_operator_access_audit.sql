-- Private, attributable operator-status management. No player or runtime execution grant.
CREATE TABLE ops.operator_access_changes (
  request_id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  previous_status text CHECK (previous_status IN ('active', 'suspended')),
  new_status text NOT NULL CHECK (new_status IN ('active', 'suspended')),
  requested_by text NOT NULL CHECK (length(requested_by) BETWEEN 1 AND 160 AND length(btrim(requested_by)) > 0),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500 AND length(btrim(reason)) > 0),
  database_actor text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operator_access_changes_subject ON ops.operator_access_changes(auth_user_id, recorded_at);
REVOKE ALL ON ops.operator_access_changes FROM PUBLIC, hunter_runtime;

CREATE FUNCTION ops.set_operator_status(
  p_request_id uuid,
  p_auth_user_id uuid,
  p_status text,
  p_requested_by text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, ops
AS $$
DECLARE
  receipt ops.operator_access_changes%ROWTYPE;
  prior_status text;
  account_eligible boolean;
  account_owner oid;
BEGIN
  SELECT relowner INTO account_owner FROM pg_class WHERE oid = 'ops.operator_accounts'::regclass;
  IF NOT pg_has_role(current_user, account_owner, 'USAGE') THEN
    RAISE EXCEPTION 'Operator management requires the database owner role' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_auth_user_id IS NULL OR p_status IS NULL
     OR p_status NOT IN ('active', 'suspended')
     OR p_requested_by IS NULL OR length(p_requested_by) NOT BETWEEN 1 AND 160 OR length(btrim(p_requested_by)) = 0
     OR p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 500 OR length(btrim(p_reason)) = 0
     OR p_requested_by ~ '[[:cntrl:]]' OR p_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid operator status request' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('operator-request:' || p_request_id::text, 0));
  SELECT * INTO receipt FROM ops.operator_access_changes WHERE request_id = p_request_id;
  IF FOUND THEN
    IF receipt.auth_user_id <> p_auth_user_id OR receipt.new_status <> p_status
       OR receipt.requested_by <> p_requested_by OR receipt.reason <> p_reason THEN
      RAISE EXCEPTION 'Operator request already exists with different terms' USING ERRCODE = '22023';
    END IF;
    -- Return the historical receipt; replay must never reinstate a later suspended grant.
    RETURN to_jsonb(receipt);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('operator-account:' || p_auth_user_id::text, 0));
  SELECT status INTO prior_status FROM ops.operator_accounts WHERE auth_user_id = p_auth_user_id FOR UPDATE;
  IF p_status = 'active' THEN
    SELECT true INTO account_eligible FROM auth.users
      WHERE id = p_auth_user_id AND email_confirmed_at IS NOT NULL
        AND deleted_at IS NULL AND NOT coalesce(is_anonymous, false)
        AND (banned_until IS NULL OR banned_until <= now())
      FOR SHARE;
    IF NOT coalesce(account_eligible, false) THEN
      RAISE EXCEPTION 'Operator activation requires a verified eligible account' USING ERRCODE = '22023';
    END IF;
    SELECT true INTO account_eligible FROM auth.mfa_factors
      WHERE user_id = p_auth_user_id AND factor_type = 'totp' AND status = 'verified'
      ORDER BY id LIMIT 1 FOR SHARE;
    IF NOT coalesce(account_eligible, false) THEN
      RAISE EXCEPTION 'Operator activation requires a verified authenticator' USING ERRCODE = '22023';
    END IF;
    INSERT INTO ops.operator_accounts(auth_user_id, status) VALUES (p_auth_user_id, 'active')
      ON CONFLICT (auth_user_id) DO UPDATE SET status = 'active', updated_at = now();
  ELSE
    IF prior_status IS NULL THEN
      RAISE EXCEPTION 'Cannot suspend an operator account that does not exist' USING ERRCODE = '22023';
    END IF;
    UPDATE ops.operator_accounts SET status = 'suspended', updated_at = now()
      WHERE auth_user_id = p_auth_user_id;
  END IF;

  INSERT INTO ops.operator_access_changes(
    request_id, auth_user_id, previous_status, new_status, requested_by, reason, database_actor
  ) VALUES (
    p_request_id, p_auth_user_id, prior_status, p_status, p_requested_by, p_reason, session_user
  ) RETURNING * INTO receipt;
  -- This path does not add or modify permission rows.
  RETURN to_jsonb(receipt);
END;
$$;

REVOKE ALL ON FUNCTION ops.set_operator_status(uuid, uuid, text, text, text) FROM PUBLIC, hunter_runtime;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON ops.operator_access_changes FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION ops.set_operator_status(uuid, uuid, text, text, text) FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
