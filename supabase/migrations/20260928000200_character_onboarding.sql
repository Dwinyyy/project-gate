-- V1 appearance defaults preserve trusted legacy inserts and existing rows.
-- Public creation will supply every selection explicitly in Task 2.5's API.
ALTER TABLE game.characters
  ADD COLUMN catalog_version integer NOT NULL DEFAULT 1
    CONSTRAINT characters_catalog_version_check CHECK (catalog_version = 1),
  ADD COLUMN preset_id text NOT NULL DEFAULT 'portrait-01'
    CONSTRAINT characters_preset_id_check CHECK (preset_id IN ('portrait-01', 'portrait-02', 'portrait-03', 'portrait-04')),
  ADD COLUMN skin_tone_id text NOT NULL DEFAULT 'tone-03'
    CONSTRAINT characters_skin_tone_id_check CHECK (skin_tone_id IN ('tone-01', 'tone-02', 'tone-03', 'tone-04', 'tone-05', 'tone-06')),
  ADD COLUMN hair_style_id text NOT NULL DEFAULT 'cropped'
    CONSTRAINT characters_hair_style_id_check CHECK (hair_style_id IN ('cropped', 'swept', 'curly', 'coiled', 'shaved')),
  ADD COLUMN hair_color_id text NOT NULL DEFAULT 'black'
    CONSTRAINT characters_hair_color_id_check CHECK (hair_color_id IN ('black', 'brown', 'auburn', 'blond', 'silver'));

CREATE TABLE ops.character_pilot_access (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ops.character_pilot_changes (
  request_id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  previous_enabled boolean NOT NULL,
  enabled boolean NOT NULL,
  requested_by text NOT NULL CHECK (length(requested_by) BETWEEN 1 AND 160 AND length(btrim(requested_by)) > 0),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500 AND length(btrim(reason)) > 0),
  database_actor text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX character_pilot_changes_subject ON ops.character_pilot_changes(auth_user_id, recorded_at);

-- The receipt is permanent even when Auth deletes the subject. Owner corrections append a new request.
CREATE FUNCTION ops.prevent_character_pilot_change_rewrite() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, ops
AS $$
BEGIN
  RAISE EXCEPTION 'Character pilot audit is append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER character_pilot_changes_append_only
  BEFORE UPDATE OR DELETE ON ops.character_pilot_changes
  FOR EACH ROW EXECUTE FUNCTION ops.prevent_character_pilot_change_rewrite();

CREATE FUNCTION ops.set_character_pilot_status_by_email(
  p_email text,
  p_enabled boolean,
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
  subject_id uuid;
  receipt ops.character_pilot_changes%ROWTYPE;
  prior_enabled boolean;
  eligible boolean;
  operator_assigned boolean;
  access_owner oid;
BEGIN
  SELECT relowner INTO access_owner FROM pg_class WHERE oid = 'ops.character_pilot_access'::regclass;
  IF NOT pg_has_role(current_user, access_owner, 'USAGE') THEN
    RAISE EXCEPTION 'Character pilot management requires the database owner role' USING ERRCODE = '42501';
  END IF;
  IF normalized_email IS NULL OR length(normalized_email) NOT BETWEEN 3 AND 320
     OR normalized_email ~ '[[:space:][:cntrl:]]' OR position('@' IN normalized_email) < 2
     OR p_enabled IS NULL OR p_request_id IS NULL
     OR p_requested_by IS NULL OR length(p_requested_by) NOT BETWEEN 1 AND 160 OR length(btrim(p_requested_by)) = 0
     OR p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 500 OR length(btrim(p_reason)) = 0
     OR p_requested_by ~ '[[:cntrl:]]' OR p_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid character pilot request' USING ERRCODE = '22023';
  END IF;

  -- Resolve without locking first, then use the same account lock as character creation
  -- and operator assignment before rechecking current provider and operator rows.
  SELECT array_agg(id) INTO candidate_ids FROM auth.users WHERE lower(btrim(email)) = normalized_email;
  IF coalesce(cardinality(candidate_ids), 0) <> 1 THEN
    RAISE EXCEPTION 'Character pilot email must identify exactly one account' USING ERRCODE = '22023';
  END IF;
  subject_id := candidate_ids[1];

  PERFORM pg_advisory_xact_lock(hashtextextended('character-pilot-request:' || p_request_id::text, 0));
  SELECT * INTO receipt FROM ops.character_pilot_changes WHERE request_id = p_request_id;
  IF FOUND THEN
    IF receipt.auth_user_id <> subject_id OR receipt.enabled <> p_enabled
       OR receipt.requested_by <> p_requested_by OR receipt.reason <> p_reason THEN
      RAISE EXCEPTION 'Character pilot request already exists with different terms' USING ERRCODE = '22023';
    END IF;
    RETURN to_jsonb(receipt);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('operator-account:' || subject_id::text, 0));
  SELECT array_agg(id), bool_and(
    email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND NOT coalesce(is_anonymous, false)
    AND (banned_until IS NULL OR banned_until <= now())
  ) INTO candidate_ids, eligible
    FROM (SELECT * FROM auth.users WHERE lower(btrim(email)) = normalized_email ORDER BY id FOR SHARE) locked_users;
  IF coalesce(cardinality(candidate_ids), 0) <> 1 OR candidate_ids[1] <> subject_id THEN
    RAISE EXCEPTION 'Character pilot email changed during request' USING ERRCODE = '22023';
  END IF;
  SELECT true INTO operator_assigned FROM ops.operator_accounts WHERE auth_user_id = subject_id FOR SHARE;
  IF p_enabled AND (NOT coalesce(eligible, false) OR coalesce(operator_assigned, false)) THEN
    RAISE EXCEPTION 'Character pilot grant requires an eligible non-operator account' USING ERRCODE = '22023';
  END IF;

  SELECT enabled INTO prior_enabled FROM ops.character_pilot_access WHERE auth_user_id = subject_id FOR UPDATE;
  prior_enabled := coalesce(prior_enabled, false);
  INSERT INTO ops.character_pilot_access(auth_user_id, enabled)
    VALUES (subject_id, p_enabled)
    ON CONFLICT (auth_user_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();
  INSERT INTO ops.character_pilot_changes(
    request_id, auth_user_id, previous_enabled, enabled, requested_by, reason, database_actor
  ) VALUES (
    p_request_id, subject_id, prior_enabled, p_enabled, p_requested_by, p_reason, session_user
  ) RETURNING * INTO receipt;
  RETURN to_jsonb(receipt);
END;
$$;

-- PostgreSQL requires UPDATE privilege for a caller's SELECT FOR SHARE. Keep
-- runtime read-only: the trusted migration/table owner takes the row lock.
-- The function owner and pinned search path are security-sensitive migration
-- read-back checks; no public role may execute this SECURITY DEFINER routine.
CREATE FUNCTION ops.lock_character_pilot_access(p_auth_user_id uuid) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  pilot_enabled boolean;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT enabled INTO pilot_enabled
    FROM ops.character_pilot_access
    WHERE auth_user_id = p_auth_user_id
    FOR SHARE;
  RETURN coalesce(pilot_enabled, false);
END;
$$;

REVOKE ALL ON ops.character_pilot_access, ops.character_pilot_changes FROM PUBLIC, hunter_runtime;
REVOKE ALL ON FUNCTION ops.prevent_character_pilot_change_rewrite() FROM PUBLIC, hunter_runtime;
REVOKE ALL ON FUNCTION ops.set_character_pilot_status_by_email(text, boolean, text, text, uuid) FROM PUBLIC, hunter_runtime;
REVOKE ALL ON FUNCTION ops.lock_character_pilot_access(uuid) FROM PUBLIC;
GRANT SELECT (auth_user_id, enabled) ON ops.character_pilot_access TO hunter_runtime;
GRANT EXECUTE ON FUNCTION ops.lock_character_pilot_access(uuid) TO hunter_runtime;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON ops.character_pilot_access, ops.character_pilot_changes FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION ops.prevent_character_pilot_change_rewrite() FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION ops.set_character_pilot_status_by_email(text, boolean, text, text, uuid) FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION ops.lock_character_pilot_access(uuid) FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;

-- Keep both gates closed until the reviewed application and an owner-managed pilot exist.
UPDATE ops.feature_controls SET characters = false WHERE singleton;
