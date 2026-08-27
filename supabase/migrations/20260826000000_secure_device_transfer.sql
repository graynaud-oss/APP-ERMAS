-- V15: transfer the single active device authorization from Safari to the iOS PWA.
-- This migration does not modify initialize_own_device_token, profiles data,
-- device_enrollment_allowed, existing RLS policies, or existing profile grants.

BEGIN;

CREATE TABLE public.device_transfer_tickets (
    id uuid PRIMARY KEY DEFAULT (pg_catalog.encode(extensions.gen_random_bytes(16), 'hex')::uuid),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ticket_hash text NOT NULL,
    source_device_token_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz NULL,
    CONSTRAINT device_transfer_tickets_ticket_hash_format
        CHECK (ticket_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT device_transfer_tickets_source_hash_format
        CHECK (source_device_token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT device_transfer_tickets_expiry_after_creation
        CHECK (expires_at > created_at)
);

ALTER TABLE public.device_transfer_tickets OWNER TO postgres;

CREATE INDEX device_transfer_tickets_user_id_idx
    ON public.device_transfer_tickets (user_id);

CREATE UNIQUE INDEX device_transfer_tickets_ticket_hash_idx
    ON public.device_transfer_tickets (ticket_hash);

ALTER TABLE public.device_transfer_tickets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.device_transfer_tickets
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_device_transfer_ticket(p_current_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
    v_device_token text;
    v_blocage text;
    v_ticket text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN 'NOT_AUTHENTICATED';
    END IF;

    IF p_current_token IS NULL OR p_current_token !~ '^dev_[0-9a-f]{64}$' THEN
        RETURN 'INVALID_TOKEN';
    END IF;

    SELECT p.device_token, p.blocage
      INTO v_device_token, v_blocage
      FROM public.profiles AS p
     WHERE p.id = v_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'PROFILE_NOT_FOUND';
    END IF;

    IF pg_catalog.lower(
           pg_catalog.btrim(coalesce(v_blocage, ''))
       ) <> 'non'
       OR v_device_token IS NULL
       OR v_device_token IS DISTINCT FROM p_current_token THEN
        RETURN 'TRANSFER_NOT_ALLOWED';
    END IF;

    UPDATE public.device_transfer_tickets
       SET used_at = pg_catalog.now()
     WHERE user_id = v_user_id
       AND used_at IS NULL
       AND expires_at > pg_catalog.now();

    v_ticket := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

    INSERT INTO public.device_transfer_tickets (
        user_id,
        ticket_hash,
        source_device_token_hash,
        expires_at
    ) VALUES (
        v_user_id,
        pg_catalog.encode(extensions.digest(v_ticket, 'sha256'), 'hex'),
        pg_catalog.encode(extensions.digest(v_device_token, 'sha256'), 'hex'),
        pg_catalog.now() + pg_catalog.make_interval(mins => 10)
    );

    RETURN v_ticket;
END;
$function$;

ALTER FUNCTION public.create_device_transfer_ticket(text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.claim_device_transfer_ticket(
    p_ticket text,
    p_new_device_token text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
    v_device_token text;
    v_blocage text;
    v_ticket_hash text;
    v_ticket public.device_transfer_tickets%ROWTYPE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN 'NOT_AUTHENTICATED';
    END IF;

    IF p_new_device_token IS NULL
       OR p_new_device_token !~ '^dev_[0-9a-f]{64}$' THEN
        RETURN 'INVALID_TOKEN';
    END IF;

    IF p_ticket IS NULL OR p_ticket !~ '^[0-9a-f]{64}$' THEN
        RETURN 'INVALID_TICKET';
    END IF;

    SELECT p.device_token, p.blocage
      INTO v_device_token, v_blocage
      FROM public.profiles AS p
     WHERE p.id = v_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'PROFILE_NOT_FOUND';
    END IF;

    IF pg_catalog.lower(
           pg_catalog.btrim(coalesce(v_blocage, ''))
       ) <> 'non'
       OR v_device_token IS NULL THEN
        RETURN 'TRANSFER_NOT_ALLOWED';
    END IF;

    IF p_new_device_token = v_device_token THEN
        RETURN 'INVALID_TOKEN';
    END IF;

    v_ticket_hash := pg_catalog.encode(extensions.digest(p_ticket, 'sha256'), 'hex');

    SELECT t.*
      INTO v_ticket
      FROM public.device_transfer_tickets AS t
     WHERE t.user_id = v_user_id
       AND t.ticket_hash = v_ticket_hash
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'INVALID_TICKET';
    END IF;

    IF v_ticket.used_at IS NOT NULL THEN
        RETURN 'USED_TICKET';
    END IF;

    IF v_ticket.expires_at <= pg_catalog.now() THEN
        RETURN 'EXPIRED_TICKET';
    END IF;

    IF v_ticket.source_device_token_hash IS DISTINCT FROM
       pg_catalog.encode(extensions.digest(v_device_token, 'sha256'), 'hex') THEN
        RETURN 'SOURCE_DEVICE_CHANGED';
    END IF;

    UPDATE public.profiles
       SET device_token = p_new_device_token
     WHERE id = v_user_id;

    UPDATE public.device_transfer_tickets
       SET used_at = pg_catalog.now()
     WHERE id = v_ticket.id;

    RETURN 'TRANSFERRED';
END;
$function$;

ALTER FUNCTION public.claim_device_transfer_ticket(text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_device_transfer_ticket(text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_device_transfer_ticket(text, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_device_transfer_ticket(text)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_device_transfer_ticket(text, text)
TO authenticated;

COMMIT;
