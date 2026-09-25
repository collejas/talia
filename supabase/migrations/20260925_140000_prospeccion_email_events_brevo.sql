-- Eventos de correo de proveedores legacy. Los campos usados para métricas,
-- deduplicación y relación con Prospección son explícitos; payload solo conserva
-- atributos variables del proveedor para auditoría técnica.
CREATE TABLE IF NOT EXISTS public.prospeccion_correo_eventos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    envio_id uuid REFERENCES public.prospeccion_contacto_envio(id) ON DELETE SET NULL,
    proveedor text NOT NULL,
    mensaje_id text NOT NULL,
    tipo_evento text NOT NULL,
    estado_normalizado text NOT NULL,
    correo_destino text,
    ocurrido_en timestamptz NOT NULL,
    recibido_en timestamptz NOT NULL DEFAULT now(),
    proveedor_evento_id text,
    codigo_error text,
    detalle_error text,
    etiqueta text,
    plantilla_proveedor_id integer,
    url_clic text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT prospeccion_correo_eventos_proveedor_check CHECK (proveedor IN ('brevo', 'postmark')),
    CONSTRAINT prospeccion_correo_eventos_tipo_check CHECK (length(btrim(tipo_evento)) > 0),
    CONSTRAINT prospeccion_correo_eventos_mensaje_check CHECK (length(btrim(mensaje_id)) > 0),
    CONSTRAINT prospeccion_correo_eventos_unique UNIQUE (organizacion_id, proveedor, mensaje_id, tipo_evento, ocurrido_en)
);

CREATE INDEX IF NOT EXISTS prospeccion_correo_eventos_org_fecha_idx
    ON public.prospeccion_correo_eventos (organizacion_id, ocurrido_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_correo_eventos_org_envio_idx
    ON public.prospeccion_correo_eventos (organizacion_id, envio_id, tipo_evento, ocurrido_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_correo_eventos_org_mensaje_idx
    ON public.prospeccion_correo_eventos (organizacion_id, proveedor, mensaje_id, ocurrido_en DESC);

ALTER TABLE public.prospeccion_correo_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospeccion_correo_eventos FROM PUBLIC;
REVOKE ALL ON public.prospeccion_correo_eventos FROM authenticated;
GRANT ALL ON public.prospeccion_correo_eventos TO service_role;
