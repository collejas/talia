BEGIN;

-- Limpieza administrativa de un contacto originado en WhatsApp.
-- La autorización de usuario vive en el backend; esta función agrega las
-- barreras de negocio dentro de la misma transacción antes de borrar.
CREATE OR REPLACE FUNCTION public.crm_delete_whatsapp_persona_if_safe(
    p_persona_id uuid,
    p_organizacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_persona_exists boolean := false;
    v_clientes integer := 0;
    v_ventas integer := 0;
    v_cotizaciones_aceptadas integer := 0;
    v_reservas_activas integer := 0;
    v_otros_canales integer := 0;
    v_cleanup jsonb := '{}'::jsonb;
    v_cuentas_eliminadas integer := 0;
BEGIN
    IF p_persona_id IS NULL OR p_organizacion_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'identity_required');
    END IF;

    CREATE TEMP TABLE tmp_whatsapp_persona_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
    CREATE TEMP TABLE tmp_whatsapp_accounts (id uuid PRIMARY KEY) ON COMMIT DROP;
    CREATE TEMP TABLE tmp_whatsapp_opportunities (id uuid PRIMARY KEY, organizacion_id uuid NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE tmp_whatsapp_conversations (id uuid PRIMARY KEY, organizacion_id uuid NOT NULL) ON COMMIT DROP;

    INSERT INTO tmp_whatsapp_persona_ids (id)
    SELECT p.id
    FROM public.personas p
    WHERE p.id = p_persona_id
      AND p.organizacion_id = p_organizacion_id;

    SELECT EXISTS (SELECT 1 FROM tmp_whatsapp_persona_ids) INTO v_persona_exists;
    IF NOT v_persona_exists THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'persona_not_found');
    END IF;

    INSERT INTO tmp_whatsapp_persona_ids (id)
    SELECT NULLIF(p.metadata->>'legacy_contacto_id', '')::uuid
    FROM public.personas p
    WHERE p.id = p_persona_id
      AND p.organizacion_id = p_organizacion_id
      AND NULLIF(p.metadata->>'legacy_contacto_id', '') IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO tmp_whatsapp_accounts (id)
    SELECT cp.cuenta_id
    FROM public.cuenta_personas cp
    WHERE cp.organizacion_id = p_organizacion_id
      AND cp.persona_id IN (SELECT id FROM tmp_whatsapp_persona_ids)
      AND cp.cuenta_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO tmp_whatsapp_accounts (id)
    SELECT c.cuenta_id
    FROM public.contactos c
    WHERE c.organizacion_id = p_organizacion_id
      AND c.id IN (SELECT id FROM tmp_whatsapp_persona_ids)
      AND c.cuenta_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO tmp_whatsapp_opportunities (id, organizacion_id)
    SELECT DISTINCT o.id, o.organizacion_id
    FROM public.oportunidades o
    WHERE o.organizacion_id = p_organizacion_id
      AND (
        o.contacto_principal_id IN (SELECT id FROM tmp_whatsapp_persona_ids)
        OR o.persona_id IN (SELECT id FROM tmp_whatsapp_persona_ids)
      );

    SELECT count(*) INTO v_clientes
    FROM public.clientes c
    WHERE c.organizacion_id = p_organizacion_id
      AND (
        c.persona_id IN (SELECT id FROM tmp_whatsapp_persona_ids)
        OR c.contacto_id IN (SELECT id FROM tmp_whatsapp_persona_ids)
        OR c.cuenta_id IN (SELECT id FROM tmp_whatsapp_accounts)
        OR c.oportunidad_id IN (SELECT id FROM tmp_whatsapp_opportunities)
      );

    SELECT count(*) INTO v_ventas
    FROM public.oportunidades o
    JOIN public.etapas_pipeline ep
      ON ep.organizacion_id = o.organizacion_id
     AND ep.id = o.etapa_id
    WHERE o.organizacion_id = p_organizacion_id
      AND o.id IN (SELECT id FROM tmp_whatsapp_opportunities)
      AND (
        lower(coalesce(o.estado, '')) = 'ganada'
        OR lower(coalesce(ep.categoria, '')) = 'ganada'
      );

    SELECT count(*) INTO v_cotizaciones_aceptadas
    FROM public.cotizaciones c
    WHERE c.organizacion_id = p_organizacion_id
      AND lower(coalesce(c.estatus, '')) = 'aceptada'
      AND (
        c.contacto_id IN (SELECT id FROM tmp_whatsapp_persona_ids)
        OR c.cuenta_id IN (SELECT id FROM tmp_whatsapp_accounts)
        OR c.oportunidad_id IN (SELECT id FROM tmp_whatsapp_opportunities)
      );

    SELECT count(*) INTO v_reservas_activas
    FROM public.inventario_reservas ir
    JOIN public.cotizaciones c
      ON c.organizacion_id = ir.organizacion_id
     AND c.id = ir.quote_id
    WHERE ir.organizacion_id = p_organizacion_id
      AND lower(coalesce(ir.estado, '')) = 'activa'
      AND (
        c.contacto_id IN (SELECT id FROM tmp_whatsapp_persona_ids)
        OR c.cuenta_id IN (SELECT id FROM tmp_whatsapp_accounts)
        OR c.oportunidad_id IN (SELECT id FROM tmp_whatsapp_opportunities)
      );

    INSERT INTO tmp_whatsapp_conversations (id, organizacion_id)
    SELECT DISTINCT cv.id, cv.organizacion_id
    FROM public.conversaciones cv
    WHERE cv.organizacion_id = p_organizacion_id
      AND (
        cv.contacto_id IN (SELECT id FROM tmp_whatsapp_persona_ids)
        OR cv.id IN (
            SELECT CASE
                WHEN NULLIF(o.metadata->>'conversation_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN NULLIF(o.metadata->>'conversation_id', '')::uuid
            END
          FROM public.oportunidades o
          WHERE o.id IN (SELECT id FROM tmp_whatsapp_opportunities)
            AND NULLIF(o.metadata->>'conversation_id', '') IS NOT NULL
        )
        OR cv.id IN (
            SELECT CASE
                WHEN NULLIF(o.metadata->>'conversacion_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN NULLIF(o.metadata->>'conversacion_id', '')::uuid
            END
          FROM public.oportunidades o
          WHERE o.id IN (SELECT id FROM tmp_whatsapp_opportunities)
            AND NULLIF(o.metadata->>'conversacion_id', '') IS NOT NULL
        )
      );

    SELECT count(*) INTO v_otros_canales
    FROM tmp_whatsapp_conversations cv
    WHERE coalesce(
      NULLIF(
        (
          SELECT lower(coalesce(m.datos->>'channel', m.datos->>'canal', ''))
          FROM public.mensajes m
          WHERE m.organizacion_id = cv.organizacion_id
            AND m.conversacion_id = cv.id
          ORDER BY m.creado_en DESC
          LIMIT 1
        ),
        ''
      ),
      lower(coalesce((SELECT c.canal FROM public.conversaciones c WHERE c.id = cv.id), ''))
    ) <> 'whatsapp';

    IF v_clientes > 0 OR v_ventas > 0 OR v_cotizaciones_aceptadas > 0 OR v_reservas_activas > 0 OR v_otros_canales > 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'reason', CASE
                WHEN v_clientes > 0 THEN 'client_exists'
                WHEN v_ventas > 0 THEN 'sale_exists'
                WHEN v_cotizaciones_aceptadas > 0 THEN 'accepted_quote_exists'
                WHEN v_reservas_activas > 0 THEN 'active_inventory_reservation_exists'
                ELSE 'other_channel_conversation_exists'
            END,
            'blocked', jsonb_build_object(
                'clientes', v_clientes,
                'ventas', v_ventas,
                'cotizaciones_aceptadas', v_cotizaciones_aceptadas,
                'reservas_activas', v_reservas_activas,
                'otros_canales', v_otros_canales
            )
        );
    END IF;

    v_cleanup := public.crm_delete_persona_physical(p_persona_id, p_organizacion_id);

    DELETE FROM public.cuentas c
    WHERE c.organizacion_id = p_organizacion_id
      AND c.id IN (SELECT id FROM tmp_whatsapp_accounts)
      AND NOT EXISTS (
        SELECT 1 FROM public.cuenta_personas cp
        WHERE cp.organizacion_id = c.organizacion_id AND cp.cuenta_id = c.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.contactos ct
        WHERE ct.organizacion_id = c.organizacion_id AND ct.cuenta_id = c.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.oportunidades o
        WHERE o.organizacion_id = c.organizacion_id AND o.cuenta_id = c.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cotizaciones q
        WHERE q.organizacion_id = c.organizacion_id AND q.cuenta_id = c.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.clientes cl
        WHERE cl.organizacion_id = c.organizacion_id AND cl.cuenta_id = c.id
      );
    GET DIAGNOSTICS v_cuentas_eliminadas = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true,
        'persona_id', p_persona_id,
        'organizacion_id', p_organizacion_id,
        'cuentas_eliminadas', v_cuentas_eliminadas,
        'cleanup', v_cleanup
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_delete_whatsapp_persona_if_safe(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_delete_whatsapp_persona_if_safe(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.crm_delete_whatsapp_persona_if_safe(uuid, uuid) IS
'Limpieza física administrativa de un contacto WhatsApp. Bloquea clientes, ventas ganadas, cotizaciones aceptadas, reservas activas y conversaciones de otros canales; elimina la empresa solo si queda sin relaciones.';

COMMIT;
