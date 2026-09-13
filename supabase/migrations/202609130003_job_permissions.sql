-- Queue creation/DDL happens only as the migration owner.
SELECT ops.create_queue('foundation-demo', '{
  "policy": "standard", "retryLimit": 10, "retryDelay": 1,
  "retryBackoff": true, "retryDelayMax": 60, "expireInSeconds": 60,
  "retentionSeconds": 86400, "deleteAfterSeconds": 86400, "partition": false
}'::jsonb);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  ops.job, ops.job_common, ops.job_dependency, ops.queue,
  ops.schedule, ops.subscription, ops.warning, ops.queue_stats
  TO hunter_runtime;
GRANT SELECT, UPDATE ON ops.version TO hunter_runtime;
GRANT SELECT ON ops.bam TO hunter_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ops FROM hunter_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ops FROM PUBLIC;
REVOKE ALL ON ops.schema_migrations FROM hunter_runtime;

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
