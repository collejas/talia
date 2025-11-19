BEGIN;

-- ============================================================================
-- Tipo enumerado para el estado de las cotizaciones
-- ============================================================================

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'lead_cotizacion_estado'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.lead_cotizacion_estado AS ENUM ('borrador', 'enviada', 'aceptada', 'rechazada', 'cancelada');
    END IF;
END;
$$;

GRANT USAGE ON TYPE public.lead_cotizacion_estado TO postgres, service_role, authenticated;

COMMENT ON TYPE public.lead_cotizacion_estado IS 'Estados válidos para el ciclo de vida de una cotización ligada a un lead.';

-- ============================================================================
-- Tabla principal de cotizaciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_cotizaciones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tarjeta_id uuid NOT NULL REFERENCES public.lead_tarjetas(id) ON DELETE CASCADE,
    version integer NOT NULL DEFAULT 1,
    titulo text,
    descripcion text,
    conceptos jsonb NOT NULL DEFAULT '[]'::jsonb,
    subtotal numeric(14,2),
    impuestos numeric(14,2),
    total numeric(14,2),
    moneda char(3) NOT NULL DEFAULT 'MXN',
    valido_hasta date,
    estado public.lead_cotizacion_estado NOT NULL DEFAULT 'borrador',
    canal_envio text,
    enviada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    enviada_en timestamptz,
    aprobada_en timestamptz,
    rechazada_en timestamptz,
    pdf_path text,
    pdf_url text,
    metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_cotizaciones_version_check CHECK (version >= 1),
    CONSTRAINT lead_cotizaciones_subtotal_check CHECK (subtotal IS NULL OR subtotal >= 0),
    CONSTRAINT lead_cotizaciones_impuestos_check CHECK (impuestos IS NULL OR impuestos >= 0),
    CONSTRAINT lead_cotizaciones_total_check CHECK (total IS NULL OR total >= 0),
    CONSTRAINT lead_cotizaciones_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT lead_cotizaciones_canal_check CHECK (
        canal_envio IS NULL
        OR canal_envio = ANY (ARRAY['email','whatsapp','manual','otro'])
    ),
    CONSTRAINT lead_cotizaciones_tarjeta_version_key UNIQUE (tarjeta_id, version)
);

COMMENT ON TABLE public.lead_cotizaciones IS 'Historial de cotizaciones (PDF) asociadas a cada tarjeta de lead.';
COMMENT ON COLUMN public.lead_cotizaciones.tarjeta_id IS 'Referencia a la tarjeta / lead dueño de la cotización.';
COMMENT ON COLUMN public.lead_cotizaciones.version IS 'Número incremental por lead para distinguir iteraciones.';
COMMENT ON COLUMN public.lead_cotizaciones.conceptos IS 'Listado de partidas/servicios incluidos en la propuesta.';
COMMENT ON COLUMN public.lead_cotizaciones.subtotal IS 'Importe antes de impuestos.';
COMMENT ON COLUMN public.lead_cotizaciones.impuestos IS 'Total de impuestos aplicados a la cotización.';
COMMENT ON COLUMN public.lead_cotizaciones.total IS 'Importe total ofrecido al cliente.';
COMMENT ON COLUMN public.lead_cotizaciones.moneda IS 'Moneda ISO-4217 (por defecto MXN).';
COMMENT ON COLUMN public.lead_cotizaciones.estado IS 'Estado del ciclo: borrador, enviada, aceptada, rechazada o cancelada.';
COMMENT ON COLUMN public.lead_cotizaciones.canal_envio IS 'Canal utilizado para compartir la cotización (email, whatsapp, manual, etc.).';
COMMENT ON COLUMN public.lead_cotizaciones.enviada_por IS 'Usuario que ejecutó el envío.';
COMMENT ON COLUMN public.lead_cotizaciones.pdf_path IS 'Ruta interna en el bucket de storage.';
COMMENT ON COLUMN public.lead_cotizaciones.pdf_url IS 'URL pública o firmada para descargar el PDF.';
COMMENT ON COLUMN public.lead_cotizaciones.metadatos IS 'Campos adicionales (firma, términos, hashes, etc.).';

CREATE INDEX IF NOT EXISTS lead_cotizaciones_tarjeta_idx
    ON public.lead_cotizaciones (tarjeta_id, version DESC);

CREATE INDEX IF NOT EXISTS lead_cotizaciones_estado_idx
    ON public.lead_cotizaciones (estado, actualizado_en DESC);

CREATE INDEX IF NOT EXISTS lead_cotizaciones_enviada_en_idx
    ON public.lead_cotizaciones (enviada_en DESC);

ALTER TABLE public.lead_cotizaciones REPLICA IDENTITY FULL;

-- ============================================================================
-- Trigger para mantener actualizado el timestamp
-- ============================================================================

DROP TRIGGER IF EXISTS lead_cotizaciones_touch_updated_at ON public.lead_cotizaciones;
CREATE TRIGGER lead_cotizaciones_touch_updated_at
    BEFORE UPDATE ON public.lead_cotizaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============================================================================
-- Seguridad y políticas RLS
-- ============================================================================

ALTER TABLE public.lead_cotizaciones ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_cotizaciones TO postgres, service_role;
GRANT SELECT ON public.lead_cotizaciones TO authenticated;

DROP POLICY IF EXISTS lead_cotizaciones_admin_all ON public.lead_cotizaciones;
CREATE POLICY lead_cotizaciones_admin_all ON public.lead_cotizaciones
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

DROP POLICY IF EXISTS lead_cotizaciones_select ON public.lead_cotizaciones;
CREATE POLICY lead_cotizaciones_select ON public.lead_cotizaciones
    FOR SELECT TO authenticated
    USING (public.puede_ver_lead(tarjeta_id));

COMMIT;
