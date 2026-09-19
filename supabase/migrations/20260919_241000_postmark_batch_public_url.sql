BEGIN;

-- Completa el contexto bulk con la URL pública usada para tracking y enlaces.
-- La URL es parte del contexto del tenant; se devuelve como texto para que el
-- worker aplique la misma normalización que el resto del runtime.
CREATE OR REPLACE FUNCTION public.worker_get_postmark_batch_context(
    p_organizacion_id uuid,
    p_email_addresses text[] DEFAULT ARRAY[]::text[],
    p_prospecto_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_template_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_email_addresses text[] := COALESCE(p_email_addresses, ARRAY[]::text[]);
    v_prospecto_ids uuid[] := COALESCE(p_prospecto_ids, ARRAY[]::uuid[]);
    v_template_ids uuid[] := COALESCE(p_template_ids, ARRAY[]::uuid[]);
BEGIN
    IF p_organizacion_id IS NULL
       OR cardinality(v_email_addresses) > 500
       OR cardinality(v_prospecto_ids) > 500
       OR cardinality(v_template_ids) > 500 THEN
        RAISE EXCEPTION 'postmark_batch_context_invalid_input'
            USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
        'public_base_url', (
            SELECT COALESCE(o.dominio_principal, o.sitio_web)
            FROM public.organizaciones o
            WHERE o.id = p_organizacion_id
            LIMIT 1
        ),
        'migration', (
            SELECT to_jsonb(x)
            FROM (
                SELECT id, organizacion_id, status, feature_enabled,
                       domain_verified_at, production_enabled_at, validated_at
                FROM public.tenant_email_migrations
                WHERE organizacion_id = p_organizacion_id
                LIMIT 1
            ) x
        ),
        'plan', (
            SELECT to_jsonb(x)
            FROM (
                SELECT id, organizacion_id, plan_code, status, period_unit,
                       period_limit, daily_limit, overage_allowed, starts_at, ends_at
                FROM public.tenant_email_plans
                WHERE organizacion_id = p_organizacion_id
                  AND status = 'active'
                ORDER BY starts_at DESC
                LIMIT 1
            ) x
        ),
        'server', (
            SELECT to_jsonb(x)
            FROM (
                SELECT id, organizacion_id, postmark_server_id, server_name,
                       server_status, transactional_stream, broadcast_stream,
                       inbound_stream, provisioned_at
                FROM public.tenant_email_servers
                WHERE organizacion_id = p_organizacion_id
                  AND server_status <> 'retired'
                LIMIT 1
            ) x
        ),
        'domain', (
            SELECT to_jsonb(x)
            FROM (
                SELECT id, organizacion_id, server_id, domain_name,
                       external_domain_id, status, verified_at,
                       default_from_email, default_from_name, reply_to_email
                FROM public.tenant_email_domains
                WHERE organizacion_id = p_organizacion_id
                  AND status = 'verified'
                LIMIT 1
            ) x
        ),
        'postmark_suppressed_emails', COALESCE((
            SELECT jsonb_agg(lower(s.email_address) ORDER BY lower(s.email_address))
            FROM public.tenant_email_suppressions s
            WHERE s.organizacion_id = p_organizacion_id
              AND s.active = true
              AND lower(s.email_address) = ANY(v_email_addresses)
        ), '[]'::jsonb),
        'crm_suppressions', COALESCE((
            SELECT jsonb_agg(to_jsonb(s) ORDER BY s.prospecto_id, s.id)
            FROM public.prospeccion_contacto_suppressions s
            WHERE s.organizacion_id = p_organizacion_id
              AND s.activo = true
              AND s.prospecto_id = ANY(v_prospecto_ids)
              AND s.canal IN ('correo', 'all')
        ), '[]'::jsonb),
        'template_images', COALESCE((
            SELECT jsonb_object_agg(t.template_id::text, t.context)
            FROM (
                SELECT i.template_id,
                       jsonb_object_agg(i.variable_clave, l.file_url)
                           FILTER (WHERE i.variable_clave IS NOT NULL AND l.file_url IS NOT NULL)
                           AS context
                FROM public.prospeccion_contacto_template_imagenes i
                JOIN public.logos l ON l.id = i.logo_id
                WHERE i.organizacion_id = p_organizacion_id
                  AND i.template_id = ANY(v_template_ids)
                GROUP BY i.template_id
            ) t
        ), '{}'::jsonb)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.worker_get_postmark_batch_context(uuid, text[], uuid[], uuid[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_get_postmark_batch_context(uuid, text[], uuid[], uuid[])
    TO service_role;

COMMIT;
