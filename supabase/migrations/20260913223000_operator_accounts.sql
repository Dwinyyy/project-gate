-- Phase 2 Task 2.1. Operator identity is independent of player/game authority.
CREATE TABLE ops.operator_accounts (
  auth_user_id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);

CREATE TABLE ops.operator_permissions (
  auth_user_id uuid NOT NULL REFERENCES ops.operator_accounts(auth_user_id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (
    length(permission) BETWEEN 3 AND 80
    AND permission ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$'
  ),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id, permission)
);

REVOKE ALL ON ops.operator_accounts, ops.operator_permissions FROM PUBLIC;
GRANT SELECT ON ops.operator_accounts, ops.operator_permissions TO hunter_runtime;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON ops.operator_accounts, ops.operator_permissions FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
