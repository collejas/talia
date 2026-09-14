BEGIN;

ALTER TABLE public.tenant_email_sync_checkpoints
    ADD COLUMN IF NOT EXISTS provider_filter text NOT NULL DEFAULT 'HardBounce';

ALTER TABLE public.tenant_email_sync_checkpoints
    DROP CONSTRAINT IF EXISTS tenant_email_sync_checkpoints_unique;

ALTER TABLE public.tenant_email_sync_checkpoints
    ADD CONSTRAINT tenant_email_sync_checkpoints_unique
    UNIQUE (organizacion_id, server_id, sync_type, message_stream, provider_filter);

DROP FUNCTION IF EXISTS public.tenant_email_claim_sync_checkpoint(uuid, uuid, text, text, timestamptz, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.tenant_email_claim_sync_checkpoint(
    p_organizacion_id uuid,
    p_server_id uuid,
    p_sync_type text,
    p_message_stream text,
    p_window_from timestamptz,
    p_window_to timestamptz,
    p_lock_timeout_seconds integer DEFAULT 1800,
    p_provider_filter text DEFAULT 'HardBounce'
)
RETURNS SETOF public.tenant_email_sync_checkpoints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_row public.tenant_email_sync_checkpoints;
BEGIN
    INSERT INTO public.tenant_email_sync_checkpoints (
        organizacion_id, server_id, sync_type, message_stream,
        provider_filter, window_from, window_to
    ) VALUES (
        p_organizacion_id, p_server_id, p_sync_type, p_message_stream,
        COALESCE(NULLIF(p_provider_filter, ''), 'HardBounce'), p_window_from, p_window_to
    )
    ON CONFLICT (organizacion_id, server_id, sync_type, message_stream, provider_filter) DO NOTHING;

    UPDATE public.tenant_email_sync_checkpoints
       SET locked_at = now(),
           window_from = p_window_from,
           window_to = p_window_to,
           next_offset = CASE
               WHEN window_from IS DISTINCT FROM p_window_from OR window_to IS DISTINCT FROM p_window_to THEN 0
               ELSE next_offset
           END,
           last_provider_total = CASE
               WHEN window_from IS DISTINCT FROM p_window_from OR window_to IS DISTINCT FROM p_window_to THEN NULL
               ELSE last_provider_total
           END,
           updated_at = now()
     WHERE organizacion_id = p_organizacion_id
       AND server_id = p_server_id
       AND sync_type = p_sync_type
       AND message_stream = p_message_stream
       AND provider_filter = COALESCE(NULLIF(p_provider_filter, ''), 'HardBounce')
       AND (locked_at IS NULL OR locked_at < now() - make_interval(secs => greatest(p_lock_timeout_seconds, 60)))
    RETURNING * INTO v_row;

    IF FOUND THEN
        RETURN NEXT v_row;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_email_claim_sync_checkpoint(uuid, uuid, text, text, timestamptz, timestamptz, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_claim_sync_checkpoint(uuid, uuid, text, text, timestamptz, timestamptz, integer, text) TO service_role;

COMMENT ON COLUMN public.tenant_email_sync_checkpoints.provider_filter IS
    'Filtro del proveedor que define el cursor; permite separar HardBounce, SpamComplaint y Unsubscribe.';

COMMIT;
