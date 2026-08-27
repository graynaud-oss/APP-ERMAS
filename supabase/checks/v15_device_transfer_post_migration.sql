-- READ ONLY post-migration controls for V15. Run only after the migration.

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'device_transfer_tickets';

SELECT
    ordinal_position,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'device_transfer_tickets'
ORDER BY ordinal_position;

SELECT
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
  AND rel.relname = 'device_transfer_tickets'
ORDER BY con.conname;

SELECT
    indexname,
    indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'device_transfer_tickets'
ORDER BY indexname;

SELECT
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'device_transfer_tickets'
ORDER BY grantee, privilege_type;

SELECT
    schemaname,
    tablename,
    policyname,
    roles,
    cmd,
    qual,
    with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename = 'device_transfer_tickets';

SELECT
    p.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    p.proconfig AS configuration,
    p.proacl AS acl,
    pg_catalog.pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_device_transfer_ticket', 'claim_device_transfer_ticket')
ORDER BY p.proname;

SELECT
    r.rolname,
    pg_catalog.has_function_privilege(
        r.rolname,
        'public.create_device_transfer_ticket(text)',
        'EXECUTE'
    ) AS can_create_ticket,
    pg_catalog.has_function_privilege(
        r.rolname,
        'public.claim_device_transfer_ticket(text,text)',
        'EXECUTE'
    ) AS can_claim_ticket,
    pg_catalog.has_table_privilege(
        r.rolname,
        'public.device_transfer_tickets',
        'SELECT,INSERT,UPDATE,DELETE'
    ) AS has_any_direct_ticket_table_access
FROM pg_catalog.pg_roles AS r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY r.rolname;
