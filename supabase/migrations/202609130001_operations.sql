-- Phase 1 only. No gameplay authority is enabled by this migration.
CREATE SCHEMA IF NOT EXISTS ops;
REVOKE ALL ON SCHEMA ops FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hunter_runtime') THEN
    CREATE ROLE hunter_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hunter_runtime'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'hunter_runtime must be an unprivileged application role';
  END IF;
END
$$;

CREATE TABLE ops.feature_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  registration boolean NOT NULL DEFAULT false,
  characters boolean NOT NULL DEFAULT false,
  encounters boolean NOT NULL DEFAULT false,
  commerce boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ops.feature_controls (singleton) VALUES (true);

CREATE TABLE ops.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE CHECK (length(event_key) BETWEEN 1 AND 160),
  topic text NOT NULL CHECK (topic = 'foundation.demo.requested'),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished ON ops.outbox_events (created_at, id)
  WHERE published_at IS NULL;

CREATE TABLE ops.consumer_receipts (
  consumer_name text NOT NULL,
  event_id uuid NOT NULL REFERENCES ops.outbox_events(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);
CREATE INDEX consumer_receipts_event ON ops.consumer_receipts (event_id);

CREATE TABLE ops.demo_effects (
  event_id uuid PRIMARY KEY REFERENCES ops.outbox_events(id),
  event_key text NOT NULL UNIQUE,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA ops TO hunter_runtime;
GRANT SELECT ON ops.feature_controls TO hunter_runtime;
GRANT SELECT, INSERT ON ops.outbox_events TO hunter_runtime;
GRANT UPDATE (published_at) ON ops.outbox_events TO hunter_runtime;
GRANT SELECT, INSERT ON ops.consumer_receipts, ops.demo_effects TO hunter_runtime;

-- Supabase's public API roles must not inherit access to internal operations.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA ops FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA ops FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA ops FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ops FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
