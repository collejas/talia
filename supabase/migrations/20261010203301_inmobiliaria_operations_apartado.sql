BEGIN;

-- Operación inmobiliaria central. La unidad conserva únicamente su
-- disponibilidad actual; la operación conserva el contexto y el historial.
CREATE TABLE IF NOT EXISTS public.operaciones_inmobiliarias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    unidad_id uuid NOT NULL REFERENCES public.propiedad_unidades(id) ON DELETE RESTRICT,
    oportunidad_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
    cliente_principal_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE RESTRICT,
    agente_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    estado text NOT NULL DEFAULT 'apartada'
        CHECK (estado IN ('apartada', 'reservada', 'vendida', 'cancelada')),
    apartado_horas smallint NOT NULL DEFAULT 48
        CHECK (apartado_horas IN (24, 48, 72)),
    apartado_iniciado_en timestamptz,
    apartado_vencimiento_en timestamptz,
    apartado_motivo text,
    forma_adquisicion text NOT NULL DEFAULT 'por_definir'
        CHECK (forma_adquisicion IN (
            'contado', 'credito', 'mixto', 'otro', 'por_definir'
        )),
    precio_ofrecido numeric(18, 2) CHECK (precio_ofrecido IS NULL OR precio_ofrecido >= 0),
    precio_acordado numeric(18, 2) CHECK (precio_acordado IS NULL OR precio_acordado >= 0),
    precio_final numeric(18, 2) CHECK (precio_final IS NULL OR precio_final >= 0),
    moneda character(3) NOT NULL DEFAULT 'MXN',
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    cancelada_en timestamptz,
    cancelada_por uuid,
    motivo_cancelacion text,
    CONSTRAINT operaciones_inmobiliarias_apartado_dates_chk CHECK (
        estado <> 'apartada'
        OR (apartado_iniciado_en IS NOT NULL AND apartado_vencimiento_en IS NOT NULL
            AND apartado_vencimiento_en > apartado_iniciado_en)
    ),
    CONSTRAINT operaciones_inmobiliarias_cancelacion_chk CHECK (
        estado <> 'cancelada'
        OR cancelada_en IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_org_unidad_idx
    ON public.operaciones_inmobiliarias (organizacion_id, unidad_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_org_cliente_idx
    ON public.operaciones_inmobiliarias (organizacion_id, cliente_principal_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS operaciones_inmobiliarias_apartados_vencimiento_idx
    ON public.operaciones_inmobiliarias (organizacion_id, apartado_vencimiento_en)
    WHERE estado = 'apartada';

CREATE UNIQUE INDEX IF NOT EXISTS operaciones_inmobiliarias_unidad_activa_uidx
    ON public.operaciones_inmobiliarias (organizacion_id, unidad_id)
    WHERE estado IN ('apartada', 'reservada');

COMMENT ON TABLE public.operaciones_inmobiliarias
    IS 'Fuente de verdad del historial y contexto de operaciones inmobiliarias.';

COMMENT ON COLUMN public.operaciones_inmobiliarias.forma_adquisicion
    IS 'Forma simplificada capturada en la interfaz; el expediente financiero puede detallar sus fuentes.';

ALTER TABLE public.operaciones_inmobiliarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operaciones_inmobiliarias FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.operaciones_inmobiliarias FROM anon;
REVOKE ALL ON public.operaciones_inmobiliarias FROM authenticated;
GRANT SELECT ON public.operaciones_inmobiliarias TO authenticated;

DROP POLICY IF EXISTS operaciones_inmobiliarias_admin_select ON public.operaciones_inmobiliarias;
DROP POLICY IF EXISTS operaciones_inmobiliarias_member_select ON public.operaciones_inmobiliarias;

CREATE POLICY operaciones_inmobiliarias_admin_select
    ON public.operaciones_inmobiliarias
    FOR SELECT TO authenticated
    USING (
        public.es_admin(auth.uid())
        AND organizacion_id = public.usuario_organizacion_id(auth.uid())
    );

CREATE POLICY operaciones_inmobiliarias_member_select
    ON public.operaciones_inmobiliarias
    FOR SELECT TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- Aparta una unidad y crea la operación dentro de una sola transacción.
CREATE OR REPLACE FUNCTION public.crm_apartar_propiedad(
    p_organizacion_id uuid,
    p_unidad_id uuid,
    p_cliente_principal_id uuid,
    p_agente_usuario_id uuid DEFAULT NULL,
    p_oportunidad_id uuid DEFAULT NULL,
    p_apartado_horas smallint DEFAULT 48,
    p_forma_adquisicion text DEFAULT 'por_definir',
    p_apartado_motivo text DEFAULT NULL,
    p_precio_ofrecido numeric DEFAULT NULL,
    p_moneda text DEFAULT 'MXN'
)
RETURNS TABLE (
    operacion_id uuid,
    unidad_id uuid,
    estado text,
    apartado_iniciado_en timestamptz,
    apartado_vencimiento_en timestamptz,
    cliente_principal_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_unidad public.propiedad_unidades%ROWTYPE;
    v_persona public.personas%ROWTYPE;
    v_now timestamptz := now();
    v_operation public.operaciones_inmobiliarias%ROWTYPE;
    v_forma text := lower(coalesce(nullif(btrim(p_forma_adquisicion), ''), 'por_definir'));
    v_moneda text := upper(coalesce(nullif(btrim(p_moneda), ''), 'MXN'));
BEGIN
    IF auth.uid() IS NOT NULL
       AND p_organizacion_id IS DISTINCT FROM public.usuario_organizacion_id(auth.uid()) THEN
        RAISE EXCEPTION 'property_operation_organization_forbidden' USING ERRCODE = '42501';
    END IF;

    IF p_apartado_horas NOT IN (24, 48, 72) THEN
        RAISE EXCEPTION 'property_apartado_hours_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF v_forma NOT IN ('contado', 'credito', 'mixto', 'otro', 'por_definir') THEN
        RAISE EXCEPTION 'property_acquisition_method_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF length(v_moneda) <> 3 THEN
        RAISE EXCEPTION 'property_currency_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF nullif(btrim(coalesce(p_apartado_motivo, '')), '') IS NULL THEN
        RAISE EXCEPTION 'property_apartado_reason_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_unidad
      FROM public.propiedad_unidades
     WHERE id = p_unidad_id
       AND status = 'disponible'::public.propiedad_status
       AND EXISTS (
           SELECT 1
             FROM public.propiedad_capas c
             JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = propiedad_unidades.nivel_id
              AND d.organizacion_id = p_organizacion_id
       )
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_unit_not_available' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_persona
      FROM public.personas
     WHERE id = p_cliente_principal_id
       AND organizacion_id = p_organizacion_id
       AND archived_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'property_client_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF p_oportunidad_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.oportunidades o
         WHERE o.id = p_oportunidad_id AND o.organizacion_id = p_organizacion_id
    ) THEN
        RAISE EXCEPTION 'property_opportunity_not_found' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.operaciones_inmobiliarias (
        organizacion_id, unidad_id, oportunidad_id, cliente_principal_id,
        agente_usuario_id, estado, apartado_horas, apartado_iniciado_en,
        apartado_vencimiento_en, apartado_motivo, forma_adquisicion,
        precio_ofrecido, moneda
    ) VALUES (
        p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id,
        p_agente_usuario_id, 'apartada', p_apartado_horas, v_now,
        v_now + make_interval(hours => p_apartado_horas),
        btrim(p_apartado_motivo), v_forma, p_precio_ofrecido, v_moneda
    )
    RETURNING * INTO v_operation;

    UPDATE public.propiedad_unidades
       SET status = 'apartado'::public.propiedad_status,
           oportunidad_id = COALESCE(p_oportunidad_id, oportunidad_id),
           actualizado_en = now()
     WHERE id = p_unidad_id;

    INSERT INTO public.propiedad_unidad_movimientos (
        organizacion_id, unidad_id, oportunidad_id, persona_id,
        estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
    ) VALUES (
        p_organizacion_id, p_unidad_id, p_oportunidad_id, p_cliente_principal_id,
        'disponible'::public.propiedad_status, 'apartado'::public.propiedad_status,
        COALESCE(p_precio_ofrecido, v_unidad.precio), v_moneda,
        'apartado_inmobiliario', p_agente_usuario_id
    );

    RETURN QUERY SELECT v_operation.id, v_operation.unidad_id, v_operation.estado,
                        v_operation.apartado_iniciado_en,
                        v_operation.apartado_vencimiento_en,
                        v_operation.cliente_principal_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_apartar_propiedad(uuid, uuid, uuid, uuid, uuid, smallint, text, text, numeric, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_apartar_propiedad(uuid, uuid, uuid, uuid, uuid, smallint, text, text, numeric, text)
    TO authenticated, service_role;

COMMIT;
