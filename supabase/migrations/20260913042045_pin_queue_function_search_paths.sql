-- Pin the trusted path of pg-boss's private, invoker-rights helpers.
-- Never edit the already-applied vendor construction migration.
DO $$
DECLARE helper record;
BEGIN
  FOR helper IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ops' AND p.proname IN
      ('job_table_format', 'job_table_run', 'job_table_run_async', 'create_queue', 'delete_queue')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog, ops', helper.signature);
  END LOOP;
END $$;
