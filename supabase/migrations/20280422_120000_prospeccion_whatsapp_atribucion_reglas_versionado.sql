ALTER TABLE public.prospeccion_whatsapp_atribucion_reglas
    ADD COLUMN IF NOT EXISTS parent_regla_id uuid,
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS vigente_desde timestamp with time zone NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS vigente_hasta timestamp with time zone;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_whatsapp_atribucion_reglas_parent_fkey'
    ) THEN
        ALTER TABLE public.prospeccion_whatsapp_atribucion_reglas
            ADD CONSTRAINT prospeccion_whatsapp_atribucion_reglas_parent_fkey
            FOREIGN KEY (parent_regla_id)
            REFERENCES public.prospeccion_whatsapp_atribucion_reglas(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_whatsapp_atribucion_reglas_version_check'
    ) THEN
        ALTER TABLE public.prospeccion_whatsapp_atribucion_reglas
            ADD CONSTRAINT prospeccion_whatsapp_atribucion_reglas_version_check
            CHECK (version >= 1);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_whatsapp_atribucion_reglas_vigencia_check'
    ) THEN
        ALTER TABLE public.prospeccion_whatsapp_atribucion_reglas
            ADD CONSTRAINT prospeccion_whatsapp_atribucion_reglas_vigencia_check
            CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_reglas_org_vigente_idx
    ON public.prospeccion_whatsapp_atribucion_reglas
    USING btree (organizacion_id, vigente_hasta, activo, prioridad ASC, creado_en ASC);

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_reglas_org_parent_version_idx
    ON public.prospeccion_whatsapp_atribucion_reglas
    USING btree (organizacion_id, parent_regla_id, version DESC);

COMMENT ON COLUMN public.prospeccion_whatsapp_atribucion_reglas.parent_regla_id IS
'Identificador de la línea de versión de la regla. NULL en reglas antiguas sin versionado explícito.';

COMMENT ON COLUMN public.prospeccion_whatsapp_atribucion_reglas.version IS
'Número de versión de la regla dentro de su línea de historial.';

COMMENT ON COLUMN public.prospeccion_whatsapp_atribucion_reglas.vigente_desde IS
'Fecha/hora desde la que la versión de la regla entra en vigor.';

COMMENT ON COLUMN public.prospeccion_whatsapp_atribucion_reglas.vigente_hasta IS
'Fecha/hora de cierre de vigencia; NULL indica versión vigente.';

