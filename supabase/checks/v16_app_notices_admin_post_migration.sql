-- READ ONLY post-migration controls for V16.

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('app_admins', 'app_notices', 'app_notice_reads')
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('app_admins', 'app_notices', 'app_notice_reads')
ORDER BY tablename, policyname;

SELECT
    p.oid::pg_catalog.regprocedure::text AS function_signature,
    p.prosecdef AS security_definer,
    p.proconfig AS function_config,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_current_user_admin', 'set_app_notice_updated_at')
ORDER BY p.proname;

SELECT grantee, table_name, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('app_admins', 'app_notices', 'app_notice_reads')
ORDER BY table_name, grantee, privilege_type;

SELECT grantee, table_name, column_name, privilege_type, is_grantable
FROM information_schema.role_column_grants
WHERE table_schema = 'public'
  AND table_name IN ('app_admins', 'app_notices', 'app_notice_reads')
ORDER BY table_name, grantee, column_name, privilege_type;

SELECT
    (SELECT pg_catalog.count(*) FROM public.app_admins) AS total_admins,
    (SELECT pg_catalog.count(*) FROM public.app_notices) AS total_notices,
    (SELECT pg_catalog.count(*) FROM public.app_notice_reads) AS total_reads;
