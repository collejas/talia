-- Gasto publicitario declarado por campaña inbound de WhatsApp.
-- Es independiente del ledger de mensajes outbound.
CREATE TABLE IF NOT EXISTS public.prospeccion_whatsapp_atribucion_gastos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    canal_publicitario text NOT NULL,
    campana_publicitaria text NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    gasto_real numeric(14,4) NOT NULL,
    moneda text NOT NULL DEFAULT 'MXN'::text,
    estado text NOT NULL DEFAULT 'conciliado'::text,
    proveedor text,
    referencia_externa text,
    notas text,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prospeccion_wa_atrib_gastos_pkey PRIMARY KEY (id),
    CONSTRAINT prospeccion_wa_atrib_gastos_org_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT prospeccion_wa_atrib_gastos_periodo_check
        CHECK (fecha_fin >= fecha_inicio),
    CONSTRAINT prospeccion_wa_atrib_gastos_monto_check
        CHECK (gasto_real >= 0),
    CONSTRAINT prospeccion_wa_atrib_gastos_moneda_check
        CHECK (char_length(moneda) = 3 AND moneda = upper(moneda)),
    CONSTRAINT prospeccion_wa_atrib_gastos_estado_check
        CHECK (estado = ANY (ARRAY['estimado'::text, 'conciliado'::text, 'cancelado'::text])),
    CONSTRAINT prospeccion_wa_atrib_gastos_campaign_period_uq
        UNIQUE (organizacion_id, canal_publicitario, campana_publicitaria, fecha_inicio, fecha_fin)
);

ALTER TABLE ONLY public.prospeccion_whatsapp_atribucion_gastos FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_gastos_org_periodo_idx
    ON public.prospeccion_whatsapp_atribucion_gastos
    USING btree (organizacion_id, fecha_inicio, fecha_fin);

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_gastos_org_campaign_idx
    ON public.prospeccion_whatsapp_atribucion_gastos
    USING btree (organizacion_id, canal_publicitario, campana_publicitaria, estado);

DROP TRIGGER IF EXISTS t_prospeccion_wa_atrib_gastos_set_org
    ON public.prospeccion_whatsapp_atribucion_gastos;
CREATE TRIGGER t_prospeccion_wa_atrib_gastos_set_org
BEFORE INSERT ON public.prospeccion_whatsapp_atribucion_gastos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_prospeccion_wa_atrib_gastos_touch
    ON public.prospeccion_whatsapp_atribucion_gastos;
CREATE TRIGGER t_prospeccion_wa_atrib_gastos_touch
BEFORE UPDATE ON public.prospeccion_whatsapp_atribucion_gastos
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.prospeccion_whatsapp_atribucion_gastos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_whatsapp_atribucion_gastos'
          AND policyname = 'prospeccion_wa_atrib_gastos_admin_all'
    ) THEN
        CREATE POLICY prospeccion_wa_atrib_gastos_admin_all
        ON public.prospeccion_whatsapp_atribucion_gastos
        TO authenticated
        USING (
            public.es_admin(auth.uid())
            AND organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
        WITH CHECK (
            public.es_admin(auth.uid())
            AND organizacion_id = public.usuario_organizacion_id(auth.uid())
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_whatsapp_atribucion_gastos'
          AND policyname = 'prospeccion_wa_atrib_gastos_member_org'
    ) THEN
        CREATE POLICY prospeccion_wa_atrib_gastos_member_org
        ON public.prospeccion_whatsapp_atribucion_gastos
        TO authenticated
        USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
        WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));
    END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.prospeccion_whatsapp_atribucion_gastos
TO authenticated;

COMMENT ON TABLE public.prospeccion_whatsapp_atribucion_gastos IS
'Ledger explícito del gasto publicitario de campañas que originan atribución inbound de WhatsApp; no contiene costos de mensajes outbound.';

COMMENT ON COLUMN public.prospeccion_whatsapp_atribucion_gastos.gasto_real IS
'Importe declarado por la plataforma publicitaria para el periodo de la campaña.';
