-- Task 2.2 stores durable game identity without enabling character creation.
CREATE SCHEMA game;
REVOKE ALL ON SCHEMA game FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA game REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA game REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA game REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE game.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  character_creation_not_before timestamptz,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES game.accounts(id) ON DELETE RESTRICT,
  display_alias text NOT NULL CHECK (
    length(display_alias) BETWEEN 1 AND 40 AND length(btrim(display_alias)) > 0
  ),
  life_state text NOT NULL DEFAULT 'alive' CHECK (
    life_state IN ('alive', 'incapacitated', 'dead')
  ),
  awakening_state text NOT NULL DEFAULT 'unawakened' CHECK (
    awakening_state IN ('unawakened', 'awakened')
  ),
  presence_state text NOT NULL DEFAULT 'sheltered' CHECK (
    presence_state IN ('sheltered', 'active', 'committed')
  ),
  profile_visibility text NOT NULL DEFAULT 'private' CHECK (
    profile_visibility IN ('private', 'limited', 'public')
  ),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_living_character_per_account ON game.characters(account_id)
  WHERE life_state IN ('alive', 'incapacitated');

REVOKE ALL ON game.accounts, game.characters FROM PUBLIC;
GRANT USAGE ON SCHEMA game TO hunter_runtime;
GRANT SELECT ON game.accounts, game.characters TO hunter_runtime;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA game FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA game FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA game FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA game FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
