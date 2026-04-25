BEGIN;

-- Base de identidad y retención para resultados de prospección.
-- Este cambio prepara el terreno para deduplicación global y limpieza segura
-- sin alterar todavía la semántica de las vistas existentes.

ALTER TABLE public.resultados
    ADD COLUMN IF NOT EXISTS dedupe_key text,
    ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS appearances_count integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS archived_at timestamptz,
    ADD COLUMN IF NOT EXISTS retention_until timestamptz;

COMMENT ON COLUMN public.resultados.dedupe_key IS
    'Clave técnica para deduplicacion futura por organizacion/fuente/identidad.';
COMMENT ON COLUMN public.resultados.first_seen_at IS
    'Primera vez que el resultado fue visto o persistido.';
COMMENT ON COLUMN public.resultados.last_seen_at IS
    'Ultima vez que el resultado fue visto o actualizado.';
COMMENT ON COLUMN public.resultados.appearances_count IS
    'Numero de apariciones acumuladas del mismo resultado.';
COMMENT ON COLUMN public.resultados.archived_at IS
    'Marca de archivo para purga o exportacion historica.';
COMMENT ON COLUMN public.resultados.retention_until IS
    'Fecha minima de retencion antes de permitir purga automatica.';

CREATE INDEX IF NOT EXISTS resultados_org_fuente_external_idx
    ON public.resultados (organizacion_id, fuente, external_id)
    WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS resultados_org_fuente_last_seen_idx
    ON public.resultados (organizacion_id, fuente, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS resultados_org_retention_until_idx
    ON public.resultados (organizacion_id, retention_until)
    WHERE retention_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS resultados_org_dedupe_key_idx
    ON public.resultados (organizacion_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.prospeccion_resultado_apariciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    busqueda_id uuid NOT NULL REFERENCES public.busquedas(id) ON DELETE CASCADE,
    resultado_id uuid REFERENCES public.resultados(id) ON DELETE CASCADE,
    prospecto_id uuid REFERENCES public.prospeccion_prospectos(id) ON DELETE SET NULL,
    fuente public.fuente_resultado NOT NULL,
    external_id text,
    dedupe_key text,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    appearances_count integer NOT NULL DEFAULT 1,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospeccion_resultado_apariciones_org_busqueda_idx
    ON public.prospeccion_resultado_apariciones (organizacion_id, busqueda_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS prospeccion_resultado_apariciones_org_prospecto_idx
    ON public.prospeccion_resultado_apariciones (organizacion_id, prospecto_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS prospeccion_resultado_apariciones_org_fuente_external_idx
    ON public.prospeccion_resultado_apariciones (organizacion_id, fuente, external_id)
    WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_resultado_apariciones_org_dedupe_key_idx
    ON public.prospeccion_resultado_apariciones (organizacion_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_resultado_apariciones_busqueda_resultado_uidx
    ON public.prospeccion_resultado_apariciones (organizacion_id, busqueda_id, resultado_id)
    WHERE resultado_id IS NOT NULL;

ALTER TABLE public.prospeccion_resultado_apariciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_resultado_apariciones'
          AND policyname = 'prospeccion_resultado_apariciones_admin_all'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY prospeccion_resultado_apariciones_admin_all
                ON public.prospeccion_resultado_apariciones
                FOR ALL
                TO authenticated
                USING (public.es_admin(auth.uid()))
                WITH CHECK (public.es_admin(auth.uid()))
        $policy$;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_resultado_apariciones'
          AND policyname = 'prospeccion_resultado_apariciones_member_org'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY prospeccion_resultado_apariciones_member_org
                ON public.prospeccion_resultado_apariciones
                FOR ALL
                TO authenticated
                USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
                WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()))
        $policy$;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 't_prospeccion_resultado_apariciones_touch'
    ) THEN
        EXECUTE $trigger$
            CREATE TRIGGER t_prospeccion_resultado_apariciones_touch
                BEFORE UPDATE ON public.prospeccion_resultado_apariciones
                FOR EACH ROW
                EXECUTE FUNCTION public.tg_touch_updated_at()
        $trigger$;
    END IF;
END
$$;

COMMIT;
