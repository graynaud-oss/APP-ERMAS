-- V16: server-owned administrator roles and internal ERMAS notices.
-- Additive only: profiles, device tokens, enrollment and V15 transfers are unchanged.

BEGIN;

CREATE TABLE public.app_admins (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    granted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_admins OWNER TO postgres;
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_admins FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM public.app_admins AS admins
             WHERE admins.user_id = auth.uid()
       );
$function$;

ALTER FUNCTION public.is_current_user_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_current_user_admin()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

CREATE TABLE public.app_notices (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    starts_at timestamptz NULL,
    ends_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    created_by uuid NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT app_notices_title_not_blank CHECK (pg_catalog.btrim(title) <> ''),
    CONSTRAINT app_notices_message_not_blank CHECK (pg_catalog.btrim(message) <> ''),
    CONSTRAINT app_notices_type_allowed CHECK (type IN ('information', 'important', 'maintenance')),
    CONSTRAINT app_notices_dates_order CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at)
);

ALTER TABLE public.app_notices OWNER TO postgres;
CREATE INDEX app_notices_publication_idx
    ON public.app_notices (active, starts_at, ends_at, created_at DESC);
ALTER TABLE public.app_notices ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.set_app_notice_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$function$;

ALTER FUNCTION public.set_app_notice_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_app_notice_updated_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER app_notices_set_updated_at
BEFORE UPDATE ON public.app_notices
FOR EACH ROW EXECUTE FUNCTION public.set_app_notice_updated_at();

CREATE POLICY app_notices_select_authenticated
ON public.app_notices
FOR SELECT
TO authenticated
USING (
    public.is_current_user_admin()
    OR (
        active = true
        AND (starts_at IS NULL OR starts_at <= pg_catalog.now())
        AND (ends_at IS NULL OR ends_at >= pg_catalog.now())
    )
);

CREATE POLICY app_notices_insert_admin
ON public.app_notices
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_current_user_admin()
    AND created_by = auth.uid()
);

CREATE POLICY app_notices_update_admin
ON public.app_notices
FOR UPDATE
TO authenticated
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());

CREATE POLICY app_notices_delete_admin
ON public.app_notices
FOR DELETE
TO authenticated
USING (public.is_current_user_admin());

REVOKE ALL ON TABLE public.app_notices FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (id, title, message, type, active, starts_at, ends_at, created_at, updated_at)
ON public.app_notices TO authenticated;
GRANT INSERT (title, message, type, active, starts_at, ends_at)
ON public.app_notices TO authenticated;
GRANT UPDATE (title, message, type, active, starts_at, ends_at)
ON public.app_notices TO authenticated;
GRANT DELETE ON TABLE public.app_notices TO authenticated;

CREATE TABLE public.app_notice_reads (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notice_id uuid NOT NULL REFERENCES public.app_notices(id) ON DELETE CASCADE,
    read_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    PRIMARY KEY (user_id, notice_id)
);

ALTER TABLE public.app_notice_reads OWNER TO postgres;
CREATE INDEX app_notice_reads_notice_id_idx ON public.app_notice_reads (notice_id);
ALTER TABLE public.app_notice_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_notice_reads_select_own
ON public.app_notice_reads
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY app_notice_reads_insert_own
ON public.app_notice_reads
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1
          FROM public.app_notices AS notice
         WHERE notice.id = notice_id
    )
);

REVOKE ALL ON TABLE public.app_notice_reads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (user_id, notice_id, read_at) ON public.app_notice_reads TO authenticated;
GRANT INSERT (user_id, notice_id) ON public.app_notice_reads TO authenticated;

COMMIT;
