BEGIN;

CREATE TABLE IF NOT EXISTS public.prospeccion_prospectos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    busqueda_id uuid REFERENCES public.busquedas(id) ON DELETE CASCADE,
    resultado_id uuid UNIQUE REFERENCES public.resultados(id) ON DELETE SET NULL,
    fuente public.fuente_resultado NOT NULL,
    fuente_busqueda text,
    display_name text NOT NULL,
    name text,
    razon_social text,
    actividad text,
    estrato text,
    phone text,
    phone_e164 text,
    phone_national text,
    carrier_name text,
    carrier_type text,
    email text,
    website text,
    address text,
    lat double precision,
    lng double precision,
    rating numeric,
    distancia_m double precision,
    whatsapp_permitido boolean,
    llamada_permitida boolean,
    lookup_status text DEFAULT 'pendiente',
    lookup_error text,
    segmento text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_busqueda_idx
    ON public.prospeccion_prospectos (busqueda_id, fuente);
CREATE INDEX IF NOT EXISTS prospeccion_prospectos_fuente_idx
    ON public.prospeccion_prospectos (fuente, resultado_id);

ALTER TABLE public.prospeccion_prospectos ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_select_prospeccion_prospectos
    ON public.prospeccion_prospectos
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY p_insert_prospeccion_prospectos
    ON public.prospeccion_prospectos
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY p_update_prospeccion_prospectos
    ON public.prospeccion_prospectos
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE TRIGGER t_prospeccion_prospectos_touch
    BEFORE UPDATE ON public.prospeccion_prospectos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.prospeccion_contactos_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prospecto_id uuid NOT NULL REFERENCES public.prospeccion_prospectos(id) ON DELETE CASCADE,
    canal text NOT NULL,
    accion text,
    estado text NOT NULL DEFAULT 'pendiente',
    detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
    error text,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospeccion_contactos_log_prospecto_idx
    ON public.prospeccion_contactos_log (prospecto_id, canal);

ALTER TABLE public.prospeccion_contactos_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_select_prospeccion_contactos_log
    ON public.prospeccion_contactos_log
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY p_insert_prospeccion_contactos_log
    ON public.prospeccion_contactos_log
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

COMMIT;