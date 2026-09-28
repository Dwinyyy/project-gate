-- Task 2.4 keeps game moderation separate from provider and character life state.
-- Only the trusted migration owner can change access_state in this task.
ALTER TABLE game.accounts
  ADD COLUMN access_state text NOT NULL DEFAULT 'active'
  CONSTRAINT accounts_access_state_check CHECK (access_state IN ('active', 'restricted'));

-- PostgreSQL requires UPDATE privilege on at least one column for SELECT FOR SHARE.
-- The authority guard locks the character row before checking current state.
GRANT UPDATE (revision) ON game.characters TO hunter_runtime;

-- Preserve the private game schema and make the new state/lock grant explicit.
REVOKE ALL ON SCHEMA game FROM PUBLIC;
REVOKE ALL ON game.accounts, game.characters FROM PUBLIC;
REVOKE UPDATE (access_state) ON game.accounts FROM hunter_runtime;
REVOKE UPDATE (account_id, life_state, awakening_state, presence_state, profile_visibility)
  ON game.characters FROM hunter_runtime;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA game FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA game FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA game FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA game FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
