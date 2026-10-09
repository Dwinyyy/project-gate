-- Voluntary civilian disclosure stays private until current transactional consent.
ALTER TABLE game.characters
  ADD COLUMN show_fictional_avatar boolean NOT NULL DEFAULT false,
  ADD COLUMN show_registration_date boolean NOT NULL DEFAULT false,
  ADD COLUMN disclosure_revision bigint NOT NULL DEFAULT 0 CHECK (disclosure_revision >= 0),
  ADD COLUMN public_reference uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD CONSTRAINT characters_public_reference_unique UNIQUE (public_reference),
  ADD CONSTRAINT characters_public_reference_independent CHECK (public_reference <> id AND public_reference::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  ADD CONSTRAINT characters_id_account_unique UNIQUE (id, account_id);
-- Existing profile_visibility was never publication consent.
UPDATE game.characters SET profile_visibility = 'private', show_fictional_avatar = false,
  show_registration_date = false, disclosure_revision = 0, public_reference = gen_random_uuid();
ALTER TABLE ops.feature_controls ADD COLUMN profile_disclosure boolean NOT NULL DEFAULT false;

CREATE TABLE game.profile_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES game.accounts(id) ON DELETE RESTRICT,
  character_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope = 'profile.view'),
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
  disclosure_revision bigint NOT NULL CHECK (disclosure_revision >= 0),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at = issued_at + interval '10 minutes'),
  revoked_at timestamptz CHECK (revoked_at >= issued_at),
  operation_id uuid NOT NULL,
  rule_version text NOT NULL CHECK (rule_version = 'civilian-profile-v1'),
  FOREIGN KEY (character_id, account_id) REFERENCES game.characters(id, account_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX profile_invitations_one_nonrevoked ON game.profile_invitations(character_id, scope) WHERE revoked_at IS NULL;
CREATE INDEX profile_invitations_history ON game.profile_invitations(character_id, issued_at DESC, id);
CREATE INDEX profile_invitations_account ON game.profile_invitations(account_id);

-- Typed minimal receipt metadata: no disclosed fields, routing reference or secret.
CREATE TABLE game.profile_operation_receipts (
  account_id uuid NOT NULL REFERENCES game.accounts(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL,
  request_digest bytea NOT NULL CHECK (octet_length(request_digest) = 32),
  operation text NOT NULL CHECK (operation IN ('profile.update','profile.invitation.generate','profile.invitation.replace','profile.invitation.revoke','profile.disclosure.withdraw')),
  character_id uuid,
  rule_version text NOT NULL CHECK (rule_version = 'civilian-profile-v1'),
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  affected_profile_count integer NOT NULL CHECK (affected_profile_count > 0),
  character_revision bigint CHECK (character_revision >= 0),
  disclosure_revision bigint CHECK (disclosure_revision >= 0),
  invitation_id uuid REFERENCES game.profile_invitations(id) ON DELETE RESTRICT,
  issued_at timestamptz,
  expires_at timestamptz,
  PRIMARY KEY (account_id, operation_id),
  FOREIGN KEY (character_id, account_id) REFERENCES game.characters(id, account_id) ON DELETE RESTRICT,
  CHECK (
    (operation = 'profile.disclosure.withdraw' AND character_id IS NULL AND character_revision IS NULL AND disclosure_revision IS NULL)
    OR (operation <> 'profile.disclosure.withdraw' AND character_id IS NOT NULL AND character_revision IS NOT NULL AND disclosure_revision IS NOT NULL AND affected_profile_count = 1)
  ),
  CHECK (
    (operation IN ('profile.invitation.generate','profile.invitation.replace') AND invitation_id IS NOT NULL AND issued_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at = issued_at + interval '10 minutes')
    OR (operation NOT IN ('profile.invitation.generate','profile.invitation.replace') AND invitation_id IS NULL AND issued_at IS NULL AND expires_at IS NULL)
  )
);
CREATE INDEX profile_receipts_character ON game.profile_operation_receipts(character_id);
CREATE FUNCTION game.prevent_profile_receipt_rewrite() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, game
AS $$ BEGIN RAISE EXCEPTION 'Profile receipt is append-only' USING ERRCODE = '42501'; END $$;
REVOKE ALL ON FUNCTION game.prevent_profile_receipt_rewrite() FROM PUBLIC;
CREATE TRIGGER profile_receipts_append_only BEFORE UPDATE OR DELETE ON game.profile_operation_receipts
  FOR EACH ROW EXECUTE FUNCTION game.prevent_profile_receipt_rewrite();
REVOKE ALL ON game.profile_invitations, game.profile_operation_receipts FROM PUBLIC;
GRANT SELECT, INSERT ON game.profile_invitations, game.profile_operation_receipts TO hunter_runtime;
GRANT UPDATE (revoked_at) ON game.profile_invitations TO hunter_runtime;
GRANT UPDATE (profile_visibility, show_fictional_avatar, show_registration_date, disclosure_revision, public_reference)
  ON game.characters TO hunter_runtime;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON game.profile_invitations, game.profile_operation_receipts FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION game.prevent_profile_receipt_rewrite() FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
