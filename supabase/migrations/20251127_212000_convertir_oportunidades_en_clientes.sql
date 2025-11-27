BEGIN;

DROP FUNCTION IF EXISTS public.convertir_lead_en_cliente(uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_cliente_from_lead(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_cliente_from_oportunidad(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.ensure_cliente_from_oportunidad(
    p_oportunidad_id uuid
)
RETURNS public.clientes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_op public.oportunidades%ROWTYPE;
    v_categoria text;
    v_cliente public.clientes%ROWTYPE;
    v_tablero uuid;
    v_fuente text;
    v_metadata jsonb;
BEGIN
    SELECT *
      INTO v_op
      FROM public.oportunidades
     WHERE id = p_oportunidad_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'oportunidad_no_encontrada';
    END IF;

    SELECT lower(coalesce(categoria, ''))
      INTO v_categoria
      FROM public.etapas_pipeline
     WHERE id = v_op.etapa_id
     LIMIT 1;

    IF v_op.etapa_id IS NOT NULL AND v_categoria IS NULL THEN
        RAISE EXCEPTION 'etapa_no_encontrada';
    END IF;

    IF coalesce(v_categoria, '') <> 'ganada'
       AND lower(coalesce(v_op.estado, '')) <> 'ganada' THEN
        RETURN NULL;
    END IF;

    IF v_op.contacto_principal_id IS NULL THEN
        RAISE EXCEPTION 'oportunidad_sin_contacto';
    END IF;

    IF v_op.cuenta_id IS NULL THEN
        RAISE EXCEPTION 'oportunidad_sin_cuenta';
    END IF;

    v_tablero := NULL;
    IF v_op.metadata ? 'tablero_id' THEN
        BEGIN
            v_tablero := nullif(v_op.metadata ->> 'tablero_id', '')::uuid;
        EXCEPTION
            WHEN invalid_text_representation THEN
                v_tablero := NULL;
        END;
    END IF;

    v_fuente := COALESCE(
        v_op.metadata ->> 'fuente',
        v_op.metadata ->> 'lead_source',
        v_op.metadata ->> 'origen',
        'pipeline'
    );

    v_metadata := COALESCE(v_op.metadata, '{}'::jsonb) || jsonb_build_object(
        'oportunidad_id', v_op.id,
        'oportunidad_estado', v_op.estado
    );

    INSERT INTO public.clientes (
        contacto_id,
        oportunidad_id,
        cuenta_id,
        organizacion_id,
        tablero_id,
        etapa_id,
        monto_estimado,
        moneda,
        fuente,
        metadatos,
        ganado_en
    )
    VALUES (
        v_op.contacto_principal_id,
        v_op.id,
        v_op.cuenta_id,
        v_op.organizacion_id,
        v_tablero,
        v_op.etapa_id,
        v_op.monto_estimado,
        v_op.moneda,
        v_fuente,
        v_metadata,
        COALESCE(v_op.cerrado_en, now())
    )
    ON CONFLICT (contacto_id) DO UPDATE
        SET oportunidad_id = EXCLUDED.oportunidad_id,
            cuenta_id = EXCLUDED.cuenta_id,
            organizacion_id = EXCLUDED.organizacion_id,
            tablero_id = COALESCE(EXCLUDED.tablero_id, public.clientes.tablero_id),
            etapa_id = EXCLUDED.etapa_id,
            monto_estimado = COALESCE(EXCLUDED.monto_estimado, public.clientes.monto_estimado),
            moneda = COALESCE(EXCLUDED.moneda, public.clientes.moneda),
            fuente = COALESCE(EXCLUDED.fuente, public.clientes.fuente),
            metadatos = public.clientes.metadatos || jsonb_build_object('ultimo_oportunidad', EXCLUDED.oportunidad_id),
            ganado_en = COALESCE(public.clientes.ganado_en, EXCLUDED.ganado_en),
            actualizado_en = now()
    RETURNING * INTO v_cliente;

    RETURN v_cliente;
END;
$$;

COMMENT ON FUNCTION public.ensure_cliente_from_oportunidad(uuid)
    IS 'Crea o actualiza un cliente a partir de una oportunidad ganada del nuevo CRM.';

GRANT EXECUTE ON FUNCTION public.ensure_cliente_from_oportunidad(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_cliente_from_lead(
    p_tarjeta_id uuid
)
RETURNS public.clientes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
    RETURN public.ensure_cliente_from_oportunidad(p_tarjeta_id);
END;
$$;

COMMENT ON FUNCTION public.ensure_cliente_from_lead(uuid)
    IS 'Compatibilidad: redirige al nuevo flujo basado en oportunidades.';

GRANT EXECUTE ON FUNCTION public.ensure_cliente_from_lead(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.convertir_lead_en_cliente(
    p_tarjeta_id uuid,
    p_forzar boolean DEFAULT false
)
RETURNS public.clientes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_categoria text;
    v_estado text;
BEGIN
    SELECT
        lower(coalesce(ep.categoria, '')),
        lower(coalesce(o.estado, ''))
      INTO v_categoria, v_estado
      FROM public.oportunidades o
      LEFT JOIN public.etapas_pipeline ep ON ep.id = o.etapa_id
     WHERE o.id = p_tarjeta_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'oportunidad_no_encontrada';
    END IF;

    IF NOT p_forzar
       AND coalesce(v_categoria, '') <> 'ganada'
       AND coalesce(v_estado, '') <> 'ganada' THEN
        RAISE EXCEPTION 'oportunidad_no_ganada';
    END IF;

    RETURN public.ensure_cliente_from_oportunidad(p_tarjeta_id);
END;
$$;

COMMENT ON FUNCTION public.convertir_lead_en_cliente(uuid, boolean)
    IS 'Forza la creación de un cliente a partir de una oportunidad ganada del CRM.';

GRANT EXECUTE ON FUNCTION public.convertir_lead_en_cliente(uuid, boolean) TO authenticated, service_role;

COMMIT;
