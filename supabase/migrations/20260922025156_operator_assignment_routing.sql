-- Owner assignment precedes MFA enrollment. Assignment alone is never API authority.
-- Supersedes the order in 20260921151735 without rewriting its deployed history.
CREATE OR REPLACE FUNCTION ops.set_operator_status(
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
      RAISE EXCEPTION 'Operator assignment requires a verified eligible account' USING ERRCODE = '22023';
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
  RETURN to_jsonb(receipt);
END;
$$;

-- Convenience for the project owner in SQL Editor. PUBLIC/API roles cannot call it.
-- A fresh call without p_request_id is a new owner action. Supply the receipt ID to retry.
CREATE FUNCTION ops.set_operator_status_by_email(
  p_email text,
  p_status text,
  p_requested_by text,
  p_reason text,
  p_request_id uuid DEFAULT gen_random_uuid()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, ops
AS $$
DECLARE
  normalized_email text := lower(btrim(p_email));
  candidate_ids uuid[];
  account_owner oid;
BEGIN
  SELECT relowner INTO account_owner FROM pg_class WHERE oid = 'ops.operator_accounts'::regclass;
  IF NOT pg_has_role(current_user, account_owner, 'USAGE') THEN
    RAISE EXCEPTION 'Operator management requires the database owner role' USING ERRCODE = '42501';
  END IF;
  IF normalized_email IS NULL OR length(normalized_email) NOT BETWEEN 3 AND 320
     OR normalized_email ~ '[[:space:][:cntrl:]]'
     OR position('@' IN normalized_email) < 2 THEN
    RAISE EXCEPTION 'Invalid operator email' USING ERRCODE = '22023';
  END IF;
  -- Hold identity rows stable until assignment and its receipt have committed.
  SELECT array_agg(id) INTO candidate_ids FROM (
    SELECT id FROM auth.users WHERE lower(email) = normalized_email ORDER BY id FOR SHARE
  ) candidates;
  IF coalesce(cardinality(candidate_ids), 0) <> 1 THEN
    RAISE EXCEPTION 'Operator email must identify exactly one account' USING ERRCODE = '22023';
  END IF;
  RETURN ops.set_operator_status(p_request_id, candidate_ids[1], p_status, p_requested_by, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION ops.set_operator_status(uuid, uuid, text, text, text) FROM PUBLIC, hunter_runtime;
REVOKE ALL ON FUNCTION ops.set_operator_status_by_email(text, text, text, text, uuid) FROM PUBLIC, hunter_runtime;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION ops.set_operator_status(uuid, uuid, text, text, text) FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION ops.set_operator_status_by_email(text, text, text, text, uuid) FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
